import sqlite3
import threading
from datetime import datetime, timezone
from .config import RawDataConfig

class RawDataDatabase:
    def __init__(self):
        self.db_path = RawDataConfig.DB_PATH
        self._local = threading.local()
        self._initialize_db()

    def _get_connection(self):
        if not hasattr(self._local, 'connection'):
            self._local.connection = sqlite3.connect(self.db_path, check_same_thread=False)
        return self._local.connection

    def _initialize_db(self):
        connection = self._get_connection()
        cursor = connection.cursor()

        cursor.execute('''
        CREATE TABLE IF NOT EXISTS etmap_jobs (
            request_id TEXT PRIMARY KEY,
            date_from TEXT NOT NULL,
            date_to TEXT NOT NULL,
            geometry TEXT NOT NULL,
            status TEXT NOT NULL,
            request_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            error_message TEXT
        )
        ''')
        connection.commit()

    def insert_job(self, request_id: str, date_from: str, date_to: str,
                   geometry_json: str, status: str, request_json: str, created_at: str):
        connection = self._get_connection()
        cursor = connection.cursor()

        cursor.execute(
            '''INSERT INTO etmap_jobs(request_id, date_from, date_to, geometry, status, request_json, created_at)
               VALUES (?,?,?,?,?,?,?)''',
            (request_id, date_from, date_to, geometry_json, status, request_json, created_at)
        )
        connection.commit()

    def update_job_status(self, request_id: str, status: str, updated_at: str, error_message: str = None):
        connection = self._get_connection()
        cursor = connection.cursor()

        cursor.execute(
            'UPDATE etmap_jobs SET status=?, updated_at=?, error_message=? WHERE request_id=?',
            (status, updated_at, error_message, request_id)
        )
        connection.commit()

    def find_existing_job(self, date_from: str, date_to: str):
        connection = self._get_connection()
        cursor = connection.cursor()

        cursor.execute(
            'SELECT request_id, request_json FROM etmap_jobs WHERE date_from=? AND date_to=?',
            (date_from, date_to)
        )
        return cursor.fetchall()

    def get_job(self, request_id: str):
        connection = self._get_connection()
        cursor = connection.cursor()

        cursor.execute(
            'SELECT status, created_at, updated_at, request_json, error_message FROM etmap_jobs WHERE request_id=?',
            (request_id,)
        )
        return cursor.fetchone()
    
    def claim_pending_job(self):
        """Atomically claim a pending job to prevent race conditions.

        Returns the job dict with keys: request_id, date_from, date_to, geometry,
        status, request_json, created_at, updated_at, error_message
        """
        connection = self._get_connection()
        cursor = connection.cursor()

        # First, find the oldest pending job
        cursor.execute("""
            SELECT request_id FROM etmap_jobs
            WHERE status = 'queued'
            ORDER BY created_at ASC
            LIMIT 1
        """)
        row = cursor.fetchone()

        if not row:
            return None

        request_id = row[0]
        updated_at = datetime.now(timezone.utc).isoformat()

        # Claim it by updating status to 'claimed'
        cursor.execute("""
            UPDATE etmap_jobs
            SET status = 'claimed', updated_at = ?
            WHERE request_id = ? AND status = 'queued'
        """, (updated_at, request_id))

        if cursor.rowcount == 0:
            # Another worker claimed it first
            connection.commit()
            return None

        # Fetch the full job data
        cursor.execute("""
            SELECT request_id, date_from, date_to, geometry, status,
                   request_json, created_at, updated_at, error_message
            FROM etmap_jobs
            WHERE request_id = ?
        """, (request_id,))

        job_row = cursor.fetchone()
        connection.commit()

        if job_row:
            return {
                'request_id': job_row[0],
                'date_from': job_row[1],
                'date_to': job_row[2],
                'geometry': job_row[3],
                'status': job_row[4],
                'request_json': job_row[5],
                'created_at': job_row[6],
                'updated_at': job_row[7],
                'error_message': job_row[8]
            }
        return None
