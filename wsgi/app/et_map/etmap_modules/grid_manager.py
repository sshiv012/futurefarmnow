import os
import numpy as np
import rasterio
from rasterio.warp import (
    calculate_default_transform,
    reproject,
    Resampling,
    transform_geom,
)
from affine import Affine
from shapely.geometry import shape, mapping
from pyproj import CRS, Transformer
from typing import Dict, List

from .config import ETMapConfig
from .utils import LoggingUtils


class UnifiedGridManager:

    def __init__(self, target_crs: str = None):
        self.target_crs = target_crs or ETMapConfig.TARGET_CRS
        self.grid_metadata = None

    def compute_unified_grid(
        self,
        aoi_geometry,
        sample_datasets: List[str],
        aoi_crs: str = "EPSG:4326",
    ) -> Dict:
        LoggingUtils.print_step_header("Computing Unified Grid Metadata")

        min_x = float("inf")
        max_x = float("-inf")
        min_y = float("inf")
        max_y = float("-inf")
        min_cell_x = float("inf")
        min_cell_y = float("inf")

        if aoi_crs != self.target_crs:
            try:
                aoi_bounds_geometry = transform_geom(aoi_crs, self.target_crs, mapping(aoi_geometry))
                aoi_bounds = shape(aoi_bounds_geometry).bounds
            except Exception as e:
                LoggingUtils.print_warning(f"Could not transform AOI geometry: {e}")
                aoi_bounds = aoi_geometry.bounds
        else:
            aoi_bounds = aoi_geometry.bounds

        # Seed with AOI
        min_x = min(min_x, aoi_bounds[0])
        min_y = min(min_y, aoi_bounds[1])
        max_x = max(max_x, aoi_bounds[2])
        max_y = max(max_y, aoi_bounds[3])

        valid_datasets_count = 0
        target_crs_obj = CRS.from_string(self.target_crs)

        for dataset_path in sample_datasets:
            if not os.path.exists(dataset_path):
                continue
            try:
                with rasterio.open(dataset_path) as src:
                    print(f"Processing sample: {os.path.basename(dataset_path)}")
                    src_crs = src.crs
                    bounds = src.bounds

                    if src_crs and src_crs != target_crs_obj:
                        corners = [
                            (bounds.left, bounds.bottom),
                            (bounds.right, bounds.bottom),
                            (bounds.right, bounds.top),
                            (bounds.left, bounds.top),
                        ]
                        transformer = Transformer.from_crs(src_crs, target_crs_obj, always_xy=True)
                        tx_corners = [transformer.transform(x, y) for (x, y) in corners]
                        xs, ys = zip(*tx_corners)
                        bminx, bmaxx = min(xs), max(xs)
                        bminy, bmaxy = min(ys), max(ys)

                        _, dst_w, dst_h = calculate_default_transform(
                            src_crs, target_crs_obj, src.width, src.height, *bounds
                        )
                        cell_x = abs((bmaxx - bminx) / max(dst_w, 1))
                        cell_y = abs((bmaxy - bminy) / max(dst_h, 1))
                    else:
                        bminx, bminy = bounds.left, bounds.bottom
                        bmaxx, bmaxy = bounds.right, bounds.top
                        cell_x = abs(src.transform.a)
                        cell_y = abs(src.transform.e)

                    min_x = min(min_x, bminx)
                    min_y = min(min_y, bminy)
                    max_x = max(max_x, bmaxx)
                    max_y = max(max_y, bmaxy)

                    min_cell_x = min(min_cell_x, cell_x)
                    min_cell_y = min(min_cell_y, cell_y)

                    valid_datasets_count += 1

            except Exception as e:
                LoggingUtils.print_warning(f"Could not read {dataset_path}: {e}")
                continue

        if valid_datasets_count == 0 or not np.isfinite(min_cell_x) or not np.isfinite(min_cell_y):
            min_cell_x = min_cell_y = ETMapConfig.DEFAULT_CELL_SIZE
            LoggingUtils.print_warning("No valid sample datasets; using default 30m resolution (deg-equivalent)")

        grid_width = int(np.floor(abs(max_x - min_x) / max(min_cell_x, 1e-12)))
        grid_height = int(np.floor(abs(max_y - min_y) / max(min_cell_y, 1e-12)))
        grid_width = max(grid_width, 1)
        grid_height = max(grid_height, 1)

        grid_transform = Affine(min_cell_x, 0.0, min_x, 0.0, -min_cell_y, max_y)

        self.grid_metadata = {
            "crs": self.target_crs,
            "transform": grid_transform,
            "width": grid_width,
            "height": grid_height,
            "bounds": (min_x, min_y, max_x, max_y),
            "cell_size": (min_cell_x, min_cell_y),
            "valid_datasets_count": valid_datasets_count,
        }

        print("Unified grid computed:")
        print(f"  Dimensions: {grid_width} x {grid_height} pixels")
        print(f"  Cell size: {min_cell_x:.8f} x {min_cell_y:.8f} degrees")
        print(f"  Bounds: ({min_x:.6f}, {min_y:.6f}, {max_x:.6f}, {max_y:.6f})")
        print(f"  Sample datasets used: {valid_datasets_count}")

        return self.grid_metadata

    def clip_to_aoi(self, aoi_geometry, aoi_crs: str = "EPSG:4326") -> Dict:
        if not self.grid_metadata:
            raise ValueError("Must compute unified grid first")

        LoggingUtils.print_step_header("Clipping Grid to AOI")

        # AOI bounds in target CRS
        if aoi_crs != self.target_crs:
            try:
                aoi_bounds_geometry = transform_geom(aoi_crs, self.target_crs, mapping(aoi_geometry))
                aoi_bounds = shape(aoi_bounds_geometry).bounds
            except Exception as e:
                LoggingUtils.print_warning(f"Could not transform AOI geometry: {e}")
                aoi_bounds = aoi_geometry.bounds
        else:
            aoi_bounds = aoi_geometry.bounds

        # Intersect with global grid bounds
        gminx, gminy, gmaxx, gmaxy = self.grid_metadata["bounds"]
        minx = max(aoi_bounds[0], gminx)
        miny = max(aoi_bounds[1], gminy)
        maxx = min(aoi_bounds[2], gmaxx)
        maxy = min(aoi_bounds[3], gmaxy)

        gt: Affine = self.grid_metadata["transform"]
        cell_x, cell_y = self.grid_metadata["cell_size"]

        i1 = max(0, int(np.floor((minx - gt.c) / cell_x)))
        i2 = min(self.grid_metadata["width"], int(np.ceil((maxx - gt.c) / cell_x)))
        j1 = max(0, int(np.floor((gt.f - maxy) / cell_y)))
        j2 = min(self.grid_metadata["height"], int(np.ceil((gt.f - miny) / cell_y)))

        clipped_width = max(i2 - i1, 1)
        clipped_height = max(j2 - j1, 1)

        x1 = gt.c + i1 * cell_x
        x2 = gt.c + i2 * cell_x
        y2 = gt.f - j1 * cell_y
        y1 = gt.f - j2 * cell_y

        clipped_transform = Affine(cell_x, 0.0, x1, 0.0, -cell_y, y2)

        aoi_metadata = {
            "crs": self.target_crs,
            "transform": clipped_transform,
            "width": clipped_width,
            "height": clipped_height,
            "bounds": (x1, y1, x2, y2),
            "cell_size": (cell_x, cell_y),
            "geometry": aoi_geometry,
        }

        print("AOI grid clipped (pixel-aligned):")
        print(f"  Dimensions: {clipped_width} x {clipped_height} pixels")
        print(f"  Bounds: ({x1:.6f}, {y1:.6f}, {x2:.6f}, {y2:.6f})")
        return aoi_metadata

    def align_raster_to_grid(
        self,
        source_path: str,
        output_path: str,
        grid_metadata: Dict,
        resampling_method=Resampling.nearest,
    ) -> bool:
        try:
            with rasterio.open(source_path) as src:
                print(f"Aligning {os.path.basename(source_path)} to unified grid...")

                H, W = grid_metadata["height"], grid_metadata["width"]
                dst_nodata = -9999.0

                out = np.full((src.count, H, W), dst_nodata, dtype=np.float32)

                # Reproject each band
                for b in range(1, src.count + 1):
                    src_band = rasterio.band(src, b)
                    reproject(
                        source=src_band,
                        destination=out[b - 1],
                        src_transform=src.transform,
                        src_crs=src.crs,
                        dst_transform=grid_metadata["transform"],
                        dst_crs=grid_metadata["crs"],
                        resampling=resampling_method,
                        src_nodata=src.nodata,
                        dst_nodata=dst_nodata,
                    )

                profile = ETMapConfig.GEOTIFF_PROFILE.copy()
                profile.update(
                    {
                        "dtype": "float32",
                        "nodata": dst_nodata,
                        "width": W,
                        "height": H,
                        "count": src.count,
                        "crs": grid_metadata["crs"],
                        "transform": grid_metadata["transform"],
                    }
                )

                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with rasterio.open(output_path, "w", **profile) as dst:
                    dst.write(out)

                LoggingUtils.print_success(
                    f"Successfully aligned to {grid_metadata['width']}x{grid_metadata['height']} grid"
                )
                return True

        except Exception as e:
            LoggingUtils.print_error(f"Error aligning {source_path}: {e}")
            return False


class RasterProcessor:

    @staticmethod
    def get_raster_info(raster_path: str) -> Dict:
        try:
            with rasterio.open(raster_path) as src:
                return {
                    "width": src.width,
                    "height": src.height,
                    "count": src.count,
                    "crs": src.crs.to_string() if src.crs else None,
                    "bounds": src.bounds,
                    "transform": src.transform,
                    "dtype": src.dtypes[0],
                    "nodata": src.nodata,
                }
        except Exception as e:
            LoggingUtils.print_error(f"Error reading raster info from {raster_path}: {e}")
            return {}

    @staticmethod
    def validate_raster_alignment(raster_paths: List[str]) -> bool:
        if len(raster_paths) < 2:
            return True

        reference_info = RasterProcessor.get_raster_info(raster_paths[0])
        if not reference_info:
            return False

        for raster_path in raster_paths[1:]:
            info = RasterProcessor.get_raster_info(raster_path)
            if not info:
                return False

            if (
                info["width"] != reference_info["width"]
                or info["height"] != reference_info["height"]
                or info["transform"] != reference_info["transform"]
                or info["crs"] != reference_info["crs"]
            ):
                LoggingUtils.print_error(f"Raster {raster_path} not aligned with reference")
                return False

        LoggingUtils.print_success("All rasters are properly aligned")
        return True
