import argparse
import sys
import os
import json
import uuid
import requests
import time
import re
import rasterio
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Optional

# Handle both module import and direct script execution
if __name__ == "__main__" or __package__ is None:
    # Running as script - add parent directory to path for imports
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    if _script_dir not in sys.path:
        sys.path.insert(0, _script_dir)
    from etmap_modules.grid_manager import UnifiedGridManager
    from etmap_modules.parsers import CurlCommandParser
    from etmap_modules.data_processors import NLDASProcessor, LandsatProcessor, PRISMProcessor, StaticDataProcessor, DataCollector
    from etmap_modules.hourly_processor import CompleteETMapProcessor as ModularProcessor
    from etmap_modules.utils import DatabaseManager, FileManager, GeospatialUtils
    from etmap_modules.config import ETMapConfig
    from etmap_modules.et_algorithm import ETAlgorithm
else:
    # Running as module - use relative imports
    from .etmap_modules.grid_manager import UnifiedGridManager
    from .etmap_modules.parsers import CurlCommandParser
    from .etmap_modules.data_processors import NLDASProcessor, LandsatProcessor, PRISMProcessor, StaticDataProcessor, DataCollector
    from .etmap_modules.hourly_processor import CompleteETMapProcessor as ModularProcessor
    from .etmap_modules.utils import DatabaseManager, FileManager, GeospatialUtils
    from .etmap_modules.config import ETMapConfig
    from .etmap_modules.et_algorithm import ETAlgorithm


class ETCalculationManager:
    def __init__(self, db_path: str = None, save_intermediate_files: bool = False):
        self.db_path = db_path or ETMapConfig.DB_PATH
        self.db_manager = DatabaseManager(self.db_path)
        self.processor = ModularProcessor(db_path=self.db_path)
        self.et_algorithm = ETAlgorithm()
        self.save_intermediate_files = save_intermediate_files

    def process_with_curl_integration(self, curl_command: str, output_path: str = None) -> bool:
        print("="*60)
        print("ETMAP CALCULATION WITH UUID INTEGRATION")
        print("="*60)

        try:
            # Parse the curl command
            print("\n=== Step 1: Parsing Curl Command ===")
            request_data = CurlCommandParser.parse_curl_command(curl_command)

            if not CurlCommandParser.validate_parsed_data(request_data):
                print("ERROR: Invalid request data in curl command")
                return False

            # Extract API endpoint and submit request
            print("\n=== Step 2: Submitting Data Collection Request ===")
            api_url = self._extract_api_url(curl_command)

            if not api_url:
                print("ERROR: Could not extract API URL from curl command")
                return False

            # Submit the request to get UUID
            request_id = self._submit_data_collection_request(api_url, request_data)

            if not request_id:
                print("ERROR: Failed to submit data collection request")
                return False

            print(f"Data collection request submitted with UUID: {request_id}")

            # Wait for data collection to complete
            print("\n=== Step 3: Waiting for Data Collection ===")
            if not self._wait_for_data_collection(api_url, request_id):
                print("ERROR: Data collection failed or timed out")
                return False

            # Process the collected data using the same UUID
            print("\n=== Step 4: Processing Collected Data ===")

            # Determine output path - use UUID if not specified
            if output_path is None:
                output_path = ETMapConfig.get_output_path(request_id)

            print(f"Processing data with UUID: {request_id}")
            print(f"Output will be stored in: {output_path}")

            # Process using the UUID from data collection
            success = self.processor.process_by_request_id(request_id, output_path)

            if success:
                if self._run_et_step(output_path):
                    print("\n" + "="*60)
                    print("COMPLETE ETMAP CALCULATION FINISHED!")
                    print(f"Results stored in UUID folder: {request_id}")
                    print(f"Location: {output_path}")
                    if self.save_intermediate_files:
                        print(f"Hourly aligned files: {output_path}/hourly_aligned/")
                    else:
                        print("Intermediate files kept in memory (not saved to disk)")
                    print(f"ET-enhanced files: {output_path}/et_enhanced/")
                    print("Ready for QGIS and ET analysis!")
                    print("="*60)
                    return True
                else:
                    print("ERROR: ET enhancement step failed")
                    return False
            else:
                print("ERROR: Data processing failed")
                return False

        except Exception as e:
            print(f"ERROR: ETCalculation failed: {e}")
            import traceback
            traceback.print_exc()
            return False

    def process_with_existing_uuid(self, request_id: str, output_path: str = None) -> bool:
        print("="*60)
        print("ETMAP CALCULATION WITH EXISTING UUID")
        print("="*60)

        print(f"Processing existing request: {request_id}")

        # Check if request exists in database
        job_info = self.db_manager.get_job_info(request_id)
        if not job_info:
            print(f"ERROR: Request ID {request_id} not found in database")
            return False

        # Determine output path
        if output_path is None:
            output_path = ETMapConfig.get_output_path(request_id)

        print(f"Output will be stored in: {output_path}")

        # Process the data
        success = self.processor.process_by_request_id(request_id, output_path)

        if success:
            if self._run_et_step(output_path):
                print("\n" + "="*60)
                print("ETMAP CALCULATION COMPLETED WITH BAITSSS ET!")
                print(f"Results stored in UUID folder: {request_id}")
                print(f"Location: {output_path}")
                if self.save_intermediate_files:
                    print(f"Intermediate files: {output_path}/hourly_aligned/")
                else:
                    print("Intermediate files kept in memory (not saved to disk)")
                print(f"ET-enhanced files: {output_path}/et_enhanced/")
                print("="*60)
                return True
            else:
                print("ERROR: ET enhancement step failed")
                return False
        else:
            print("ERROR: Data processing failed")
            return False

    def _run_et_step(self, output_path: str) -> bool:
        hourly_dir = os.path.join(output_path, "hourly_aligned")
        et_out_dir = os.path.join(output_path, "et_enhanced")

        if not os.path.isdir(hourly_dir):
            print(f"ERROR: Expected hourly directory missing: {hourly_dir}")
            return False

        print("\n=== Step 5: BAITSSS ET Enhancement ===")
        print(f"Input hourly dir: {hourly_dir}")
        print(f"Output ET dir   : {et_out_dir}")

        try:
            ok = self.et_algorithm.create_enhanced_hourly_files_with_et(
                hourly_dir,
                et_out_dir,
                save_intermediate_files=self.save_intermediate_files
            )
            return bool(ok)
        except Exception as e:
            print(f"ERROR: ET step crashed: {e}")
            import traceback
            traceback.print_exc()
            return False


    def _extract_api_url(self, curl_command: str) -> Optional[str]:
        try:
            url = CurlCommandParser.extract_url_from_curl(curl_command)
            if not url or not url.startswith('http'):
                # Look for http/https URLs directly in the command
                url_match = re.search(r'(https?://[^\s\'"\\]+)', curl_command)
                if url_match:
                    url = url_match.group(1)

            if url and url.startswith('http'):
                print(f"Extracted API URL: {url}")
                return url
            else:
                print(f"ERROR: Could not extract valid HTTP URL from curl command")
                print(f"Found: '{url}' - this is not a valid URL")
                return None
        except Exception as e:
            print(f"ERROR: Error extracting URL: {e}")
            return None

    def _submit_data_collection_request(self, api_url: str, request_data: Dict) -> Optional[str]:
        try:
            headers = {'Content-Type': 'application/json'}

            print("Submitting request to data collection API...")
            response = requests.post(api_url, json=request_data, headers=headers, timeout=30)

            if response.status_code in [200, 201]:
                response_data = response.json()
                request_id = response_data.get('request_id')

                if request_id:
                    print("Request submitted successfully!")
                    print(f"Request ID: {request_id}")
                    return request_id
                else:
                    print("ERROR: No request_id in API response")
                    return None
            else:
                print(f"ERROR: API request failed: {response.status_code}")
                print(f"Response: {response.text}")
                return None

        except requests.exceptions.RequestException as e:
            print(f"ERROR: Request failed: {e}")
            return None
        except Exception as e:
            print(f"ERROR: Unexpected error submitting request: {e}")
            return None

    def _wait_for_data_collection(self, api_url: str, request_id: str, max_wait_minutes: int = 30) -> bool:
        """Wait for data collection to complete by polling status"""
        status_url = f"{api_url}/{request_id}"
        max_wait_seconds = max_wait_minutes * 60
        poll_interval = 10
        elapsed_time = 0

        print("Monitoring data collection progress...")
        print(f"Status URL: {status_url}")
        print(f"Maximum wait time: {max_wait_minutes} minutes")

        while elapsed_time < max_wait_seconds:
            try:
                response = requests.get(status_url, timeout=10)

                if response.status_code == 200:
                    status_data = response.json()
                    current_status = status_data.get('status', 'unknown')

                    print(f"[{elapsed_time//60:02d}:{elapsed_time%60:02d}] Status: {current_status}")

                    # Check for completion
                    if current_status == 'success':
                        print("Data collection completed successfully!")
                        return True

                    # Check for failure
                    elif current_status in ['failed', 'error']:
                        error_msg = status_data.get('error_message', 'Unknown error')
                        print(f"ERROR: Data collection failed: {error_msg}")
                        return False

                    # Still in progress - continue waiting
                    elif current_status in ['queued', 'checking_coverage', 'landsat_started', 'prism_started']:
                        time.sleep(poll_interval)
                        elapsed_time += poll_interval

                    else:
                        print(f"WARNING: Unknown status: {current_status}")
                        time.sleep(poll_interval)
                        elapsed_time += poll_interval

                else:
                    print(f"WARNING: Status check failed: {response.status_code}")
                    time.sleep(poll_interval)
                    elapsed_time += poll_interval

            except requests.exceptions.RequestException as e:
                print(f"WARNING: Status check error: {e}")
                time.sleep(poll_interval)
                elapsed_time += poll_interval

            except Exception as e:
                print(f"ERROR: Unexpected error during status check: {e}")
                return False

        print(f"ERROR: Data collection timed out after {max_wait_minutes} minutes")
        return False


class CompleteETMapProcessor:
    def __init__(self, db_path: str = None):
        self.grid_manager = UnifiedGridManager()
        self.nldas_processor = NLDASProcessor()
        self.landsat_processor = LandsatProcessor(self.grid_manager)
        self.prism_processor = PRISMProcessor(self.grid_manager)
        self.static_processor = StaticDataProcessor(self.grid_manager)

        # Database manager for UUID lookups
        self.db_path = db_path or ETMapConfig.DB_PATH
        self.db_manager = DatabaseManager(self.db_path)
        self.et_algorithm = ETAlgorithm()

    def process_complete_etmap_data(self, request_data: dict, output_base_path: str):
        print("="*60)
        print("COMPLETE ETMAP PROCESSOR WITH MODULAR BAITSSS")
        print("Creates basic aligned data + hourly aligned files + ET calculations")
        print("="*60)

        # Extract parameters from request
        date_from = request_data['date_from']
        date_to = request_data['date_to']
        # Extract year for NLCD selection
        year = int(date_from.split('-')[0])
        geometry_dict = request_data['geometry']

        from shapely.geometry import shape
        aoi_geometry = shape(geometry_dict)

        print(f"Processing request:")
        print(f"  Date range: {date_from} to {date_to}")
        print(f"  AOI bounds: {aoi_geometry.bounds}")
        print(f"  AOI area: ~{aoi_geometry.area * 111000 * 111000:.1f} km2")

        # Create AOI shapefile
        aoi_geojson = os.path.join(output_base_path, "AOI/dynamic_aoi.geojson")
        GeospatialUtils.create_aoi_shapefile(geometry_dict, aoi_geojson)

        # Collect sample datasets
        print("\n=== Collecting Sample Datasets ===")
        sample_datasets = DataCollector.collect_sample_datasets(year)

        if not sample_datasets:
            print("ERROR: No sample datasets found. Check your data paths.")
            return

        # Compute unified grid
        print("\n=== Computing Unified Grid ===")
        global_metadata = self.grid_manager.compute_unified_grid(aoi_geometry, sample_datasets)


        # Clip to AOI
        print("\n=== Clipping to AOI ===")
        aoi_metadata = self.grid_manager.clip_to_aoi(aoi_geometry)

        # Save request and grid metadata
        self._save_processing_metadata(request_data, aoi_metadata, output_base_path)

        # Process basic datasets first
        print("\n=== STEP 1: Creating Basic Aligned Datasets ===")
        self._process_landsat_data(aoi_metadata, output_base_path)
        self._process_static_data(aoi_metadata, output_base_path, year)
        self._process_prism_data_by_dates(aoi_metadata, date_from, date_to, output_base_path)

        # Create hourly aligned files
        print("\n=== STEP 2: Creating Hourly Aligned Files ===")
        self._create_hourly_aligned_files(request_data, aoi_metadata, output_base_path)

        # Run modular BAITSSS ET algorithm
        print("\n=== STEP 3: Running Modular BAITSSS ET Algorithm ===")
        et_success = self._run_modular_baitsss_et_processing(output_base_path)

        # Final summary based on ET processing success
        if et_success:
            print("\n" + "="*60)
            print("COMPLETE PROCESSING FINISHED WITH MODULAR BAITSSS ET!")
            print(f"Basic aligned data: {output_base_path}/")
            print(f"Hourly aligned files: {output_base_path}/hourly_aligned/")
            print(f"ET enhanced files: {output_base_path}/et_enhanced/")

            # Check and display final ET map info
            final_et_path = os.path.join(output_base_path, "et_enhanced", "ET_final_result.tif")
            if os.path.exists(final_et_path):
                print(f"Final ET map: {final_et_path}")
                self._display_et_statistics(final_et_path)

            print("Ready for QGIS verification and ET analysis!")
            print("="*60)
        else:
            print("\n" + "="*60)
            print("PROCESSING COMPLETED BUT ET CALCULATIONS FAILED!")
            print(f"Basic aligned data: {output_base_path}/")
            print(f"Hourly aligned files: {output_base_path}/hourly_aligned/")
            print("ET calculations failed - check logs for errors.")
            print("="*60)

    def _process_landsat_data(self, aoi_metadata: dict, output_base_path: str):
        print("Processing Landsat Data...")
        self.landsat_processor.process_landsat_data(aoi_metadata, output_base_path)

    def _process_static_data(self, aoi_metadata: dict, output_base_path: str, year: int = None):
        print("Processing Static Data...")
        self.static_processor.process_static_data(aoi_metadata, output_base_path, year)

    def _process_prism_data_by_dates(self, aoi_metadata: dict, date_from: str, date_to: str, output_base_path: str):
        print("Processing PRISM Data...")
        self.prism_processor.process_prism_data_by_dates(aoi_metadata, date_from, date_to, output_base_path)

    def _create_hourly_aligned_files(self, request_data: dict, aoi_metadata: dict, output_base_path: str):
        modular_processor = ModularProcessor(db_path=self.db_path)
        modular_processor._create_hourly_aligned_files(request_data, aoi_metadata, output_base_path)

    def _save_processing_metadata(self, request_data: dict, aoi_metadata: dict, output_base_path: str):
        request_file = os.path.join(output_base_path, "original_request.json")
        FileManager.save_json(request_data, request_file)

        metadata_file = os.path.join(output_base_path, "grid_metadata.json")
        serializable_metadata = GeospatialUtils.serialize_geometry_metadata(aoi_metadata)
        FileManager.save_json(serializable_metadata, metadata_file)

        print(f"Metadata saved: {request_file}, {metadata_file}")

    def _run_modular_baitsss_et_processing(self, output_base_path: str) -> bool:
        print("Starting Modular BAITSSS ET Processing...")
        hourly_aligned_dir = os.path.join(output_base_path, "hourly_aligned")
        et_enhanced_dir = os.path.join(output_base_path, "et_enhanced")

        if not os.path.exists(hourly_aligned_dir):
            print(f"ERROR: Hourly aligned directory not found: {hourly_aligned_dir}")
            return False

        try:
            success = self.et_algorithm.create_enhanced_hourly_files_with_et(
                hourly_files_dir=hourly_aligned_dir,
                output_dir=et_enhanced_dir
            )

            if success:
                print("Modular BAITSSS ET processing finished successfully!")
                print(f"Enhanced hourly files: {et_enhanced_dir}")

                final_et_path = os.path.join(et_enhanced_dir, "ET_final_result.tif")
                if os.path.exists(final_et_path):
                    print(f"Final ET map verified: {final_et_path}")
                    return True
                else:
                    print(f"Warning: Final ET map not found at {final_et_path}")
                    return success

            else:
                print("Modular BAITSSS ET processing failed!")
                return False

        except Exception as e:
            print(f"ERROR: Modular BAITSSS ET processing failed: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _display_et_statistics(self, final_et_path: str):
        try:
            with rasterio.open(final_et_path) as src:
                et_data = src.read(1)
                valid_data = et_data[et_data != -9999]
                if len(valid_data) > 0:
                    print(f"ET Statistics:")
                    print(f"    Min: {np.min(valid_data):.3f} mm/day")
                    print(f"    Max: {np.max(valid_data):.3f} mm/day")
                    print(f"    Mean: {np.mean(valid_data):.3f} mm/day")
                    print(f"    Valid pixels: {len(valid_data):,}")
                    print(f"    Coverage: {100*len(valid_data)/et_data.size:.1f}%")
        except Exception as e:
            print(f"Could not calculate ET statistics: {e}")


def main():
    parser = argparse.ArgumentParser(description='Complete ETMap Processor with Modular BAITSSS ET')
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument('--curl', type=str, help='Curl command as string')
    input_group.add_argument('--uuid', type=str, help='Request ID from database')

    parser.add_argument('--output-path', type=str, help='Custom output directory (optional)')
    parser.add_argument('--db-path', type=str, help='Path to SQLite database (optional)')
    parser.add_argument('--max-wait', type=int, default=30, help='Maximum wait time for data collection in minutes')

    # Change to True to save intermediates by default
    DEFAULT_SAVE_INTERMEDIATE_FILES = False

    args = parser.parse_args()

    print("="*60)
    print("COMPLETE ETMAP PROCESSOR - MODULAR BAITSSS ET")
    print("Creates basic aligned data + hourly aligned files + ET calculations")
    print("Modular Architecture: ETAlgorithm <- BAITSSSAlgorithm")
    print(f"Intermediate files: {'SAVED TO DISK' if DEFAULT_SAVE_INTERMEDIATE_FILES else 'MEMORY ONLY'}")
    print("="*60)

    try:
        ETMapConfig.ensure_directories_exist()
        calc_manager = ETCalculationManager(args.db_path, DEFAULT_SAVE_INTERMEDIATE_FILES)

        success = False

        if args.curl:
            print("Starting full ETMap calculation workflow with modular BAITSSS ET...")
            success = calc_manager.process_with_curl_integration(args.curl, args.output_path)

        elif args.uuid:
            print("Processing existing UUID with modular BAITSSS ET...")
            success = calc_manager.process_with_existing_uuid(args.uuid, args.output_path)

        if success:
            print("\n" + "="*60)
            print("ETMAP CALCULATION WITH MODULAR BAITSSS ET COMPLETED SUCCESSFULLY!")
            if DEFAULT_SAVE_INTERMEDIATE_FILES:
                print("All intermediate files saved to disk")
            else:
                print("Intermediate files kept in memory - only final ET results saved to disk")
            print("="*60)
            sys.exit(0)
        else:
            print("\n" + "="*60)
            print("ETMAP CALCULATION FAILED!")
            print("="*60)
            sys.exit(1)

    except KeyboardInterrupt:
        print("\nProcess interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
