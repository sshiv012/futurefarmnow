"""
ET Algorithm - Main Processing Workflow
"""

import os
import glob
import json
import logging
from typing import Dict, List, Optional
from datetime import datetime
import numpy as np
import rasterio
import matplotlib.pyplot as plt
from .baitsss_algorithm import BAITSSSAlgorithm

logger = logging.getLogger(__name__)


class ETAlgorithm:
    def __init__(self):
        self.block_size = 200
        self.baitsss = BAITSSSAlgorithm()

    def create_enhanced_hourly_files_with_et(self, hourly_files_dir: str, output_dir: str, save_intermediate_files: bool = True) -> bool:
        logger.info("Starting BAITSSS ET Processing")
        logger.debug(f"Input directory: {hourly_files_dir}")
        logger.debug(f"Output directory: {output_dir}")
        logger.debug(f"Save intermediate files: {save_intermediate_files}")

        try:
            hourly_files = self._get_sorted_hourly_files(hourly_files_dir)
            if not hourly_files:
                logger.error(f"No hourly files found in {hourly_files_dir}")
                return False

            logger.info(f"Found {len(hourly_files)} hourly files to process")
            os.makedirs(output_dir, exist_ok=True)

            # Process hourly sequence
            processed_data, processed_count = self._process_hourly_sequence(hourly_files, output_dir, save_intermediate_files)

            logger.info(f"Processing complete: {processed_count}/{len(hourly_files)} files processed successfully")

            if processed_count > 0:
                self._create_comprehensive_et_summary(output_dir, processed_data, save_intermediate_files)
                return True
            return False

        except Exception as e:
            logger.error(f"ET processing failed: {e}", exc_info=True)
            return False

    def _get_sorted_hourly_files(self, hourly_files_dir: str) -> List[str]:
        pattern = os.path.join(hourly_files_dir, "*.tif")
        files = glob.glob(pattern)
        return sorted(files, key=lambda x: os.path.basename(x))

    def _process_hourly_sequence(self, hourly_files: List[str], output_dir: str, save_intermediate_files: bool) -> tuple:
        previous_state = None
        processed_count = 0
        all_processed_data = []

        for i, hourly_file in enumerate(hourly_files):
            filename = os.path.basename(hourly_file)
            logger.info(f"Processing hour {i+1}/{len(hourly_files)}: {filename}")

            result = self._process_single_hourly_file(hourly_file, output_dir, previous_state, save_intermediate_files)
            if result is not None:
                current_state, enhanced_data, profile = result
                processed_count += 1
                previous_state = current_state

                all_processed_data.append({
                    'filename': filename,
                    'enhanced_data': enhanced_data,
                    'state': current_state.copy(),
                    'profile': profile
                })

                logger.debug(f"Hour {i+1} completed: {filename}")
            else:
                logger.warning(f"Hour {i+1} failed: {filename}")

        return all_processed_data, processed_count

    def _process_single_hourly_file(self, hourly_file: str, output_dir: str,
                                    previous_state: Optional[Dict], save_intermediate_files: bool) -> Optional[tuple]:
        try:
            filename = os.path.basename(hourly_file)
            output_filename = filename.replace('.tif', '_enhanced.tif')
            output_path = os.path.join(output_dir, output_filename)

            with rasterio.open(hourly_file) as src:
                input_data = src.read()
                height, width = input_data.shape[1], input_data.shape[2]
                profile = src.profile

                logger.debug(f"Processing {height}x{width} pixels")

                if previous_state is None:
                    logger.debug("Initializing first hour state")
                    current_state = self._initialize_et_state(height, width)
                else:
                    current_state = {k: v.copy() for k, v in previous_state.items()}

                variables = self._extract_variables_from_bands(input_data)

                updated_state = self._run_blockwise_baitsss(variables, current_state, height, width)
                if updated_state is None:
                    return None

                enhanced_data = self._create_enhanced_output(input_data, updated_state)

                if save_intermediate_files:
                    self._save_enhanced_file(enhanced_data, output_path, profile)
                    logger.debug(f"Saved: {output_filename} ({enhanced_data.shape[0]} bands)")

                return updated_state, enhanced_data, profile

        except Exception as e:
            logger.error(f"Error processing {hourly_file}: {e}")
            return None

    def _initialize_et_state(self, height: int, width: int) -> Dict[str, np.ndarray]:
        return {
            'et_cumulative': np.zeros((height, width), dtype=np.float32),
            'precip_cumulative': np.zeros((height, width), dtype=np.float32),
            'irrigation_cumulative': np.zeros((height, width), dtype=np.float32),
            'soil_moisture_surface': np.full((height, width), 0.2, dtype=np.float32),
            'soil_moisture_root': np.full((height, width), 0.3, dtype=np.float32),
        }

    def _extract_variables_from_bands(self, input_data: np.ndarray) -> Dict[str, np.ndarray]:
        band_mapping = {
            0: 'soil_awc',
            1: 'soil_fc',
            2: 'nlcd',
            3: 'elevation',
            4: 'precipitation',
            5: 'ndvi',
            6: 'lai',
            7: 'temperature',
            8: 'humidity',
            9: 'wind_speed',
            10: 'radiation',
        }

        logger.debug(f"Extracting variables from {input_data.shape[0]} input bands")

        variables: Dict[str, np.ndarray] = {}
        H, W = input_data.shape[1], input_data.shape[2]

        for band_idx, var_name in band_mapping.items():
            if band_idx < input_data.shape[0]:
                arr = input_data[band_idx].astype(np.float32)
                arr = np.where(arr == -9999, np.nan, arr)
                variables[var_name] = arr
            else:
                variables[var_name] = self._get_default_array(var_name, H, W)
                logger.debug(f"Band {band_idx+1} ({var_name}): using defaults")

        # Fill NaN values with defaults
        for var_name in list(variables.keys()):
            if np.isnan(variables[var_name]).any():
                fill = self._get_default_scalar(var_name)
                variables[var_name] = np.nan_to_num(variables[var_name], nan=fill)

        return variables

    def _get_default_scalar(self, var_name: str) -> float:
        defaults = {
            'soil_awc': 0.15,
            'soil_fc': 35.0,
            'elevation': 200.0,
            'nlcd': 42.0,
            'precipitation': 0.0,
            'ndvi': 0.4,
            'lai': 3.0,
            'temperature': 15.0,
            'humidity': 0.65,
            'wind_speed': 3.0,
            'radiation': 400.0,
        }
        return float(defaults.get(var_name, 0.0))

    def _get_default_array(self, var_name: str, height: int, width: int) -> np.ndarray:
        return np.full((height, width), self._get_default_scalar(var_name), dtype=np.float32)

    def _run_blockwise_baitsss(self, variables: Dict[str, np.ndarray],
                               state: Dict[str, np.ndarray],
                               height: int, width: int) -> Optional[Dict[str, np.ndarray]]:
        try:
            logger.debug(f"Block-wise BAITSSS: {height}x{width} pixels, block size {self.block_size}")

            et_hourly = np.zeros((height, width), dtype=np.float32)
            new_soil_surface = state['soil_moisture_surface'].copy()
            new_soil_root = state['soil_moisture_root'].copy()
            precipitation_hour = variables.get('precipitation', np.zeros((height, width), dtype=np.float32))
            irrigation_hour = np.zeros((height, width), dtype=np.float32)

            blocks_processed = 0
            failed_blocks = 0
            total_blocks = ((height + self.block_size - 1) // self.block_size) * \
                            ((width + self.block_size - 1) // self.block_size)

            for b_i in range(0, height, self.block_size):
                for b_j in range(0, width, self.block_size):
                    block_height = min(self.block_size, height - b_i)
                    block_width = min(self.block_size, width - b_j)

                    block_vars = self._extract_block_data(variables, state, b_i, b_j, block_height, block_width)

                    block_results = self.baitsss.process_block(block_vars, block_height, block_width)
                    if block_results is not None:
                        et_hourly[b_i:b_i+block_height, b_j:b_j+block_width] = block_results['et_hour']
                        new_soil_surface[b_i:b_i+block_height, b_j:b_j+block_width] = block_results['soil_surface']
                        new_soil_root[b_i:b_i+block_height, b_j:b_j+block_width] = block_results['soil_root']
                        irrigation_hour[b_i:b_i+block_height, b_j:b_j+block_width] = block_results['irrigation']
                    else:
                        failed_blocks += 1
                        et_hourly[b_i:b_i+block_height, b_j:b_j+block_width] = 2.0

                    blocks_processed += 1

            if failed_blocks > 0:
                logger.warning(f"Block processing: {failed_blocks}/{total_blocks} blocks used fallback values")

            # ET summary statistics
            et_valid = np.sum((et_hourly > 0) & (et_hourly < 50))
            et_mean = float(np.mean(et_hourly[et_hourly > 0])) if np.any(et_hourly > 0) else 0.0
            logger.debug(f"ET results: {et_valid:,} valid pixels, mean={et_mean:.3f} mm/hr, range=[{np.min(et_hourly):.3f}, {np.max(et_hourly):.3f}]")

            # Update cumulative state
            updated_state = {
                'et_cumulative': state['et_cumulative'] + et_hourly,
                'precip_cumulative': state['precip_cumulative'] + precipitation_hour,
                'irrigation_cumulative': state['irrigation_cumulative'] + irrigation_hour,
                'soil_moisture_surface': new_soil_surface,
                'soil_moisture_root': new_soil_root,
            }

            return updated_state

        except Exception as e:
            logger.error(f"Block-wise processing failed: {e}", exc_info=True)
            return None

    def _extract_block_data(self, variables: Dict[str, np.ndarray], state: Dict[str, np.ndarray],
                            b_i: int, b_j: int, block_height: int, block_width: int) -> Dict[str, np.ndarray]:
        block_vars: Dict[str, np.ndarray] = {}

        for var_name, var_data in variables.items():
            block_vars[var_name] = var_data[b_i:b_i+block_height, b_j:b_j+block_width]

        block_vars['soil_moisture_surface_prev'] = state['soil_moisture_surface'][b_i:b_i+block_height, b_j:b_j+block_width]
        block_vars['soil_moisture_root_prev'] = state['soil_moisture_root'][b_i:b_i+block_height, b_j:b_j+block_width]

        return block_vars

    def _create_enhanced_output(self, input_data: np.ndarray, state: Dict[str, np.ndarray]) -> np.ndarray:
        enhanced_bands = [
            input_data,
            state['et_cumulative'][np.newaxis, :, :],
            state['precip_cumulative'][np.newaxis, :, :],
            state['irrigation_cumulative'][np.newaxis, :, :],
            state['soil_moisture_surface'][np.newaxis, :, :],
            state['soil_moisture_root'][np.newaxis, :, :],
        ]
        return np.concatenate(enhanced_bands, axis=0)

    def _save_enhanced_file(self, enhanced_data: np.ndarray, output_path: str, profile: dict):
        profile.update({
            'count': enhanced_data.shape[0],
            'dtype': 'float32',
            'nodata': -9999,
            'compress': 'lzw',
        })
        with rasterio.open(output_path, 'w', **profile) as dst:
            dst.write(enhanced_data)

    def _create_comprehensive_et_summary(self, output_dir: str, processed_data: List[Dict] = None, save_intermediate_files: bool = True):
        try:
            logger.info("Creating comprehensive ET summary")

            if processed_data and not save_intermediate_files:
                logger.debug("Using in-memory processed data for summary")
                daily_groups = self._group_processed_data_by_day(processed_data)
            else:
                logger.debug("Reading enhanced files from disk for summary")
                enhanced_files = sorted(glob.glob(os.path.join(output_dir, "*_enhanced.tif")))
                if not enhanced_files:
                    logger.warning("No enhanced files found for summary")
                    return
                daily_groups = self._group_files_by_day(enhanced_files)

            daily_et_files: List[str] = []
            prev_cum = None
            for date_str in sorted(daily_groups.keys()):
                if processed_data and not save_intermediate_files:
                    result = self._create_daily_et_summary_from_memory(daily_groups[date_str], output_dir, date_str, prev_cum)
                else:
                    result = self._create_daily_et_summary(daily_groups[date_str], output_dir, date_str, prev_cum)

                if result:
                    daily_path, prev_cum = result
                    daily_et_files.append(daily_path)

            if daily_et_files:
                self._create_final_et_summary(daily_et_files, output_dir)

            # JSON summary
            self._create_json_summary(output_dir, processed_data if processed_data else [])
            logger.info("Comprehensive ET summary completed")

        except Exception as e:
            logger.error(f"Error creating ET summary: {e}")

    def _group_processed_data_by_day(self, processed_data: List[Dict]) -> Dict[str, List[Dict]]:
        daily_groups: Dict[str, List[Dict]] = {}
        for data_item in processed_data:
            filename = data_item['filename']
            date_part = filename.split('_')[0]
            daily_groups.setdefault(date_part, []).append(data_item)
        return daily_groups

    def _group_files_by_day(self, enhanced_files: List[str]) -> Dict[str, List[str]]:
        daily_groups: Dict[str, List[str]] = {}
        for file_path in enhanced_files:
            filename = os.path.basename(file_path)
            date_part = filename.split('_')[0]
            daily_groups.setdefault(date_part, []).append(file_path)
        return daily_groups

    def _create_daily_et_summary_from_memory(self, processed_items: List[Dict], output_dir: str, date_str: str,
                                           baseline_cum: Optional[np.ndarray]) -> Optional[tuple]:
        try:
            processed_items = sorted(processed_items, key=lambda x: x['filename'])
            template_item = processed_items[0]

            last_item = processed_items[-1]
            enhanced_data = last_item['enhanced_data']

            original_bands = enhanced_data.shape[0] - 5
            et_last = enhanced_data[original_bands]

            if baseline_cum is None:
                baseline = np.zeros_like(et_last, dtype=np.float32)
            else:
                baseline = baseline_cum.astype(np.float32)

            daily = (et_last.astype(np.float32) - baseline)
            nodata = -9999.0
            mask = (et_last == nodata)
            daily = np.where(mask, nodata, daily).astype(np.float32)

            daily_et_path = os.path.join(output_dir, f"ET_daily_{date_str}.tif")
            profile = template_item['profile'].copy()
            profile.update({'count': 1, 'dtype': 'float32', 'nodata': -9999})

            with rasterio.open(daily_et_path, 'w', **profile) as dst:
                dst.write(daily, 1)
                dst.set_band_description(1, f"Daily ET increment - {date_str}")

            logger.debug(f"Created daily summary (from memory): {date_str}")
            return (daily_et_path, et_last)

        except Exception as e:
            logger.error(f"Error creating daily summary from memory for {date_str}: {e}")
            return None

    def _create_daily_et_summary(self, hourly_files: List[str], output_dir: str, date_str: str,
                             baseline_cum: Optional[np.ndarray]) -> Optional[tuple]:
        try:
            hourly_files = sorted(hourly_files)
            template_file = hourly_files[0]

            with rasterio.open(template_file) as src0:
                original_bands = src0.count - 5
                profile = src0.profile.copy()
                profile.update({'count': 1, 'dtype': 'float32', 'nodata': -9999})

            last_file = hourly_files[-1]
            with rasterio.open(last_file) as src_last:
                et_last = src_last.read(original_bands + 1)

            if baseline_cum is None:
                baseline = np.zeros_like(et_last, dtype=np.float32)
            else:
                baseline = baseline_cum.astype(np.float32)

            daily = (et_last.astype(np.float32) - baseline)
            nodata = -9999.0
            mask = (et_last == nodata)
            daily = np.where(mask, nodata, daily).astype(np.float32)

            daily_et_path = os.path.join(output_dir, f"ET_daily_{date_str}.tif")
            with rasterio.open(template_file) as template:
                prof = template.profile.copy()
                prof.update({'count': 1, 'dtype': 'float32', 'nodata': -9999})
                with rasterio.open(daily_et_path, 'w', **prof) as dst:
                    dst.write(daily, 1)
                    dst.set_band_description(1, f"Daily ET increment - {date_str}")

            logger.debug(f"Created daily summary: {date_str}")
            return (daily_et_path, et_last)

        except Exception as e:
            logger.error(f"Error creating daily summary for {date_str}: {e}")
            return None

    def _create_final_et_summary(self, daily_et_files: List[str], output_dir: str):
        try:
            logger.info("Creating final ET summary")

            daily_arrays: List[np.ndarray] = []
            template_file = daily_et_files[0]

            for file_path in daily_et_files:
                with rasterio.open(file_path) as src:
                    daily_et = src.read(1)
                    daily_arrays.append(daily_et)

            daily_stack = np.stack(daily_arrays, axis=0)
            valid_mask = daily_stack != -9999
            mean_et = np.full(daily_stack.shape[1:], -9999.0, dtype=np.float32)

            # pixelwise mean over valid values
            for i in range(daily_stack.shape[1]):
                for j in range(daily_stack.shape[2]):
                    vals = daily_stack[:, i, j]
                    vals = vals[valid_mask[:, i, j]]
                    if vals.size > 0:
                        mean_et[i, j] = float(np.mean(vals))

            final_et_tif = os.path.join(output_dir, "ET_final_result.tif")
            with rasterio.open(template_file) as template:
                profile = template.profile.copy()
                profile.update({'count': 1, 'dtype': 'float32', 'nodata': -9999})
                bounds = template.bounds
                with rasterio.open(final_et_tif, 'w', **profile) as dst:
                    dst.write(mean_et, 1)
                    dst.set_band_description(1, f"Mean ET over {len(daily_et_files)} days")

            # Visualization with geographic extent
            try:
                self._create_et_visualization(mean_et, output_dir, bounds)
            except ImportError:
                logger.warning("Matplotlib not available - skipping PNG creation")

            logger.info(f"Final ET TIF created: {final_et_tif}")

        except Exception as e:
            logger.error(f"Error creating final summary: {e}")

    def _create_et_visualization(self, et_data: np.ndarray, output_dir: str, bounds=None):
        et_masked = np.ma.masked_where(et_data == -9999, et_data)

        if bounds is not None:
            minx, miny, maxx, maxy = bounds.left, bounds.bottom, bounds.right, bounds.top
            extent = [minx, maxx, miny, maxy]
            mean_lat = 0.5 * (miny + maxy)
            aspect = 1.0 / np.cos(np.deg2rad(mean_lat))
        else:
            h, w = et_data.shape
            extent = [0, w, 0, h]
            aspect = 'equal'

        fig, ax = plt.subplots(figsize=(10, 7))
        cmap = plt.cm.viridis
        cmap.set_bad(alpha=0.0)

        ax.imshow(
            et_masked,
            cmap=cmap,
            interpolation='nearest',
            extent=extent,
            origin='upper',
            aspect=aspect,
        )

        ax.axis('off')

        plt.subplots_adjust(top=1, bottom=0, right=1, left=0, hspace=0, wspace=0)
        plt.margins(0, 0)
        ax.xaxis.set_major_locator(plt.NullLocator())
        ax.yaxis.set_major_locator(plt.NullLocator())

        png_path = os.path.join(output_dir, "ET_final_result.png")
        fig.savefig(png_path, dpi=220, bbox_inches='tight', pad_inches=0, facecolor='none', edgecolor='none')
        plt.close(fig)
        logger.debug(f"ET visualization created: {png_path}")

    def _create_json_summary(self, output_dir: str, processed_data: List[Dict]):
        try:
            final_tif = os.path.join(output_dir, "ET_final_result.tif")

            summary = {
                'processing_info': {
                    'algorithm': 'BAITSSS (Modular Implementation)',
                    'processing_date': datetime.now().isoformat(),
                    'block_size': self.block_size,
                    'temporal_continuity': True,
                    'total_enhanced_files': len(processed_data),
                    'physics_module': 'BAITSSSAlgorithm',
                    'workflow_module': 'ETAlgorithm',
                },
                'output_files': {
                    'final_et_map': final_tif,
                    'format': 'GeoTIFF',
                    'units': 'mm/day',
                    'description': 'Mean ET over processing period',
                },
            }

            if os.path.exists(final_tif):
                with rasterio.open(final_tif) as src:
                    et_data = src.read(1)
                    valid_data = et_data[et_data != -9999]
                    if valid_data.size > 0:
                        summary['statistics'] = {
                            'min_et_mm_day': float(np.min(valid_data)),
                            'max_et_mm_day': float(np.max(valid_data)),
                            'mean_et_mm_day': float(np.mean(valid_data)),
                            'median_et_mm_day': float(np.median(valid_data)),
                            'std_et_mm_day': float(np.std(valid_data)),
                            'valid_pixels': int(valid_data.size),
                            'total_pixels': int(et_data.size),
                            'coverage_percent': float(100 * valid_data.size / et_data.size),
                        }

            summary_path = os.path.join(output_dir, "ET_comprehensive_summary.json")
            with open(summary_path, 'w') as f:
                json.dump(summary, f, indent=2)
            logger.debug(f"JSON summary created: {summary_path}")

        except Exception as e:
            logger.error(f"Error creating JSON summary: {e}")


class ETResultsManager:

    @staticmethod
    def create_comprehensive_et_summary(output_dir: str, _request_data: Dict):
        et_algorithm = ETAlgorithm()
        et_algorithm._create_json_summary(output_dir, [])
