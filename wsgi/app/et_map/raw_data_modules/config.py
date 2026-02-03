# raw_data_modules/config.py

import os
from ..etmap_modules.config import ETMapConfig

class RawDataConfig:

    BASE_OUTPUT_DIR = ETMapConfig.DATA_BASE_PATH
    DB_PATH         = ETMapConfig.DB_PATH
    RESULTS_DIR     = ETMapConfig.RESULTS_BASE_PATH

    LANDSAT_B4_DIR  = ETMapConfig.LANDSAT_B4_DIR
    LANDSAT_B5_DIR  = ETMapConfig.LANDSAT_B5_DIR
    PRISM_DIR       = ETMapConfig.PRISM_DIR
    NLDAS_DIR       = ETMapConfig.NLDAS_DIR

    MAX_LANDSAT_SCENES = getattr(ETMapConfig, "MAX_LANDSAT_SCENES", 50)
    LANDSAT_NEAREST_DAY_WINDOW = getattr(ETMapConfig, "LANDSAT_NEAREST_DAY_WINDOW", 45)
    PRISM_VARIABLES    = getattr(
        ETMapConfig, "PRISM_VARIABLES",
        ["ppt", "tmin", "tmax", "tmean", "tdmean", "vpdmin", "vpdmax"]
    )

    LANDSAT_COLLECTION = "landsat-c2-l2"
    PRISM_BASE_URL     = "https://services.nacse.org/prism/data/get/us/4km"
    NLDAS_BASE_URL     = "https://hydro1.gesdisc.eosdis.nasa.gov/data/NLDAS/NLDAS_FORA0125_H.2.0"

    DOWNLOAD_TIMEOUT = 120
    MAX_RETRIES      = 2
    THROTTLE_SECONDS = 0.0

    @classmethod
    def ensure_directories(cls):
        for directory in [
            cls.BASE_OUTPUT_DIR,
            cls.LANDSAT_B4_DIR,
            cls.LANDSAT_B5_DIR,
            cls.PRISM_DIR,
            cls.NLDAS_DIR,
            cls.RESULTS_DIR,
        ]:
            os.makedirs(directory, exist_ok=True)

    @classmethod
    def get_nldas_dir(cls, year: int) -> str:
        return cls.NLDAS_DIR
