import os
import json
import sqlite3
import glob
import numpy as np
import geopandas as gpd
from typing import Dict, List, Optional
from shapely.geometry import shape, mapping
from datetime import datetime
from scipy.ndimage import zoom

class DatabaseManager:
    """
    Manages database connections and job lookups
    """

    def __init__(self, db_path: str):
        self.db_path = db_path

    def get_job_info(self, request_id: str) -> Optional[Dict]:
        try:
            print(f"Looking for database at: {self.db_path}")
            print(f"Database file exists: {os.path.exists(self.db_path)}")

            connection = sqlite3.connect(self.db_path)
            cursor = connection.cursor()

            # Check what tables exist in the database
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            print(f"Available tables in database: {[table[0] for table in tables]}")

            # Query the etmap_jobs table
            cursor.execute(
                'SELECT date_from, date_to, geometry, request_json, status FROM etmap_jobs WHERE request_id=?',
                (request_id,)
            )
            row = cursor.fetchone()
            connection.close()

            if row:
                date_from, date_to, geometry, request_json, status = row
                print(f"Found job in database: {request_id}")
                return {
                    'date_from': date_from,
                    'date_to': date_to,
                    'geometry': json.loads(geometry),
                    'request_json': json.loads(request_json),
                    'status': status
                }
            else:
                print(f"Job not found in database: {request_id}")
                return None

        except Exception as e:
            print(f"Error querying database: {e}")
            print(f"Database path attempted: {self.db_path}")
            return None

    def update_job_status(self, request_id: str, status: str, error_message: str = None):
        try:
            connection = sqlite3.connect(self.db_path)
            cursor = connection.cursor()

            updated_at = datetime.utcnow().isoformat()
            cursor.execute(
                'UPDATE etmap_jobs SET status=?, updated_at=?, error_message=? WHERE request_id=?',
                (status, updated_at, error_message, request_id)
            )
            connection.commit()
            connection.close()

        except Exception as e:
            print(f"Error updating job status: {e}")


class FileManager:
    @staticmethod
    def ensure_directory_exists(directory_path: str):
        os.makedirs(directory_path, exist_ok=True)

    @staticmethod
    def find_files_by_pattern(pattern: str) -> List[str]:
        return sorted(glob.glob(pattern))

    @staticmethod
    def get_date_folders(base_path: str, date_from: str, date_to: str) -> List[str]:
        if not os.path.exists(base_path):
            return []

        # Convert dates to comparable format
        start_date = date_from.replace('-', '_')
        end_date = date_to.replace('-', '_')

        filtered_folders = []
        for item in os.listdir(base_path):
            item_path = os.path.join(base_path, item)
            if os.path.isdir(item_path):
                normalized_item = item.replace('-', '_')
                if start_date <= normalized_item <= end_date:
                    filtered_folders.append(item)

        return sorted(filtered_folders)

    @staticmethod
    def save_json(data: Dict, file_path: str):
        FileManager.ensure_directory_exists(os.path.dirname(file_path))
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)

    @staticmethod
    def load_json(file_path: str) -> Optional[Dict]:
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading JSON file {file_path}: {e}")
            return None


class GeospatialUtils:
    """
    Geospatial utility functions
    """
    @staticmethod
    def create_aoi_geojson(geometry_dict: dict, output_path: str):
        geojson = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {
                    "name": "AOI",
                    "description": "Area of Interest for ETMap processing"
                },
                "geometry": geometry_dict
            }]
        }

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(geojson, f, indent=2)

        print(f"AOI GeoJSON created: {output_path}")

    @staticmethod
    def create_aoi_shapefile(geometry_dict: dict, output_path: str):
        """Alias for create_aoi_geojson for backward compatibility"""
        GeospatialUtils.create_aoi_geojson(geometry_dict, output_path)

    @staticmethod
    def serialize_geometry_metadata(aoi_metadata: Dict) -> Dict:
        serializable_metadata = aoi_metadata.copy()

        if 'transform' in serializable_metadata:
            serializable_metadata['transform'] = list(aoi_metadata['transform'])[:6]

        if 'geometry' in serializable_metadata:
            serializable_metadata['geometry'] = mapping(aoi_metadata['geometry'])

        return serializable_metadata


class ArrayUtils:
    """
    Array manipulation utilities
    """

    @staticmethod
    def resize_array_to_target(array: np.ndarray, target_shape: tuple) -> np.ndarray:
        if array.shape == target_shape:
            return array.astype(np.float32)

        try:
            zoom_factors = (target_shape[0] / array.shape[0], target_shape[1] / array.shape[1])
            resized_array = zoom(array, zoom_factors, order=0)
        except ImportError:
            resized_array = np.resize(array, target_shape)

        return resized_array.astype(np.float32)

    @staticmethod
    def calculate_lai_from_ndvi(ndvi: np.ndarray) -> np.ndarray:
        lai = np.where(ndvi > 0, 3.618 * ndvi - 0.118, 0.0)
        lai = np.clip(lai, 0.0, 8.0)
        return lai.astype(np.float32)

    @staticmethod
    def calculate_ndvi(b4_data: np.ndarray, b5_data: np.ndarray, nodata: float = -9999.0) -> np.ndarray:
        b4_data = b4_data.astype(np.float32)
        b5_data = b5_data.astype(np.float32)

        denominator = b5_data + b4_data
        valid_mask = (denominator != 0) & (b4_data != nodata) & (b5_data != nodata)

        ndvi = np.full(b4_data.shape, nodata, dtype=np.float32)
        ndvi[valid_mask] = (b5_data[valid_mask] - b4_data[valid_mask]) / denominator[valid_mask]
        ndvi = np.clip(ndvi, -1.0, 1.0, out=ndvi, where=valid_mask)

        return ndvi


class ValidationUtils:
    """
    Data validation utilities
    """

    @staticmethod
    def validate_uuid(uuid_string: str) -> bool:
        import uuid
        try:
            uuid.UUID(uuid_string)
            return True
        except ValueError:
            return False

    @staticmethod
    def validate_date_format(date_string: str) -> bool:
        try:
            datetime.fromisoformat(date_string)
            return True
        except ValueError:
            return False

    @staticmethod
    def validate_file_exists(file_path: str) -> bool:
        return os.path.exists(file_path) and os.path.isfile(file_path)


class LoggingUtils:
    """
    Logging and progress utilities
    """

    @staticmethod
    def print_progress_header(title: str, width: int = 60):
        print("=" * width)
        print(title)
        print("=" * width)

    @staticmethod
    def print_step_header(step_name: str):
        print(f"\n=== {step_name} ===")

    @staticmethod
    def print_success(message: str):
        print(f"{message}")

    @staticmethod
    def print_error(message: str):
        print(f"{message}")

    @staticmethod
    def print_warning(message: str):
        print(f"{message}")
