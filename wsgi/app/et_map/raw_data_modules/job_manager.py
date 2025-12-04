import json
import uuid
from datetime import datetime
from enum import Enum
from .database import RawDataDatabase

class JobStatus(Enum):
    """Job status enumeration"""
    QUEUED = "queued"
    CHECKING_COVERAGE = "checking_coverage"
    LANDSAT_STARTED = "landsat_started"
    LANDSAT_DONE = "landsat_done"
    LANDSAT_ERROR = "landsat_error"
    LANDSAT_SKIPPED = "landsat_skipped_covered"
    PRISM_STARTED = "prism_started"
    PRISM_DONE = "prism_done"
    PRISM_ERROR = "prism_error"
    PRISM_SKIPPED = "prism_skipped_covered"
    NLDAS_STARTED = "nldas_started"
    NLDAS_DONE = "nldas_done"
    NLDAS_ERROR = "nldas_error"
    NLDAS_SKIPPED = "nldas_skipped_covered"

    SUCCESS = "success"
    FAILED = "failed"

    CALCULATION_STARTED = "calculation_started"
    CALCULATION_COMPLETE = "calculation_complete"
    CALCULATION_FAILED = "calculation_failed"

class RawDataJobManager:
    def __init__(self, database: RawDataDatabase):
        self.db = database

    def create_job(self, request_data: dict) -> str:
        request_id = str(uuid.uuid4())
        current_timestamp = datetime.utcnow().isoformat()

        date_from = request_data['date_from']
        date_to = request_data['date_to']
        geometry_json = json.dumps(request_data['geometry'], sort_keys=True)
        request_json = json.dumps(request_data, sort_keys=True)

        self.db.insert_job(
            request_id, date_from, date_to, geometry_json,
            JobStatus.QUEUED.value, request_json, current_timestamp
        )

        return request_id

    def find_existing_job(self, date_from: str, date_to: str, geometry: dict) -> str:
        existing_jobs = self.db.find_existing_job(date_from, date_to)

        for existing_request_id, existing_request_json in existing_jobs:
            previous_request = json.loads(existing_request_json)
            if previous_request.get('geometry') == geometry:
                return existing_request_id

        return None

    def update_status(self, request_id: str, status: JobStatus, error_message: str = None):
        updated_at = datetime.utcnow().isoformat()
        self.db.update_job_status(request_id, status.value, updated_at, error_message)

    def get_job_status(self, request_id: str) -> dict:
        job_data = self.db.get_job(request_id)
        if not job_data:
            return None

        status, created_at, updated_at, request_json, error_message = job_data

        response_data = {
            'request_id': request_id,
            'status': status,
            'created_at': created_at,
            'updated_at': updated_at,
            'request': json.loads(request_json)
        }

        if error_message:
            response_data['error_message'] = error_message

        return response_data
