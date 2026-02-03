import os
import logging
from datetime import datetime, timedelta
from cdsetool.query import query_features
from cdsetool.download import download_feature
from cdsetool.credentials import Credentials
from cdsetool.monitor import StatusMonitor
from multiprocessing import Manager
import json
import zipfile
import rasterio
from rasterio.enums import Resampling
import numpy as np
from shapely.geometry import shape, box
from shapely.wkt import loads as parse_wkt
from queue import Queue
from threading import Thread, Lock
import shutil
import tempfile

# Set up logging
logger = logging.getLogger(__name__)


def setup_logging(log_level):
    """
    Configure logging based on log level.
    Args:
        log_level (str): Log level ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL').
    """
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    logger.setLevel(numeric_level)

    # Clear existing handlers to avoid duplicate logs
    if logger.hasHandlers():
        logger.handlers.clear()

    # Create both file and console handlers
    log_file = "sentinel2_downloader.log"

    # File handler for logging to file
    file_handler = logging.FileHandler(log_file, mode='a')
    file_handler.setLevel(numeric_level)

    # Console handler for logging to console
    console_handler = logging.StreamHandler()
    console_handler.setLevel(numeric_level)

    # Define a log format
    formatter = logging.Formatter("%(asctime)s %(threadName)s [%(levelname)s] %(message)s")
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    # Add both handlers to the logger
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    logger.info(f"Logging to file: {os.path.abspath(log_file)}")

def create_grid(geometry, cell_size=10.0):
    """
    Create a uniform grid of polygons over the bounding box of the input geometry.
    Args:
        geometry (shapely.geometry.Polygon): Input geometry.
        cell_size (float): Size of each cell in degrees (3').
    Returns:
        list: List of smaller polygons intersecting with the input geometry.
    """
    bounds = geometry.bounds
    minx, miny, maxx, maxy = bounds

    # Create grid cells
    grid_cells = []
    x = minx
    while x < maxx:
        y = miny
        while y < maxy:
            grid_cell = box(x, y, x + cell_size, y + cell_size)
            grid_cells.append(grid_cell)
            y += cell_size
        x += cell_size

    # Split geometry with the grid and retain intersections
    sub_geometries = [geometry.intersection(cell) for cell in grid_cells if geometry.intersects(cell)]
    return sub_geometries

def split_date_range(start_date, end_date):
    """
    Split a large date range into smaller daily date ranges.
    Args:
        start_date (str): Start date in 'yyyy-mm-dd' format.
        end_date (str): End date in 'yyyy-mm-dd' format.
    Returns:
        list of tuples: List of date strings for each day.
    """
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    ranges = []

    while start <= end:
        ranges.append(start.strftime("%Y-%m-%d"))
        start += timedelta(days=1)

    return ranges


def calculate_ndvi(nir, red, nir_nodata=None, red_nodata=None):
    """
    Calculate NDVI from NIR and Red bands, normalize, and rescale.
    Args:
        nir (numpy.ndarray): NIR band array.
        red (numpy.ndarray): Red band array.
        nir_nodata: NoData value for NIR band.
        red_nodata: NoData value for Red band.
    Returns:
        numpy.ndarray: Rescaled NDVI array (8-bit).
    """
    nir = nir.astype(float)
    red = red.astype(float)

    # Create mask for noData pixels
    nodata_mask = np.zeros(nir.shape, dtype=bool)
    if nir_nodata is not None:
        nodata_mask |= (nir == nir_nodata)
    if red_nodata is not None:
        nodata_mask |= (red == red_nodata)

    # Calculate NDVI properly without forcing zeros
    denominator = nir + red
    valid_mask = (denominator > 0) & (~nodata_mask)
    
    # Initialize NDVI array with NaN
    ndvi = np.full(nir.shape, np.nan, dtype=float)
    
    # Calculate NDVI only for valid pixels
    ndvi[valid_mask] = (nir[valid_mask] - red[valid_mask]) / denominator[valid_mask]
    
    # Rescale from [-1, 1] to [0, 254] for valid pixels (reserve 255 for noData)
    ndvi_rescaled = np.full(nir.shape, 255, dtype=np.uint8)  # Start with all nodata
    
    # Only rescale valid (non-NaN) pixels
    valid_ndvi = ~np.isnan(ndvi)
    if np.any(valid_ndvi):
        # Clip NDVI to [-1, 1] range and rescale to [0, 254]
        clipped_ndvi = np.clip(ndvi[valid_ndvi], -1, 1)
        ndvi_rescaled[valid_ndvi] = np.round((clipped_ndvi + 1.0) * 127).astype(np.uint8)
    
    return ndvi_rescaled


def process_zip_to_ndvi(zip_path, output_dir, keep_raw=False):
    """
    Extract a ZIP archive and calculate NDVI from its bands, then save a GeoTIFF.
    Args:
        zip_path (str): Path to the ZIP archive.
        output_dir (str): Directory to save the processed GeoTIFF.
        keep_raw (bool): Keep raw NIR and Red band files after processing.
    Returns:
        str: Path to the processed GeoTIFF.
    """
    tile_id = os.path.basename(zip_path).split(".")[0]  # Use the tile ID from filename
    output_file = os.path.join(output_dir, f"{tile_id}.tif")
    logger.debug(f"Processing {zip_path} into {output_file}")

    # Create a temporary directory for this specific tile's extraction
    temp_extract_dir = tempfile.mkdtemp(dir=output_dir, prefix=f"extract_{tile_id}_")
    logger.debug(f"Extracting {tile_id} to temporary directory: {temp_extract_dir}")

    try:
        # Extract the ZIP file to the temporary directory
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            zip_ref.extractall(temp_extract_dir)

        # Locate the `.SAFE` directory (Sentinel-2 data format) - should match the tile_id
        safe_dirs = [d for d in os.listdir(temp_extract_dir) if d.endswith(".SAFE")]
        logger.debug(f"Found {len(safe_dirs)} .SAFE directories: {safe_dirs}")

        # Try to find the SAFE directory that contains our tile_id
        safe_dir = None
        matched_safe_name = None
        for d in safe_dirs:
            if tile_id in d or d.startswith(tile_id):
                safe_dir = os.path.join(temp_extract_dir, d)
                matched_safe_name = d
                logger.debug(f"Matched SAFE directory for {tile_id}: {d}")
                break

        # If no match found, use the first (and likely only) SAFE directory
        if not safe_dir and safe_dirs:
            safe_dir = os.path.join(temp_extract_dir, safe_dirs[0])
            matched_safe_name = safe_dirs[0]
            logger.warning(f"Could not match SAFE directory by tile_id {tile_id}, using: {safe_dirs[0]}")

        if not safe_dir:
            raise FileNotFoundError(f"Could not find any .SAFE directory for tile {tile_id}")

        # Validate that we're processing the correct tile by checking the SAFE directory name
        if matched_safe_name:
            # Extract tile code from SAFE directory name for validation
            safe_parts = matched_safe_name.replace('.SAFE', '').split('_')
            if len(safe_parts) >= 6:
                safe_tile_code = safe_parts[5]
                tile_parts = tile_id.split('_')
                expected_tile_code = tile_parts[5] if len(tile_parts) >= 6 else "UNKNOWN"

                if safe_tile_code != expected_tile_code:
                    logger.warning(f"Tile code mismatch! Expected: {expected_tile_code}, Found: {safe_tile_code}")
                else:
                    logger.debug(f"Tile code validation passed: {safe_tile_code}")
            else:
                logger.warning(f"Could not extract tile code from SAFE directory: {matched_safe_name}")

        # Locate the GRANULE subdirectory
        granule_dir = next((os.path.join(safe_dir, "GRANULE", d) for d in os.listdir(os.path.join(safe_dir, "GRANULE"))), None)
        if not granule_dir:
            raise FileNotFoundError("Could not find the GRANULE directory in the .SAFE structure.")

        # Locate the 10m resolution folder
        r10m_dir = os.path.join(granule_dir, "IMG_DATA", "R10m")
        if not os.path.isdir(r10m_dir):
            raise FileNotFoundError("Could not find the R10m folder in the GRANULE directory.")

        nir_band = red_band = None
        for file in os.listdir(r10m_dir):
            if file.endswith("_B08_10m.jp2"):  # NIR band
                nir_band = os.path.join(r10m_dir, file)
            elif file.endswith("_B04_10m.jp2"):  # Red band
                red_band = os.path.join(r10m_dir, file)

        if not nir_band or not red_band:
            raise FileNotFoundError("Could not find NIR or Red bands in the R10m folder.")

        # Read bands with Rasterio
        with rasterio.open(nir_band) as src_nir, rasterio.open(red_band) as src_red:
            nir = src_nir.read(1, resampling=Resampling.bilinear)
            red = src_red.read(1, resampling=Resampling.bilinear)
            nir_nodata = src_nir.nodata
            red_nodata = src_red.nodata
            meta = src_nir.meta.copy()
            meta.update({"driver": "GTiff", "dtype": "uint8", "compress": "JPEG", "nodata": 255})

        # Calculate NDVI with proper nodata handling
        ndvi = calculate_ndvi(nir, red, nir_nodata, red_nodata)

        # Save NDVI as a compressed GeoTIFF
        with rasterio.open(output_file, "w", **meta) as dst:
            dst.write(ndvi, 1)

        # Handle keep_raw option - move SAFE directory from temp to output_dir
        if keep_raw:

            # First clean up unnecessary files while still in temp directory
            # Keep only NIR and Red bands, remove everything else from R10m
            for file in os.listdir(r10m_dir):
                file_path = os.path.join(r10m_dir, file)
                if not (file.endswith("_B08_10m.jp2") or file.endswith("_B04_10m.jp2")):
                    if os.path.isfile(file_path):
                        os.remove(file_path)

            # Remove all other resolution folders
            for res_folder in ["R20m", "R60m"]:
                res_path = os.path.join(granule_dir, "IMG_DATA", res_folder)
                if os.path.exists(res_path):
                    shutil.rmtree(res_path)

            # Remove quality, auxiliary, and metadata folders from granule
            unnecessary_folders = ["QI_DATA", "AUX_DATA"]
            for folder in unnecessary_folders:
                folder_path = os.path.join(granule_dir, folder)
                if os.path.exists(folder_path):
                    shutil.rmtree(folder_path)

            # Remove unnecessary folders from SAFE root
            safe_unnecessary_folders = ["HTML", "rep_info", "DATASTRIP"]
            for folder in safe_unnecessary_folders:
                folder_path = os.path.join(safe_dir, folder)
                if os.path.exists(folder_path):
                    shutil.rmtree(folder_path)

            # Remove unnecessary files from SAFE root (keep only essential metadata)
            for file in os.listdir(safe_dir):
                file_path = os.path.join(safe_dir, file)
                if os.path.isfile(file_path):
                    # Keep only essential files: manifest.safe and main metadata
                    if not (file == "manifest.safe" or file == "MTD_MSIL2A.xml" or
                           file.endswith("-ql.jpg")):  # Keep quicklook for reference
                        os.remove(file_path)

            # Remove unnecessary files from granule root
            for file in os.listdir(granule_dir):
                file_path = os.path.join(granule_dir, file)
                if os.path.isfile(file_path):
                    # Keep only essential granule metadata
                    if not file == "MTD_TL.xml":
                        os.remove(file_path)

            # Move the cleaned SAFE directory to the output directory
            safe_name = os.path.basename(safe_dir)
            final_safe_path = os.path.join(output_dir, safe_name)
            if os.path.exists(final_safe_path):
                shutil.rmtree(final_safe_path)  # Remove existing if present
            shutil.move(safe_dir, final_safe_path)
            logger.debug(f"Moved cleaned SAFE directory to {final_safe_path}")

    finally:
        # Always clean up the temporary extraction directory
        if os.path.exists(temp_extract_dir):
            shutil.rmtree(temp_extract_dir)

    return output_file


def download_and_process(feature, credentials, output_dir, keep_raw=False):
    """
    Downloads and processes a single feature
    :param feature: the feature to download and process
    :param credentials: the login credentials to download the file
    :param output_dir: the directory to write the output file to
    :param keep_raw: whether to keep raw NIR and Red band files
    :return Status of processing the file as one of {"skip", "success", "error"}
    """
    tile_id = feature["properties"]["title"].removesuffix('.SAFE')

    # Extract tile code (e.g., T10SFJ) from the tile_id
    tile_parts = tile_id.split('_')
    tile_code = tile_parts[5] if len(tile_parts) >= 6 else "UNKNOWN"

    logger.info(f"Processing feature: {tile_id} (Tile code: {tile_code})")

    try:
        # Determine paths
        date = feature["properties"]["startDate"][:10]
        date_dir = os.path.join(output_dir, date)
        os.makedirs(date_dir, exist_ok=True)

        output_tif = os.path.join(date_dir, f"{tile_id}.tif")
        zip_path = os.path.join(date_dir, f"{tile_id}.zip")

        # Skip download if TIF already exists
        if os.path.exists(output_tif):
            logger.debug(f"Skipping '{tile_id}' - TIF already exists at {output_tif}")
            return "skip"

        if os.path.exists(zip_path):
            logger.debug(f"Skipping download for '{tile_id}' - ZIP already exists at {zip_path}")
        else:
            # Download the ZIP archive
            monitor = StatusMonitor()
            logger.info(f"Downloading '{tile_id}' (Tile: {tile_code})")
            downloaded_filename = download_feature(feature, date_dir, {"credentials": credentials, "monitor": monitor})
            # Ensure full path is constructed correctly
            zip_path = os.path.join(date_dir, downloaded_filename)
        logger.info(f"Processing ZIP to NDVI for '{tile_id}' (Tile: {tile_code})")
        output_file = process_zip_to_ndvi(zip_path, date_dir, keep_raw)

        # Cleanup intermediate files
        os.remove(zip_path)  # Delete ZIP file

        logger.info(f"Successfully processed '{tile_id}' (Tile: {tile_code}) -> {output_file}")
        return "success"  # Indicating success
    except Exception as e:
        logger.error(f"Error processing feature {tile_id} (Tile: {tile_code}): {e}")
        return "error"


def download_sentinel2_data(date_from, date_to, roi, output_dir, keep_raw=False):
    """
    Download Sentinel2 data for a given date range and region of interest.

    Args:
        date_from (str): Start date in the format 'yyyy-mm-dd'.
        date_to (str): End date in the format 'yyyy-mm-dd'.
        roi (geometry): The geographical area-of-interest to search in
        output_dir (str): Directory to save downloaded data.
        keep_raw (bool): Keep raw NIR and Red band files after processing.
    """
    max_retries = 3
    manager = Manager()
    all_files = manager.dict()  # A thread-safe map from date to all files in that date
    processed_files = manager.list()  # Files that have been processed successfully
    skipped_files = manager.list()  # Files that have been skipped since they are already processed
    failed_files = manager.list()  # Files that have been failed while processing
    work_queue = Queue(maxsize=100)  # A queue of work tasks (feature, num_retries) tuples
    completion_lock = Lock()  # Lock for thread-safe completion tracking

    def producer():
        logger.debug("Starting search process...")

        # 1- Break down the geometric query using a uniform grid
        sub_geometries = create_grid(roi)
        # 2- Break down the date range day-by-day
        date_ranges = split_date_range(date_from, date_to)

        # 3- Loop over the date range, for each one loop over the sub-geometries
        for date in date_ranges:
            # If the day is marked as complete, skip this day
            complete_file_path = os.path.join(output_dir, date, ".complete")
            if os.path.exists(complete_file_path):
                logger.debug(f"Skipping completed day: {date}")
                continue

            for sub_geometry in sub_geometries:
                search_terms = {
                    "startDate": date,
                    "completionDate": (datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d"),
                    "processingLevel": "S2MSI2A",
                    "geometry": sub_geometry.wkt,
                    "cloudCover": "[0,10]",
                }

                # Run the search query and add the results the list of all_files and enqueue into the work_queue
                features = list(query_features("Sentinel2", search_terms))
                logger.debug(f"Found {len(features)} on [{search_terms['startDate']}, {search_terms['completionDate']}]"
                            f" with roi: '{sub_geometry.wkt}'")
                if features:
                    with completion_lock:
                        if date not in all_files:
                            all_files[date] = manager.list()

                        for feature in features:
                            if feature not in all_files[date]:
                                all_files[date].append(feature)  # Add new feature
                                work_queue.put((feature, max_retries))

            # Track the progress and mark complete days as complete
            with completion_lock:
                for file in list(processed_files) + list(skipped_files):
                    file_date = file["properties"]["startDate"][:10]
                    if file_date in all_files and file in all_files[file_date]:
                        all_files[file_date].remove(file)
                        if not all_files[file_date]:  # If all files for this date are processed or skipped
                            # Mark this day as complete
                            del all_files[file_date]
                            day_dir = os.path.join(output_dir, file_date)
                            os.makedirs(day_dir, exist_ok=True)
                            with open(os.path.join(day_dir, ".complete"), "w") as complete_file:
                                complete_file.write("")

        # After done, raise a global flag that we're done
        work_queue.put(None)

    def consumer():
        logger.debug("Starting downloader")
        credentials = Credentials()
        while True:
            try:
                # Retrieve one file from the work queue
                task = work_queue.get()
                if task is None:  # Work is already done
                    logger.debug("Downloader is done")
                    work_queue.task_done()  # Mark the task as done
                    # Replace the None marker for other consumers
                    work_queue.put(None)
                    break

                feature, retries = task

                while retries >= 0:
                    status = download_and_process(feature, credentials, output_dir, keep_raw)

                    if status == "success":
                        processed_files.append(feature)
                        break  # Stop retrying on success
                    elif status == "error" and retries > 0:
                        feature_tile_id = feature["properties"]["title"].removesuffix('.SAFE')
                        logger.warning(f"Retrying {feature_tile_id}, remaining attempts: {retries}")
                        retries -= 1
                    elif status == "error" and retries == 0:
                        failed_files.append(feature)
                        break  # Stop retrying on failure
                    elif status == "skip":
                        skipped_files.append(feature)
                        break  # No need to retry skipped items
                    else:
                        logger.error(f"Unexpected status {status}")
                        break  # Prevent infinite loops on unknown errors

                work_queue.task_done()  # Mark the task as done
            except Exception as e:
                work_queue.task_done()  # Mark the task as done
                logger.error(f"Error in consumer: {e}")
                continue  # Skip the failed task and continue with the next one

    # Start one producer and # of consumers equal to number of processors - cpu_count()
    # Update: Due to API limits, we only use up-to four connections
    # See: https://documentation.dataspace.copernicus.eu/Quotas.html
    # See: Number of concurrent connections limit (IAD=Immediately Available Data) is 4
    producer_thread = Thread(target=producer, name="producer")
    producer_thread.start()
    
    consumers = []
    for i in range(4):
        consumer_thread = Thread(target=consumer, name=f"consumer #{i}")
        consumers.append(consumer_thread)
        consumer_thread.start()

    # Wait until all is done
    while producer_thread.is_alive() or any(t.is_alive() for t in consumers):
        logger.info("Checking thread statuses:")
        logger.info(f"Producer thread alive: {producer_thread.is_alive()}")
        for i, t in enumerate(consumers):
            logger.info(f"Consumer #{i} alive: {t.is_alive()}")

        # Attempt to join with timeout, allowing early termination
        producer_thread.join(timeout=120)
        for consumer_thread in consumers:
            consumer_thread.join(timeout=120)

    # Return a final dictionary object with number of files processed, failed, and skipped
    return {
        "success": len(processed_files),
        "skipped": len(skipped_files),
        "failed": len(failed_files),
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Download Sentinel2 data for a given date range and ROI.")
    parser.add_argument("--date-from", required=True, help="Start date in the format yyyy-mm-dd.")
    parser.add_argument("--date-to", required=True, help="End date in the format yyyy-mm-dd.")
    parser.add_argument("--roi", required=True, help="Region of interest as GeoJSON file or WKT text.")
    parser.add_argument("--output", required=True, help="Directory to save downloaded data.")
    parser.add_argument("--keep-raw", action="store_true", default=False, help="Keep raw NIR and Red band files after processing.")
    parser.add_argument("--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        default="INFO",
        help="Set logging level: DEBUG, INFO, WARNING, ERROR, CRITICAL. Default is INFO."
    )

    args = parser.parse_args()
    setup_logging(args.log_level)

    # Parse the region of interest parameter
    # Load region of interest (ROI)
    roi = args.roi
    if os.path.exists(roi) and roi.lower().endswith(".geojson"):
        # If GeoJSON file
        with open(roi, "r") as geojson_file:
            geojson = json.load(geojson_file)
            geometry = geojson["features"][0]["geometry"]
            roi = shape(geometry)
    else:
        # Assume input is already a WKT string
        roi = parse_wkt(roi)
    results = download_sentinel2_data(args.date_from, args.date_to, roi, args.output, args.keep_raw)
    logger.info(f"Summary: {results['success']} processed, {results['skipped']} skipped, {results['failed']} errors.")
