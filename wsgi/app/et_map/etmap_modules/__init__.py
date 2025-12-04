"""
ETMap Modules Package

This package contains the core processing modules for ET (Evapotranspiration) map generation.
"""

from .config import ETMapConfig
from .utils import (
    DatabaseManager,
    FileManager,
    GeospatialUtils,
    ArrayUtils,
    ValidationUtils,
    LoggingUtils
)
from .parsers import CurlCommandParser, RequestDataParser
from .grid_manager import UnifiedGridManager, RasterProcessor
from .data_processors import (
    NLDASProcessor,
    LandsatProcessor,
    PRISMProcessor,
    StaticDataProcessor,
    DataCollector
)
from .baitsss_algorithm import BAITSSSAlgorithm, BAITSSSConstants
from .et_algorithm import ETAlgorithm, ETResultsManager
from .hourly_processor import CompleteETMapProcessor

__all__ = [
    # Config
    'ETMapConfig',
    # Utils
    'DatabaseManager',
    'FileManager',
    'GeospatialUtils',
    'ArrayUtils',
    'ValidationUtils',
    'LoggingUtils',
    # Parsers
    'CurlCommandParser',
    'RequestDataParser',
    # Grid
    'UnifiedGridManager',
    'RasterProcessor',
    # Data Processors
    'NLDASProcessor',
    'LandsatProcessor',
    'PRISMProcessor',
    'StaticDataProcessor',
    'DataCollector',
    # Algorithms
    'BAITSSSAlgorithm',
    'BAITSSSConstants',
    'ETAlgorithm',
    'ETResultsManager',
    # Processor
    'CompleteETMapProcessor',
]
