import json
from shapely.geometry import shape
from typing import Optional

class RawDataUtils:
    """
    Utility functions for raw data operations
    """

    @staticmethod
    def parse_geometry(geometry_json: str) -> Optional[object]:
        if not geometry_json:
            return None

        try:
            if isinstance(geometry_json, str):
                geometry_dict = json.loads(geometry_json)
            else:
                geometry_dict = geometry_json

            return shape(geometry_dict)
        except Exception as e:
            raise ValueError(f"Invalid geometry JSON: {e}")

    @staticmethod
    def validate_geometry(geometry_dict: dict):
        try:
            shape(geometry_dict)
        except Exception as e:
            raise ValueError(f"Invalid geometry: {e}")

    @staticmethod
    def format_file_size(size_bytes: int) -> str:
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f} TB"
