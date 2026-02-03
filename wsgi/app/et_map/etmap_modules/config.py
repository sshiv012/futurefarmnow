#!/usr/bin/env python3
"""
ETMap Configuration Module
Contains all configuration settings and file paths
"""

import os


class ETMapConfig:
    """
    Configuration class for ETMap processing system
    """

    # Base paths
    REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    DATA_BASE_PATH = os.environ.get("ETMAP_DATA_DIR", os.path.join(REPO_ROOT, "etmap_data"))
    RESULTS_BASE_PATH = os.environ.get("ETMAP_RESULTS_DIR", os.path.join(REPO_ROOT, "results"))
    DB_PATH = os.environ.get("ETMAP_DB_PATH", os.path.join(REPO_ROOT, "etmap.db"))

    # Data source paths
    LANDSAT_B4_DIR = os.path.join(DATA_BASE_PATH, 'Landsat_B4')
    LANDSAT_B5_DIR = os.path.join(DATA_BASE_PATH, 'Landsat_B5')
    PRISM_DIR = os.path.join(DATA_BASE_PATH, 'Prism_Daily')
    NLDAS_DIR = os.path.join(DATA_BASE_PATH, 'NLDAS_GeoTiff')

    # Static data paths
    STATIC_DATA_PATHS = {
        'elevation': os.path.join(DATA_BASE_PATH, 'LF2020_Elev_220_CONUS/Tif/LC20_Elev_220.tif'),
        'soil_awc': os.path.join(DATA_BASE_PATH, 'Soil_Data/awc_gNATSGO_US.tif'),
        'soil_fc': os.path.join(DATA_BASE_PATH, 'Soil_Data/fc_gNATSGO_US.tif'),
        'nlcd': os.path.join(DATA_BASE_PATH, 'NLCD/Annual_NLCD_LndCov_{year}_CU_C1V1/Annual_NLCD_LndCov_{year}_CU_C1V1.tif')
    }

    # Available years
    AVAILABLE_NLCD_YEARS = [2019]
    AVAILABLE_ELEVATION_YEARS = [2020]

    # Processing configuration
    TARGET_CRS = 'EPSG:4326'
    DEFAULT_CELL_SIZE = 0.0002778
    MAX_LANDSAT_SCENES = 10

    # PRISM variables
    PRISM_VARIABLES = ["ppt", "tmin", "tmax", "tmean", "tdmean", "vpdmin", "vpdmax"]

    # Output structure
    OUTPUT_FOLDERS = {
        'aoi': 'AOI',
        'static': 'static',
        'landsat': 'landsat',
        'prism': 'prism',
        'hourly_aligned': 'hourly_aligned'
    }

    # Static data processing configuration
    STATIC_LAYERS_CONFIG = {
        'elevation': {
            'path_key': 'elevation',
            'resampling': 'nearest',
            'output_name': 'elevation_aligned.tif'
        },
        'soil_awc': {
            'path_key': 'soil_awc',
            'resampling': 'nearest',
            'output_name': 'soil_awc_aligned.tif'
        },
        'soil_fc': {
            'path_key': 'soil_fc',
            'resampling': 'nearest',
            'output_name': 'soil_fc_aligned.tif'
        },
        'nlcd': {
            'path_key': 'nlcd',
            'resampling': 'nearest',
            'output_name': 'nlcd_aligned.tif'
        }
    }

    # Band ordering for hourly files
    BAND_ORDER = {
    'static': ['soil_awc', 'soil_fc', 'nlcd', 'elevation'],
    'prism': ['precipitation'],
    'nldas': ['temperature', 'humidity', 'wind_speed', 'radiation'],
    'landsat': ['ndvi', 'lai']
    }

    # GeoTIFF output profile defaults
    GEOTIFF_PROFILE = {
        'driver': 'GTiff',
        'dtype': 'float32',
        'nodata': -9999.0,
        'compress': 'lzw',
        'tiled': True,
        'blockxsize': 256,
        'blockysize': 256
    }

    @classmethod
    def ensure_directories_exist(cls):
        """Create all necessary directories if they don't exist"""
        directories = [
            cls.DATA_BASE_PATH,
            cls.RESULTS_BASE_PATH,
            cls.LANDSAT_B4_DIR,
            cls.LANDSAT_B5_DIR,
            cls.PRISM_DIR,
            cls.NLDAS_DIR
        ]

        for directory in directories:
            os.makedirs(directory, exist_ok=True)

    @classmethod
    def get_static_data_path(cls, data_type: str, year: int = None) -> str:
        """Get path for static data type"""
        if data_type == 'nlcd':
            if year is None:
                # Use most recent year as default
                year = max(cls.AVAILABLE_NLCD_YEARS)

            # Find closest available year
            if year not in cls.AVAILABLE_NLCD_YEARS:
                year = min(cls.AVAILABLE_NLCD_YEARS, key=lambda x: abs(x - year))

            # Use the pattern to build the path
            nlcd_path = f'NLCD/Annual_NLCD_LndCov_{year}_CU_C1V1/Annual_NLCD_LndCov_{year}_CU_C1V1.tif'
            return os.path.join(cls.DATA_BASE_PATH, nlcd_path)

        elif data_type == 'elevation':
            if year is not None and cls.AVAILABLE_ELEVATION_YEARS:
                used_year = min(cls.AVAILABLE_ELEVATION_YEARS, key=lambda x: abs(x - year))
                base = os.path.join(cls.DATA_BASE_PATH, 'LF2020_Elev_220_CONUS', 'tif', 'LC20_Elev_220.tif')
                return base if os.path.exists(base) else cls.STATIC_DATA_PATHS.get('elevation', '')


        return cls.STATIC_DATA_PATHS.get(data_type, '')

    @classmethod
    def get_output_path(cls, request_id: str, folder_type: str = None) -> str:
        base_path = os.path.join(cls.RESULTS_BASE_PATH, request_id)

        if folder_type and folder_type in cls.OUTPUT_FOLDERS:
            return os.path.join(base_path, cls.OUTPUT_FOLDERS[folder_type])

        return base_path
