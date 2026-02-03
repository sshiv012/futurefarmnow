"""
Package: app.et_map

This package contains the ET (Evapotranspiration) map blueprint and related
endpoints for processing satellite imagery and climate data to compute
evapotranspiration maps.

Main components:
- etrawdata_bp: Blueprint for all ET map API endpoints under /etmap prefix
- etmap_modules: Core processing modules (config, algorithms, data processors)
- raw_data_modules: Data fetching and management modules (Landsat, PRISM, NLDAS)

API Endpoints (all under /etmap):
- POST /etmap - Create ET map request
- GET /etmap/<request_id>.json - Get job status
- GET /etmap/<request_id>/result - Get calculation results
- GET /etmap/<request_id>.png - Serve ET map PNG image
- GET /etmap/<request_id>.tif - Download ET map GeoTIFF
- GET /etmap/healthcheck.json - Healthcheck endpoint

Usage:
    # Import only the blueprint (lightweight, no heavy initialization)
    from app.et_map import etrawdata_bp
    app.register_blueprint(etrawdata_bp)

    # Import processing classes only when needed
    from app.et_map import ETMapConfig, ETAlgorithm
"""

# Only expose the blueprint at module level - lightweight import
from .routes import etrawdata_bp

# Define what's available for explicit import
__all__ = [
    # Blueprint (lightweight)
    'etrawdata_bp',
    # ETMap Modules (lazy-loaded via __getattr__)
    'ETMapConfig',
    'DatabaseManager',
    'FileManager',
    'GeospatialUtils',
    'ArrayUtils',
    'ValidationUtils',
    'LoggingUtils',
    'CurlCommandParser',
    'RequestDataParser',
    'UnifiedGridManager',
    'RasterProcessor',
    'NLDASProcessor',
    'LandsatProcessor',
    'PRISMProcessor',
    'StaticDataProcessor',
    'DataCollector',
    'BAITSSSConstants',
    'BAITSSSAlgorithm',
    'ETAlgorithm',
    'ETResultsManager',
    'CompleteETMapProcessor',
    # Raw Data Modules (lazy-loaded via __getattr__)
    'RawDataConfig',
    'RawDataDatabase',
    'RawDataJobManager',
    'JobStatus',
    'DataFetchManager',
    'SpatialCoverageChecker',
    'BaseFetcher',
    'LandsatFetcher',
    'PRISMFetcher',
    'NLDASFetcher',
    'RawDataUtils',
]

# Lazy import mapping
_ETMAP_MODULES = {
    'ETMapConfig': ('etmap_modules', 'ETMapConfig'),
    'DatabaseManager': ('etmap_modules', 'DatabaseManager'),
    'FileManager': ('etmap_modules', 'FileManager'),
    'GeospatialUtils': ('etmap_modules', 'GeospatialUtils'),
    'ArrayUtils': ('etmap_modules', 'ArrayUtils'),
    'ValidationUtils': ('etmap_modules', 'ValidationUtils'),
    'LoggingUtils': ('etmap_modules', 'LoggingUtils'),
    'CurlCommandParser': ('etmap_modules', 'CurlCommandParser'),
    'RequestDataParser': ('etmap_modules', 'RequestDataParser'),
    'UnifiedGridManager': ('etmap_modules', 'UnifiedGridManager'),
    'RasterProcessor': ('etmap_modules', 'RasterProcessor'),
    'NLDASProcessor': ('etmap_modules', 'NLDASProcessor'),
    'LandsatProcessor': ('etmap_modules', 'LandsatProcessor'),
    'PRISMProcessor': ('etmap_modules', 'PRISMProcessor'),
    'StaticDataProcessor': ('etmap_modules', 'StaticDataProcessor'),
    'DataCollector': ('etmap_modules', 'DataCollector'),
    'BAITSSSConstants': ('etmap_modules', 'BAITSSSConstants'),
    'BAITSSSAlgorithm': ('etmap_modules', 'BAITSSSAlgorithm'),
    'ETAlgorithm': ('etmap_modules', 'ETAlgorithm'),
    'ETResultsManager': ('etmap_modules', 'ETResultsManager'),
    'CompleteETMapProcessor': ('etmap_modules', 'CompleteETMapProcessor'),
}

_RAW_DATA_MODULES = {
    'RawDataConfig': ('raw_data_modules', 'RawDataConfig'),
    'RawDataDatabase': ('raw_data_modules', 'RawDataDatabase'),
    'RawDataJobManager': ('raw_data_modules', 'RawDataJobManager'),
    'JobStatus': ('raw_data_modules', 'JobStatus'),
    'DataFetchManager': ('raw_data_modules', 'DataFetchManager'),
    'SpatialCoverageChecker': ('raw_data_modules', 'SpatialCoverageChecker'),
    'BaseFetcher': ('raw_data_modules', 'BaseFetcher'),
    'LandsatFetcher': ('raw_data_modules', 'LandsatFetcher'),
    'PRISMFetcher': ('raw_data_modules', 'PRISMFetcher'),
    'NLDASFetcher': ('raw_data_modules', 'NLDASFetcher'),
    'RawDataUtils': ('raw_data_modules', 'RawDataUtils'),
}


def __getattr__(name):
    """Lazy import for processing classes - only load when accessed."""
    if name in _ETMAP_MODULES:
        submodule, attr = _ETMAP_MODULES[name]
        module = __import__(f'.{submodule}', globals(), locals(), [attr], 1)
        return getattr(module, attr)

    if name in _RAW_DATA_MODULES:
        submodule, attr = _RAW_DATA_MODULES[name]
        module = __import__(f'.{submodule}', globals(), locals(), [attr], 1)
        return getattr(module, attr)

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
