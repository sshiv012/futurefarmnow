import os
import sys
import json
import uuid
import threading
import subprocess
from flask import Blueprint, request, jsonify, send_file, redirect, url_for

# Create blueprint (lightweight - no heavy imports at module load)
etrawdata_bp = Blueprint('etrawdata', __name__)

# Lazy-initialized services (None until first request)
_services = {
    'db': None,
    'job_manager': None,
    'coverage_checker': None,
    'fetch_manager': None,
    'initialized': False
}

AUTO_CALCULATION_ENABLED = True
ETCALCULATION_SCRIPT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calculation.py")


def _init_services():
    """Lazily initialize services on first access."""
    if not _services['initialized']:
        from .raw_data_modules.database import RawDataDatabase
        from .raw_data_modules.job_manager import RawDataJobManager
        from .raw_data_modules.coverage_checker import SpatialCoverageChecker
        from .raw_data_modules.data_fetchers import LandsatFetcher, PRISMFetcher, NLDASFetcher
        from .raw_data_modules.fetch_manager import DataFetchManager

        _services['db'] = RawDataDatabase()
        _services['job_manager'] = RawDataJobManager(_services['db'])
        _services['coverage_checker'] = SpatialCoverageChecker()

        _services['fetch_manager'] = DataFetchManager()
        _services['fetch_manager'].register_fetcher('landsat', LandsatFetcher())
        _services['fetch_manager'].register_fetcher('prism', PRISMFetcher())
        _services['fetch_manager'].register_fetcher('nldas', NLDASFetcher())

        _services['initialized'] = True
        print("[ET Map] Services initialized")


def _get_db():
    _init_services()
    return _services['db']


def _get_job_manager():
    _init_services()
    return _services['job_manager']


def _get_coverage_checker():
    _init_services()
    return _services['coverage_checker']


def _get_fetch_manager():
    _init_services()
    return _services['fetch_manager']


def _get_job_status():
    """Get JobStatus enum lazily."""
    from .raw_data_modules.job_manager import JobStatus
    return JobStatus


def _get_raw_data_utils():
    """Get RawDataUtils lazily."""
    from .raw_data_modules.utils import RawDataUtils
    return RawDataUtils


def _get_etmap_config():
    """Get ETMapConfig lazily."""
    from .etmap_modules.config import ETMapConfig
    return ETMapConfig


@etrawdata_bp.route('/etmap/healthcheck.json', methods=['GET'])
def et_map_healthcheck():
    """
    Simple healthcheck endpoint to verify that the ET map blueprint
    is registered and reachable from the main application.
    """
    return jsonify({"status": "ok", "module": "et_map"})


@etrawdata_bp.route('/etmap', methods=['POST'])
def create_etmap_request():
    request_data = request.get_json(silent=True)
    if not request_data:
        return jsonify({'error': 'Invalid JSON payload'}), 400

    # Validate required fields
    required_fields = ['date_from', 'date_to', 'geometry']
    for field in required_fields:
        if field not in request_data:
            return jsonify({'error': f'Missing required field: {field}'}), 400

    try:
        _get_raw_data_utils().validate_geometry(request_data['geometry'])
    except Exception as e:
        return jsonify({'error': 'Invalid geometry', 'details': str(e)}), 400

    date_from = request_data['date_from']
    date_to = request_data['date_to']

    job_manager = _get_job_manager()
    JobStatus = _get_job_status()

    # Check for existing job with same parameters
    existing_request_id = job_manager.find_existing_job(date_from, date_to, request_data['geometry'])
    if existing_request_id:
        # For existing jobs, check if we should trigger auto-calculation
        job_status_data = job_manager.get_job_status(existing_request_id)
        if job_status_data and job_status_data['status'] == JobStatus.SUCCESS.value:
            # Data collection already complete, trigger calculation if enabled
            if AUTO_CALCULATION_ENABLED:
                threading.Thread(
                    target=trigger_automatic_calculation,
                    args=(existing_request_id,),
                    daemon=True
                ).start()

        return jsonify({'request_id': existing_request_id}), 200

    request_id = job_manager.create_job(request_data)

    # Start data collection in background thread
    threading.Thread(
        target=execute_data_collection,
        args=(request_id, request_data),
        daemon=True
    ).start()

    return jsonify({'request_id': request_id}), 201


@etrawdata_bp.route('/etmap/<string:request_id>.json', methods=['GET'])
def get_etmap_status(request_id: str):
    try:
        uuid.UUID(request_id)
    except ValueError:
        return jsonify({'error': 'Invalid request ID format'}), 400

    job_data = _get_job_manager().get_job_status(request_id)
    if not job_data:
        return jsonify({'error': 'Request not found'}), 404

    return jsonify(job_data), 200


@etrawdata_bp.route('/etmap/<string:request_id>/result', methods=['GET'])
def get_etmap_result(request_id: str):
    try:
        uuid.UUID(request_id)
    except ValueError:
        return jsonify({'error': 'Invalid request ID format'}), 400

    job_status_data = _get_job_manager().get_job_status(request_id)
    if not job_status_data:
        return jsonify({'error': 'Request not found'}), 404

    job_status = job_status_data['status']

    if job_status not in ['calculation_complete', 'success']:
        return redirect(url_for('etrawdata.get_etmap_status', request_id=request_id))

    # Return info about completed ET calculation
    return jsonify({
        'message': 'ET calculation completed',
        'request_id': request_id,
        'status': job_status,
        'results': {
            'et_map_url': f'/etmap/{request_id}.png'
        },
        'note': 'ET calculations completed successfully. Use et_map_url to view the result.'
    }), 200


@etrawdata_bp.route('/etmap/<string:request_id>.png', methods=['GET'])
def get_et_map_image(request_id: str):
    try:
        uuid.UUID(request_id)
    except ValueError:
        return jsonify({'error': 'Invalid request ID format'}), 400

    # Check if request exists and is completed
    job_status_data = _get_job_manager().get_job_status(request_id)
    if not job_status_data:
        return jsonify({'error': 'Request not found'}), 404

    job_status = job_status_data['status']
    if job_status not in ['calculation_complete', 'success']:
        return jsonify({'error': 'ET calculation not completed yet', 'current_status': job_status}), 400

    # Construct path to ET result PNG
    output_path = _get_etmap_config().get_output_path(request_id)
    et_png_path = os.path.join(output_path, 'et_enhanced', 'ET_final_result.png')

    # Check if PNG file exists
    if not os.path.exists(et_png_path):
        return jsonify({'error': 'ET map image not found', 'expected_path': et_png_path}), 404

    # Serve the PNG file
    try:
        return send_file(
            et_png_path,
            mimetype='image/png',
            as_attachment=False,
            download_name=f'ET_map_{request_id}.png'
        )
    except Exception as e:
        return jsonify({'error': f'Failed to serve ET map: {str(e)}'}), 500


@etrawdata_bp.route('/etmap/<string:request_id>.tif', methods=['GET'])
def get_et_map_tiff(request_id: str):
    try:
        uuid.UUID(request_id)
    except ValueError:
        return jsonify({'error': 'Invalid request ID format'}), 400

    # Check if request exists and is completed
    job_status_data = _get_job_manager().get_job_status(request_id)
    if not job_status_data:
        return jsonify({'error': 'Request not found'}), 404

    job_status = job_status_data['status']
    if job_status not in ['calculation_complete', 'success']:
        return jsonify({'error': 'ET calculation not completed yet', 'current_status': job_status}), 400

    # Construct path to ET result TIFF
    output_path = _get_etmap_config().get_output_path(request_id)
    et_tif_path = os.path.join(output_path, 'et_enhanced', 'ET_final_result.tif')

    # Check if TIFF file exists
    if not os.path.exists(et_tif_path):
        return jsonify({'error': 'ET map TIFF not found', 'expected_path': et_tif_path}), 404

    # Serve the TIFF file
    try:
        return send_file(
            et_tif_path,
            mimetype='application/octet-stream',
            as_attachment=True,
            download_name=f'ET_map_{request_id}.tif'
        )
    except Exception as e:
        return jsonify({'error': f'Failed to serve ET TIFF: {str(e)}'}), 500


def execute_data_collection(request_id: str, request_data: dict):
    """Background task for data collection. Services are lazily initialized."""
    print(f"Starting data collection for request {request_id}")

    job_manager = _get_job_manager()
    coverage_checker = _get_coverage_checker()
    fetch_manager = _get_fetch_manager()
    JobStatus = _get_job_status()
    RawDataUtils = _get_raw_data_utils()

    try:
        date_from = request_data['date_from']
        date_to = request_data['date_to']
        geometry_json = json.dumps(request_data['geometry'])

        area_of_interest = RawDataUtils.parse_geometry(geometry_json)
        print(f"AOI bounds: {area_of_interest.bounds}")

        # Check spatial coverage
        job_manager.update_status(request_id, JobStatus.CHECKING_COVERAGE)

        datasets_to_fetch = []

        # Check Landsat coverage
        if not coverage_checker.is_covered('landsat', area_of_interest, date_from, date_to):
            datasets_to_fetch.append('landsat')
        else:
            print("Landsat data already covered - skipping download")
            job_manager.update_status(request_id, JobStatus.LANDSAT_SKIPPED)

        # Check PRISM coverage
        if not coverage_checker.is_covered('prism', area_of_interest, date_from, date_to):
            datasets_to_fetch.append('prism')
        else:
            print("PRISM data already covered - skipping download")
            job_manager.update_status(request_id, JobStatus.PRISM_SKIPPED)

        # Check NLDAS coverage
        if not coverage_checker.is_covered('nldas', area_of_interest, date_from, date_to):
            datasets_to_fetch.append('nldas')
        else:
            print("NLDAS data already covered - skipping download")
            job_manager.update_status(request_id, JobStatus.NLDAS_SKIPPED)

        # Execute needed collections
        if not datasets_to_fetch:
            print("All data already available locally - no fetching needed!")
            job_manager.update_status(request_id, JobStatus.SUCCESS)

            # Trigger automatic calculation since data is ready
            if AUTO_CALCULATION_ENABLED:
                trigger_automatic_calculation(request_id)

            return

        print(f"Need to fetch {len(datasets_to_fetch)} datasets: {datasets_to_fetch}")

        # Fetch each dataset
        for dataset in datasets_to_fetch:
            try:
                # Update status to started
                if dataset == 'landsat':
                    job_manager.update_status(request_id, JobStatus.LANDSAT_STARTED)
                elif dataset == 'prism':
                    job_manager.update_status(request_id, JobStatus.PRISM_STARTED)
                elif dataset == 'nldas':
                    job_manager.update_status(request_id, JobStatus.NLDAS_STARTED)

                print(f"Starting {dataset} raw data collection...")
                success = fetch_manager.fetch_dataset(dataset, date_from, date_to, geometry_json)

                if success:
                    if dataset == 'landsat':
                        job_manager.update_status(request_id, JobStatus.LANDSAT_DONE)
                    elif dataset == 'prism':
                        job_manager.update_status(request_id, JobStatus.PRISM_DONE)
                    elif dataset == 'nldas':
                        job_manager.update_status(request_id, JobStatus.NLDAS_DONE)

                    print(f" Completed {dataset} raw data collection")
                else:
                    if dataset == 'landsat':
                        job_manager.update_status(request_id, JobStatus.LANDSAT_ERROR, f"{dataset} fetch failed")
                    elif dataset == 'prism':
                        job_manager.update_status(request_id, JobStatus.PRISM_ERROR, f"{dataset} fetch failed")
                    elif dataset == 'nldas':
                        job_manager.update_status(request_id, JobStatus.NLDAS_ERROR, f"{dataset} fetch failed")

                    print(f" {dataset} job failed")
                    job_manager.update_status(request_id, JobStatus.FAILED, f"{dataset}: fetch failed")
                    return

            except Exception as e:
                print(f" {dataset} job failed with exception: {e}")
                if dataset == 'landsat':
                    job_manager.update_status(request_id, JobStatus.LANDSAT_ERROR, str(e))
                elif dataset == 'prism':
                    job_manager.update_status(request_id, JobStatus.PRISM_ERROR, str(e))
                elif dataset == 'nldas':
                    job_manager.update_status(request_id, JobStatus.NLDAS_ERROR, str(e))

                job_manager.update_status(request_id, JobStatus.FAILED, f"{dataset}: {str(e)}")
                return

        job_manager.update_status(request_id, JobStatus.SUCCESS)
        print(f"Data collection completed for request {request_id}")

        # Trigger automatic calculation
        if AUTO_CALCULATION_ENABLED:
            print(f"Triggering automatic ET calculation for request {request_id}")
            trigger_automatic_calculation(request_id)
        else:
            print("Automatic calculation disabled. Use manual command:")
            print(f"python3 calculation.py --uuid {request_id}")

    except Exception as e:
        print(f"Error in data collection: {e}")
        job_manager.update_status(request_id, JobStatus.FAILED, str(e))


def trigger_automatic_calculation(request_id: str):
    """Trigger ET calculation subprocess. Services are lazily initialized."""
    job_manager = _get_job_manager()
    JobStatus = _get_job_status()
    db = _get_db()

    try:
        print(f"[AUTO-CALC] Starting automatic calculation for UUID: {request_id}")

        job_manager.update_status(request_id, JobStatus.CALCULATION_STARTED)

        server_db_path = db.db_path if hasattr(db, 'db_path') else 'etmap.db'
        absolute_db_path = os.path.abspath(server_db_path)

        print(f"[AUTO-CALC] Using database path: {absolute_db_path}")

        cmd = [
            sys.executable,
            ETCALCULATION_SCRIPT_PATH,
            "--uuid", request_id,
            "--db-path", absolute_db_path
        ]

        print(f"[AUTO-CALC] Executing command: {' '.join(cmd)}")

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        print(f"[AUTO-CALC] ET calculation process started with PID: {process.pid}")

        # Start a thread to monitor the process output without blocking the server
        threading.Thread(
            target=monitor_calculation_process,
            args=(process, request_id),
            daemon=True
        ).start()

    except FileNotFoundError:
        print(f"[AUTO-CALC] ERROR: calculation.py not found at path: {ETCALCULATION_SCRIPT_PATH}")
        print(f"[AUTO-CALC] Please update ETCALCULATION_SCRIPT_PATH in the configuration")
        print(f"[AUTO-CALC] Manual calculation: python3 calculation.py --uuid {request_id}")

        job_manager.update_status(request_id, JobStatus.CALCULATION_FAILED, "calculation.py not found")

    except Exception as e:
        print(f"[AUTO-CALC] ERROR: Failed to trigger automatic calculation: {e}")
        print(f"[AUTO-CALC] Manual calculation: python3 calculation.py --uuid {request_id}")

        job_manager.update_status(request_id, JobStatus.CALCULATION_FAILED, str(e))


def monitor_calculation_process(process, request_id: str):
    """Monitor calculation subprocess output. Services are lazily initialized."""
    job_manager = _get_job_manager()
    JobStatus = _get_job_status()

    try:
        print(f"[AUTO-CALC] Monitoring calculation process for UUID: {request_id}")

        for line in process.stdout:
            line = line.strip()
            if line:
                print(f"[CALC-{request_id[:8]}] {line}")

        return_code = process.wait()

        if return_code == 0:
            print(f"[AUTO-CALC]  Calculation completed successfully for UUID: {request_id}")
            print(f"[AUTO-CALC] Check output in UUID folder: {request_id}")
            job_manager.update_status(request_id, JobStatus.CALCULATION_COMPLETE)

        else:
            print(f"[AUTO-CALC]  Calculation failed for UUID: {request_id}")
            print(f"[AUTO-CALC] Process exited with code: {return_code}")
            print(f"[AUTO-CALC] Try manual debugging: python3 calculation.py --uuid {request_id}")

            job_manager.update_status(request_id, JobStatus.CALCULATION_FAILED, f"Process exited with code {return_code}")

    except Exception as e:
        print(f"[AUTO-CALC] ERROR monitoring calculation process: {e}")
        print(f"[AUTO-CALC] Try manual debugging: python3 calculation.py --uuid {request_id}")

        job_manager.update_status(request_id, JobStatus.CALCULATION_FAILED, str(e))
