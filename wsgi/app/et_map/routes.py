import os
import uuid
from flask import Blueprint, request, jsonify, send_file, redirect, url_for

# Create blueprint (lightweight - no heavy imports at module load)
etrawdata_bp = Blueprint('etrawdata', __name__)

# Lazy-initialized services (None until first request)
# Note: Data collection is now handled by worker.py, not routes
_services = {
    'db': None,
    'job_manager': None,
    'initialized': False
}


def _init_services():
    """Lazily initialize services on first access.

    Note: Data collection services (coverage_checker, fetch_manager) are now
    initialized in worker.py, not here. Routes only need DB access.
    """
    if not _services['initialized']:
        from .raw_data_modules.database import RawDataDatabase
        from .raw_data_modules.job_manager import RawDataJobManager

        _services['db'] = RawDataDatabase()
        _services['job_manager'] = RawDataJobManager(_services['db'])

        _services['initialized'] = True
        print("[ET Map] Routes services initialized")


def _get_db():
    _init_services()
    return _services['db']


def _get_job_manager():
    _init_services()
    return _services['job_manager']


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
    """Submit ETMap request - creates DB entry for worker to process.

    The worker process will pick up queued jobs and process them.
    This endpoint returns immediately after creating the job.
    """
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

    # Check for existing job with same parameters
    existing_request_id = job_manager.find_existing_job(date_from, date_to, request_data['geometry'])
    if existing_request_id:
        # Return existing job - worker will handle it if still pending
        return jsonify({'request_id': existing_request_id}), 200

    # Create new job in DB with 'queued' status - worker will pick it up
    request_id = job_manager.create_job(request_data)

    return jsonify({
        'request_id': request_id,
        'status': 'queued',
        'message': 'Request queued for processing'
    }), 201


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
