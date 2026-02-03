import os
import json
import numpy as np
import rasterio
import uuid
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from shapely.geometry import shape
from .config import ETMapConfig
import glob
from .utils import DatabaseManager, FileManager, GeospatialUtils, LoggingUtils
import argparse
import sys
from .parsers import CurlCommandParser, RequestDataParser
from .grid_manager import UnifiedGridManager
from .data_processors import (
    NLDASProcessor, LandsatProcessor, PRISMProcessor,
    StaticDataProcessor, DataCollector
)


class CompleteETMapProcessor:
    def __init__(self, data_base_path: str = None, db_path: str = None):
        self.data_base_path = data_base_path or ETMapConfig.DATA_BASE_PATH
        self.grid_manager = UnifiedGridManager()
        self.nldas_processor = NLDASProcessor()

        # Database manager for UUID lookups
        if db_path is None:
            db_path = ETMapConfig.DB_PATH
        self.db_manager = DatabaseManager(db_path)

        # Data processors
        self.landsat_processor = LandsatProcessor(self.grid_manager)
        self.prism_processor = PRISMProcessor(self.grid_manager)
        self.static_processor = StaticDataProcessor(self.grid_manager)

    def process_by_request_id(self, request_id: str, output_base_path: str = None) -> bool:
        LoggingUtils.print_progress_header("COMPLETE ETMAP PROCESSOR - UUID INTEGRATION")

        job_info = self.db_manager.get_job_info(request_id)
        if not job_info:
            LoggingUtils.print_error(f"Request ID {request_id} not found in database")
            return False

        LoggingUtils.print_success(f"Found job in database: {request_id}")
        print(f"  Status: {job_info['status']}")
        print(f"  Date range: {job_info['date_from']} to {job_info['date_to']}")

        if output_base_path is None:
            output_base_path = ETMapConfig.get_output_path(request_id)

        print(f"  Output path: {output_base_path}")

        request_data = {
            'date_from': job_info['date_from'],
            'date_to': job_info['date_to'],
            'geometry': job_info['geometry']
        }

        return self.process_complete_etmap_data(request_data, output_base_path)

    def process_by_curl_command(self, curl_command: str, output_base_path: str = None) -> bool:
        LoggingUtils.print_progress_header("COMPLETE ETMAP PROCESSOR - CURL PROCESSING")

        try:
            request_data = CurlCommandParser.parse_curl_command(curl_command)
            if not CurlCommandParser.validate_parsed_data(request_data):
                LoggingUtils.print_error("Invalid request data. Exiting.")
                return False
        except Exception as e:
            LoggingUtils.print_error(f"Error parsing curl command: {e}")
            return False

        if output_base_path is None:
            processing_uuid = str(uuid.uuid4())
            output_base_path = ETMapConfig.get_output_path(processing_uuid)
            print(f"Generated processing UUID: {processing_uuid}")

        return self.process_complete_etmap_data(request_data, output_base_path)

    def process_complete_etmap_data(self, request_data: Dict, output_base_path: str) -> bool:
        try:
            LoggingUtils.print_progress_header("COMPLETE ETMAP PROCESSOR")
            print("Creates basic aligned data + hourly aligned files")

            validated_data = RequestDataParser.validate_request_data(request_data)

            date_from = validated_data['date_info']['date_from']
            date_to = validated_data['date_info']['date_to']
            year = int(date_from.split('-')[0])
            print(f"DEBUG: Extracted year from date_from '{date_from}': {year}")
            geometry_info = validated_data['geometry_info']
            aoi_geometry = geometry_info['geometry']

            print(f"Processing request:")
            print(f"  Date range: {date_from} to {date_to}")
            print(f"  AOI bounds: {geometry_info['bounds']}")
            print(f"  AOI area: ~{geometry_info['area_km2']:.1f} km2")
            print(f"  Output path: {output_base_path}")

            # AOI GeoJSON
            aoi_geojson = os.path.join(output_base_path, "AOI/dynamic_aoi.geojson")
            GeospatialUtils.create_aoi_geojson(request_data['geometry'], aoi_geojson)

            LoggingUtils.print_step_header("Collecting Sample Datasets")
            sample_datasets = DataCollector.collect_sample_datasets(year)
            if not sample_datasets:
                LoggingUtils.print_error("No sample datasets found. Check your data paths.")
                return False

            LoggingUtils.print_step_header("Computing Unified Grid")
            _ = self.grid_manager.compute_unified_grid(aoi_geometry, sample_datasets)

            LoggingUtils.print_step_header("Clipping to AOI")
            aoi_metadata = self.grid_manager.clip_to_aoi(aoi_geometry)
            self._save_processing_metadata(request_data, aoi_metadata, output_base_path)

            # Base aligned data
            LoggingUtils.print_step_header("STEP 1: Creating Basic Aligned Datasets")
            self.landsat_processor.process_landsat_data(aoi_metadata, output_base_path)
            self.static_processor.process_static_data(aoi_metadata, output_base_path, year)
            self.prism_processor.process_prism_data_by_dates(aoi_metadata, date_from, date_to, output_base_path)

            # Hourly stacks
            LoggingUtils.print_step_header("STEP 2: Creating Hourly Aligned Files")
            self._create_hourly_aligned_files(request_data, aoi_metadata, output_base_path)

            LoggingUtils.print_progress_header("COMPLETE PROCESSING FINISHED!")
            LoggingUtils.print_success(f"Basic aligned data: {output_base_path}/")
            LoggingUtils.print_success(f"Hourly aligned files: {output_base_path}/hourly_aligned/")
            LoggingUtils.print_success(f"UUID: {os.path.basename(output_base_path)}")
            LoggingUtils.print_success("Ready for QGIS verification!")

            return True

        except Exception as e:
            LoggingUtils.print_error(f"Processing failed: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _create_hourly_aligned_files(self, request_data: Dict, aoi_metadata: Dict, output_base_path: str):
        print("Creating hourly aligned raster files...")

        hourly_output_dir = ETMapConfig.get_output_path(
            os.path.basename(output_base_path), 'hourly_aligned'
        )
        FileManager.ensure_directory_exists(hourly_output_dir)

        static_data = self.static_processor.load_aligned_static_data(output_base_path)

        date_from = datetime.strptime(request_data['date_from'], '%Y-%m-%d')
        date_to = datetime.strptime(request_data['date_to'], '%Y-%m-%d')

        current_date = date_from
        total_hours_processed = 0

        landsat_output_dir = ETMapConfig.get_output_path(os.path.basename(output_base_path), 'landsat')
        FileManager.ensure_directory_exists(landsat_output_dir)

        while current_date <= date_to:
            print(f"\n--- Processing Date: {current_date.strftime('%Y-%m-%d')} ---")
            for fp in glob.glob(os.path.join(landsat_output_dir, "*.tif")):
                try:
                    os.remove(fp)
                except Exception:
                    pass

            self.landsat_processor.process_landsat_data(
                aoi_metadata, output_base_path, target_date=current_date
            )
            landsat_data = self.landsat_processor.load_aligned_landsat_data(output_base_path)

            prism_data = self.prism_processor.load_aligned_prism_data(output_base_path, current_date)

            hourly_files = self.nldas_processor.find_nldas_hourly_files(current_date)
            if not hourly_files:
                LoggingUtils.print_warning(f"No NLDAS hourly data found for {current_date.strftime('%Y-%m-%d')}")
                hourly_files = [(h, None) for h in range(0, 24, 6)]
            for hour, nldas_file_path in hourly_files:
                print(f"Processing Hour {hour:02d}")

                nldas_data = None
                if nldas_file_path:
                    nldas_data = self.nldas_processor.align_nldas_file_to_grid(
                        nldas_file_path, aoi_metadata
                    )

                success = self._create_single_hourly_file(
                    current_date, hour, static_data, prism_data,
                    landsat_data, nldas_data, aoi_metadata, hourly_output_dir
                )
                if success:
                    total_hours_processed += 1

            current_date += timedelta(days=1)

        LoggingUtils.print_success(f"Created {total_hours_processed} hourly aligned files")
        LoggingUtils.print_success(f"Location: {hourly_output_dir}")

    def _create_single_hourly_file(self, date: datetime, hour: int,
                                   static_data: Dict, prism_data: Dict,
                                   landsat_data: Dict, nldas_data: Optional[np.ndarray],
                                   aoi_metadata: Dict, output_dir: str) -> bool:
        print(f"  Creating {date.strftime('%Y-%m-%d')}_{hour:02d}.tif")

        height = aoi_metadata['height']
        width = aoi_metadata['width']
        transform = aoi_metadata['transform']
        crs = aoi_metadata['crs']

        all_layers: List[np.ndarray] = []
        layer_names: List[str] = []

        # Static
        for var_name in ETMapConfig.BAND_ORDER['static']:
            if var_name in static_data:
                all_layers.append(static_data[var_name])
                layer_names.append(f"static_{var_name}")

        # PRISM
        for var_name in ETMapConfig.BAND_ORDER['prism']:
            if var_name in prism_data:
                all_layers.append(prism_data[var_name])
                layer_names.append(f"prism_{var_name}")

        # Landsat
        for var_name in ETMapConfig.BAND_ORDER['landsat']:
            if var_name in landsat_data:
                all_layers.append(landsat_data[var_name])
                layer_names.append(f"landsat_{var_name}")

        # NLDAS
        if nldas_data is not None and nldas_data.shape[0] >= 4:
            for i, var_name in enumerate(ETMapConfig.BAND_ORDER['nldas']):
                if i < nldas_data.shape[0]:
                    all_layers.append(nldas_data[i])
                    layer_names.append(f"nldas_{var_name}")

        if not all_layers:
            LoggingUtils.print_error("No data layers available")
            return False

        # Harmonize shapes
        target_shape = (height, width)
        aligned_layers = []
        for i, layer in enumerate(all_layers):
            if layer.shape != target_shape:
                print(f"    Resizing {layer_names[i]} from {layer.shape} to {target_shape}")
                from .utils import ArrayUtils
                layer = ArrayUtils.resize_array_to_target(layer, target_shape)
            aligned_layers.append(layer.astype(np.float32))

        expected = 11
        if len(aligned_layers) != expected:
            print(f"    Band count is {len(aligned_layers)} (expected {expected}). "
                  f"Missing inputs will be defaulted by ETAlgorithm, but results may differ.")

        output_filename = f"{date.strftime('%Y-%m-%d')}_{hour:02d}.tif"
        output_path = os.path.join(output_dir, output_filename)

        profile = ETMapConfig.GEOTIFF_PROFILE.copy()
        profile.update({
            'width': width,
            'height': height,
            'count': len(aligned_layers),
            'crs': crs,
            'transform': transform
        })

        try:
            with rasterio.open(output_path, 'w', **profile) as dst:
                for i, layer in enumerate(aligned_layers):
                    dst.write(layer, i + 1)
                dst.descriptions = tuple(layer_names)

            # Band metadata json
            metadata_path = os.path.join(output_dir, f"{date.strftime('%Y-%m-%d')}_{hour:02d}_bands.json")
            band_metadata = {
                'date': date.strftime('%Y-%m-%d'),
                'hour': hour,
                'bands': [{'index': i + 1, 'name': name} for i, name in enumerate(layer_names)],
                'total_bands': len(layer_names)
            }
            FileManager.save_json(band_metadata, metadata_path)

            LoggingUtils.print_success(f"Created {output_filename} ({len(aligned_layers)} bands)")
            return True

        except Exception as e:
            LoggingUtils.print_error(f"Error creating {output_filename}: {e}")
            return False

    def _save_processing_metadata(self, request_data: Dict, aoi_metadata: Dict, output_base_path: str):
        request_file = os.path.join(output_base_path, "original_request.json")
        FileManager.save_json(request_data, request_file)

        metadata_file = os.path.join(output_base_path, "grid_metadata.json")
        serializable_metadata = GeospatialUtils.serialize_geometry_metadata(aoi_metadata)
        FileManager.save_json(serializable_metadata, metadata_file)

        LoggingUtils.print_success(f"Metadata saved: {request_file}, {metadata_file}")


def main():
    parser = argparse.ArgumentParser(description='Complete ETMap Processor with UUID Integration')

    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument('--curl', type=str, help='Curl command as string')
    input_group.add_argument('--request-id', type=str, help='Request ID from database')

    parser.add_argument('--output-path', type=str, help='Custom output directory (optional)')
    parser.add_argument('--db-path', type=str, help='Path to SQLite database (optional)')

    args = parser.parse_args()

    try:
        ETMapConfig.ensure_directories_exist()

        processor = CompleteETMapProcessor(db_path=args.db_path)

        if args.request_id:
            print(f"Processing using request ID: {args.request_id}")
            success = processor.process_by_request_id(args.request_id, args.output_path)
        else:
            print("Processing using curl command")
            success = processor.process_by_curl_command(args.curl, args.output_path)

        if success:
            LoggingUtils.print_progress_header("PROCESSING COMPLETED SUCCESSFULLY!")
        else:
            LoggingUtils.print_error("Processing failed")
            sys.exit(1)

    except Exception as e:
        LoggingUtils.print_error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
