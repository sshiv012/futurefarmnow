import os
import logging
import requests
import json
from datetime import datetime, timedelta
from multiprocessing import Manager
import rasterio
from rasterio.enums import Resampling
import numpy as np
from shapely.geometry import shape, box
from shapely.wkt import loads as parse_wkt
from queue import Queue
from threading import Thread
import time

# Set up logging
logger = logging.getLogger(__name__)

# USGS M2M API Base URL
M2M_API_BASE = "https://m2m.cr.usgs.gov/api/api/json/stable/"

class USGSM2M:
    """Simple USGS M2M API client for Landsat data downloads"""
    
    def __init__(self, username, token):
        self.username = username
        self.token = token
        self.api_key = None
        self.session = requests.Session()
        
    def login(self):
        """Login using application token"""
        login_url = f"{M2M_API_BASE}login-token"
        payload = {
            "username": self.username,
            "token": self.token
        }
        
        response = self.session.post(login_url, json=payload)
        if response.status_code == 200:
            result = response.json()
            if result.get('errorCode'):
                raise Exception(f"Login failed: {result.get('errorMessage', 'Unknown error')}")
            self.api_key = result['data']
            logger.info("Successfully logged in to USGS M2M API")
        else:
            raise Exception(f"Login request failed: {response.status_code}")
    
    def logout(self):
        """Logout from M2M API"""
        if self.api_key:
            logout_url = f"{M2M_API_BASE}logout"
            payload = {"apiKey": self.api_key}
            self.session.post(logout_url, json=payload)
            self.api_key = None
            logger.info("Logged out from USGS M2M API")
    
    def search_scenes(self, dataset_name, start_date, end_date, geometry, cloud_cover=10, max_results=100):
        """Search for scenes in the given dataset"""
        if not self.api_key:
            raise Exception("Not logged in. Call login() first.")
        
        search_url = f"{M2M_API_BASE}scene-search"
        
        # Convert shapely geometry to coordinates for M2M API
        bounds = geometry.bounds
        
        # Try the exact structure from landsatxplore
        payload = {
            "datasetName": dataset_name,
            "sceneFilter": {
                "acquisitionFilter": {
                    "start": f"{start_date}T00:00:00Z",
                    "end": f"{end_date}T23:59:59Z"
                },
                "spatialFilter": {
                    "filterType": "mbr",
                    "lowerLeft": {
                        "latitude": bounds[1], 
                        "longitude": bounds[0]
                    },
                    "upperRight": {
                        "latitude": bounds[3], 
                        "longitude": bounds[2]
                    }
                },
                "cloudCoverFilter": {
                    "min": 0,
                    "max": cloud_cover,
                    "includeUnknown": False
                }
            },
            "maxResults": max_results,
            "metadataType": "full"
        }
        
        # Add API key to headers instead of payload
        headers = {
            'X-Auth-Token': self.api_key,
            'Content-Type': 'application/json'
        }
        
        logger.debug(f"Scene search payload: {payload}")
        response = self.session.post(search_url, json=payload, headers=headers)
        logger.debug(f"Scene search response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('errorCode'):
                logger.warning(f"Scene search warning: {result.get('errorMessage', 'Unknown error')}")
                return []
            return result.get('data', {}).get('results', [])
        else:
            # Get detailed error information
            try:
                error_response = response.json()
                logger.error(f"Scene search failed: {response.status_code} - {error_response}")
            except:
                logger.error(f"Scene search failed: {response.status_code} - {response.text}")
            return []
    
    def get_download_options(self, dataset_name, scene_ids):
        """Get download options for scenes"""
        if not self.api_key:
            raise Exception("Not logged in. Call login() first.")
        
        options_url = f"{M2M_API_BASE}download-options"
        payload = {
            "datasetName": dataset_name,
            "entityIds": scene_ids
        }
        
        headers = {
            'X-Auth-Token': self.api_key,
            'Content-Type': 'application/json'
        }
        
        logger.debug(f"Download options payload: {payload}")
        response = self.session.post(options_url, json=payload, headers=headers)
        if response.status_code == 200:
            result = response.json()
            if result.get('errorCode'):
                logger.error(f"Download options error: {result.get('errorMessage', 'Unknown error')}")
                return []
            return result.get('data', [])
        else:
            try:
                error_response = response.json()
                logger.error(f"Download options request failed: {response.status_code} - {error_response}")
            except:
                logger.error(f"Download options request failed: {response.status_code} - {response.text}")
            return []
    
    def request_downloads(self, downloads):
        """Request downloads for scenes"""
        if not self.api_key:
            raise Exception("Not logged in. Call login() first.")
        
        request_url = f"{M2M_API_BASE}download-request"
        payload = {
            "downloads": downloads
        }
        
        headers = {
            'X-Auth-Token': self.api_key,
            'Content-Type': 'application/json'
        }
        
        logger.debug(f"Download request payload: {payload}")
        response = self.session.post(request_url, json=payload, headers=headers)
        if response.status_code == 200:
            result = response.json()
            if result.get('errorCode'):
                logger.error(f"Download request error: {result.get('errorMessage', 'Unknown error')}")
                logger.error(f"Full error response: {result}")
                return []
            return result.get('data', {}).get('availableDownloads', [])
        else:
            try:
                error_response = response.json()
                logger.error(f"Download request failed: {response.status_code} - {error_response}")
            except:
                logger.error(f"Download request failed: {response.status_code} - {response.text}")
            return []

def setup_logging(log_level):
    """Configure logging based on log level."""
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    logger.setLevel(numeric_level)

    # Clear existing handlers to avoid duplicate logs
    if logger.hasHandlers():
        logger.handlers.clear()

    # Create a stream handler
    handler = logging.StreamHandler()
    handler.setLevel(numeric_level)

    # Define a log format
    formatter = logging.Formatter("%(asctime)s %(threadName)s [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)

    # Add the handler to the logger
    logger.addHandler(handler)

def create_grid(geometry, cell_size=10.0):
    """Create a uniform grid of polygons over the bounding box of the input geometry."""
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
    """Split a large date range into smaller daily date ranges."""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    ranges = []

    while start <= end:
        ranges.append(start.strftime("%Y-%m-%d"))
        start += timedelta(days=1)

    return ranges

def calculate_ndvi(nir, red):
    """Calculate NDVI from NIR and Red bands, normalize, and rescale."""
    nir = nir.astype(float)
    red = red.astype(float)

    # Avoid division by zero
    np.seterr(divide="ignore", invalid="ignore")

    numerator = nir - red
    denominator = nir + red

    # NDVI calculation with custom handling
    ndvi = np.where(
        numerator == 0, 0,  # If numerator is zero, NDVI is zero
        numerator / denominator  # Otherwise, compute NDVI as usual
    )

    # Rescale from [-1, 1] to [1, 255] (keep 0 for invalid pixels)
    ndvi_rescaled = np.round(1+(ndvi + 1.0) * 127)
    ndvi_rescaled[np.isnan(ndvi)] = 0
    ndvi_rescaled = ndvi_rescaled.astype(np.uint8)

    return ndvi_rescaled

def calculate_ndvi_from_bands(red_path, nir_path, output_path):
    """Calculate NDVI from individual Red and NIR band files."""
    logger.debug(f"Calculating NDVI from {red_path} and {nir_path}")

    # Read bands with Rasterio
    with rasterio.open(nir_path) as src_nir, rasterio.open(red_path) as src_red:
        nir = src_nir.read(1, resampling=Resampling.bilinear)
        red = src_red.read(1, resampling=Resampling.bilinear)
        meta = src_nir.meta.copy()
        meta.update({"driver": "GTiff", "dtype": "uint8", "compress": "JPEG", "nodata": 0})

    # Calculate NDVI
    ndvi = calculate_ndvi(nir, red)

    # Save NDVI as a compressed GeoTIFF
    with rasterio.open(output_path, "w", **meta) as dst:
        dst.write(ndvi, 1)

    logger.info(f"NDVI calculated and saved to {output_path}")
    return output_path

def download_file(url, local_path, max_retries=3):
    """Download file from URL with retries"""
    for attempt in range(max_retries):
        try:
            response = requests.get(url, stream=True)
            response.raise_for_status()
            
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            return True
        except Exception as e:
            logger.warning(f"Download attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
            else:
                logger.error(f"Failed to download {url} after {max_retries} attempts")
                return False

def download_and_process(scene, api, dataset_name, output_dir, keep_raw=True):
    """Downloads and processes a single Landsat scene"""
    try:
        scene_id = scene.get('entityId', scene.get('displayId', 'unknown'))
        date = scene.get('temporalCoverage', {}).get('startDate', '')[:10]
        
        if not date:
            # Fallback: try to parse from scene_id
            parts = scene_id.split('_')
            if len(parts) > 3:
                date_part = parts[3]
                date = f"{date_part[:4]}-{date_part[4:6]}-{date_part[6:8]}"
            else:
                date = datetime.now().strftime("%Y-%m-%d")

        date_dir = os.path.join(output_dir, date)
        os.makedirs(date_dir, exist_ok=True)

        output_tif = os.path.join(date_dir, f"{scene_id}_NDVI.tif")
        
        # Skip if already processed
        if os.path.exists(output_tif):
            logger.debug(f"Skipping '{output_tif}' - already exists")
            return "skip"

        # Get download options for this scene
        download_options = api.get_download_options(dataset_name, [scene_id])
        if not download_options:
            logger.error(f"No download options available for {scene_id}")
            return "error"

        # Find the Band File option (folder system with individual bands)
        band_file_option = None
        for option in download_options:
            if option.get('available', False) and 'Band File' in option.get('productName', ''):
                band_file_option = option
                break
        
        if not band_file_option:
            logger.error(f"No Band File download option available for {scene_id}")
            return "error"

        # Find Band 4 (Red) and Band 5 (NIR) in secondaryDownloads
        red_band_info = None
        nir_band_info = None
        
        for secondary in band_file_option.get('secondaryDownloads', []):
            display_id = secondary.get('displayId', '')
            if '_B4.TIF' in display_id:  # Red band for Landsat 8/9
                red_band_info = secondary
            elif '_B5.TIF' in display_id:  # NIR band for Landsat 8/9
                nir_band_info = secondary
        
        # Handle Landsat 7 bands (B3=Red, B4=NIR)
        if not red_band_info or not nir_band_info:
            for secondary in band_file_option.get('secondaryDownloads', []):
                display_id = secondary.get('displayId', '')
                if '_B3.TIF' in display_id and scene_id.startswith('LE07'):  # Red band for Landsat 7
                    red_band_info = secondary
                elif '_B4.TIF' in display_id and scene_id.startswith('LE07'):  # NIR band for Landsat 7
                    nir_band_info = secondary

        if not red_band_info or not nir_band_info:
            logger.error(f"Could not find required bands (Red/NIR) for {scene_id}")
            return "error"

        # Download individual band files
        scene_dir = os.path.join(date_dir, scene_id)
        os.makedirs(scene_dir, exist_ok=True)
        
        # Request downloads for both bands
        downloads = [
            {"entityId": red_band_info['entityId'], "productId": red_band_info['id']},
            {"entityId": nir_band_info['entityId'], "productId": nir_band_info['id']}
        ]
        
        available_downloads = api.request_downloads(downloads)
        if len(available_downloads) != 2:
            logger.error(f"Download request failed for {scene_id} bands")
            return "error"

        # Download Red band
        red_download = available_downloads[0]
        red_url = red_download.get('url')
        if not red_url:
            logger.error(f"No download URL for Red band of {scene_id}")
            return "error"
        
        red_path = os.path.join(scene_dir, red_band_info['displayId'])
        logger.info(f"Downloading Red band: {red_band_info['displayId']}")
        if not download_file(red_url, red_path):
            return "error"

        # Download NIR band
        nir_download = available_downloads[1]
        nir_url = nir_download.get('url')
        if not nir_url:
            logger.error(f"No download URL for NIR band of {scene_id}")
            return "error"
        
        nir_path = os.path.join(scene_dir, nir_band_info['displayId'])
        logger.info(f"Downloading NIR band: {nir_band_info['displayId']}")
        if not download_file(nir_url, nir_path):
            return "error"

        # Process bands to NDVI
        ndvi_path = calculate_ndvi_from_bands(red_path, nir_path, output_tif)
        
        # Cleanup individual band files if not keeping raw data
        if not keep_raw:
            if os.path.exists(red_path):
                os.remove(red_path)
            if os.path.exists(nir_path):
                os.remove(nir_path)
            if os.path.exists(scene_dir) and not os.listdir(scene_dir):
                os.rmdir(scene_dir)

        return "success"
    except Exception as e:
        logger.error(f"Error processing scene {scene_id}: {e}")
        return "error"

def download_landsat8_data(date_from, date_to, roi, output_dir, username, token, keep_raw=True, cloud_cover=10):
    """Download Landsat 8 data using USGS M2M API."""
    max_retries = 3
    manager = Manager()
    all_scenes = {}  # A map from date to all scenes in that date
    processed_scenes = manager.list()
    skipped_scenes = manager.list()
    failed_scenes = manager.list()
    work_queue = Queue(maxsize=100)
    
    # Dataset name for Landsat Collection 2 Level 1
    dataset_name = "landsat_ot_c2_l1"
    
    # Initialize M2M API client
    api = USGSM2M(username, token)
    
    def producer():
        logger.debug("Starting search process...")
        
        try:
            # Login to M2M API
            api.login()
            
            # Break down the geometric query using a uniform grid
            sub_geometries = create_grid(roi)
            # Break down the date range day-by-day
            date_ranges = split_date_range(date_from, date_to)

            # Loop over the date range and sub-geometries
            for date in date_ranges:
                # Check if day is already complete
                complete_file_path = os.path.join(output_dir, date, ".complete")
                if os.path.exists(complete_file_path):
                    logger.debug(f"Skipping completed day: {date}")
                    continue

                for sub_geometry in sub_geometries:
                    try:
                        # Search for Landsat scenes
                        logger.debug(f"Searching for Landsat scenes on {date}")
                        scenes = api.search_scenes(
                            dataset_name=dataset_name,
                            start_date=date,
                            end_date=date,
                            geometry=sub_geometry,
                            cloud_cover=cloud_cover
                        )

                        logger.debug(f"Found {len(scenes)} Landsat scenes on {date}")

                        # Add scenes to all_scenes tracking and work queue
                        if scenes:
                            if date not in all_scenes:
                                all_scenes[date] = []

                            for scene in scenes:
                                if scene not in all_scenes[date]:
                                    all_scenes[date].append(scene)  # Add new scene
                                    work_queue.put((scene, max_retries))
                            
                    except Exception as e:
                        logger.warning(f"Search failed for date {date}: {e}")
                        continue

            # After all searches are done, we'll track completion in the main thread
                
        except Exception as e:
            logger.error(f"Producer error: {e}")
        finally:
            # Logout from API
            api.logout()
            # Signal completion
            work_queue.put(None)

    def consumer():
        logger.debug("Starting consumer")
        
        # Create separate API instance for consumer
        consumer_api = USGSM2M(username, token)
        
        try:
            consumer_api.login()
            
            while True:
                try:
                    task = work_queue.get()
                    if task is None:
                        logger.debug("Consumer is done")
                        work_queue.task_done()
                        work_queue.put(None)  # Signal for other consumers
                        break

                    scene, retries = task
                    scene_id = scene.get('entityId', scene.get('displayId', 'unknown'))
                    
                    # Extract date from scene for completion tracking
                    scene_date = scene.get('temporalCoverage', {}).get('startDate', '')[:10]
                    if not scene_date:
                        # Fallback: try to parse from scene_id
                        parts = scene_id.split('_')
                        if len(parts) > 3:
                            date_part = parts[3]
                            scene_date = f"{date_part[:4]}-{date_part[4:6]}-{date_part[6:8]}"

                    while retries >= 0:
                        status = download_and_process(scene, consumer_api, dataset_name, output_dir, keep_raw=keep_raw)

                        if status == "success":
                            processed_scenes.append({'id': scene_id, 'date': scene_date, 'scene': scene})
                            break
                        elif status == "error" and retries > 0:
                            logger.warning(f"Retrying {scene_id}, remaining attempts: {retries}")
                            retries -= 1
                        elif status == "error" and retries == 0:
                            failed_scenes.append({'id': scene_id, 'date': scene_date, 'scene': scene})
                            break
                        elif status == "skip":
                            skipped_scenes.append({'id': scene_id, 'date': scene_date, 'scene': scene})
                            break
                        else:
                            logger.error(f"Unexpected status {status}")
                            break

                    work_queue.task_done()
                except Exception as e:
                    work_queue.task_done()
                    logger.error(f"Error in consumer: {e}")
                    continue
        except Exception as e:
            logger.error(f"Consumer error: {e}")
        finally:
            consumer_api.logout()

    # Start producer and consumers
    producer_thread = Thread(target=producer, name="producer")
    producer_thread.start()
    
    consumers = []
    # Limit to 2 concurrent downloads to respect API limits
    for i in range(2):
        consumer_thread = Thread(target=consumer, name=f"consumer #{i}")
        consumers.append(consumer_thread)
        consumer_thread.start()

    # Wait for completion
    while producer_thread.is_alive() or any(t.is_alive() for t in consumers):
        logger.info("Checking thread statuses:")
        logger.info(f"Producer thread alive: {producer_thread.is_alive()}")
        for i, t in enumerate(consumers):
            logger.info(f"Consumer #{i} alive: {t.is_alive()}")

        producer_thread.join(timeout=60)
        for consumer_thread in consumers:
            consumer_thread.join(timeout=60)

    # Track the progress and mark complete days as complete
    for scene in list(processed_scenes) + list(skipped_scenes):
        scene_date = scene.get('date')
        if scene_date and scene_date in all_scenes:
            scene_obj = scene.get('scene')
            if scene_obj and scene_obj in all_scenes[scene_date]:
                all_scenes[scene_date].remove(scene_obj)
                if not all_scenes[scene_date]:  # If all scenes for this date are processed or skipped
                    # Mark this day as complete
                    del all_scenes[scene_date]
                    day_dir = os.path.join(output_dir, scene_date)
                    os.makedirs(day_dir, exist_ok=True)
                    with open(os.path.join(day_dir, ".complete"), "w") as complete_file:
                        complete_file.write("")
                    logger.debug(f"Marked {scene_date} as complete")

    return {
        "success": len(processed_scenes),
        "skipped": len(skipped_scenes),
        "failed": len(failed_scenes),
    }

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Download Landsat 8 data using USGS M2M API.")
    parser.add_argument("--date-from", required=True, help="Start date in the format yyyy-mm-dd.")
    parser.add_argument("--date-to", required=True, help="End date in the format yyyy-mm-dd.")
    parser.add_argument("--roi", required=True, help="Region of interest as GeoJSON file or WKT text.")
    parser.add_argument("--output", required=True, help="Directory to save downloaded data.")
    parser.add_argument("--username", required=True, help="USGS username.")
    parser.add_argument("--token", required=True, help="USGS M2M Application Token.")
    parser.add_argument("--keep-raw", action="store_true", default=True, help="Keep raw extracted data files.")
    parser.add_argument("--no-keep-raw", dest="keep_raw", action="store_false", help="Remove raw data after processing.")
    parser.add_argument("--cloud-cover", type=int, default=10,
        help="Maximum cloud cover percentage (0-100). Default is 10."
    )
    parser.add_argument("--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        default="INFO",
        help="Set logging level. Default is INFO."
    )

    args = parser.parse_args()
    setup_logging(args.log_level)

    # Parse the region of interest parameter
    roi = args.roi
    if os.path.exists(roi) and roi.lower().endswith(".geojson"):
        with open(roi, "r") as geojson_file:
            geojson = json.load(geojson_file)
            geometry = geojson["features"][0]["geometry"]
            roi = shape(geometry)
    else:
        roi = parse_wkt(roi)
    
    results = download_landsat8_data(
        args.date_from, 
        args.date_to, 
        roi, 
        args.output, 
        args.username,
        args.token,
        args.keep_raw,
        args.cloud_cover
    )
    logger.info(f"Summary: {results['success']} processed, {results['skipped']} skipped, {results['failed']} errors.")