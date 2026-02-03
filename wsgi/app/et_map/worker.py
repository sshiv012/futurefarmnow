#!/usr/bin/env python3
"""ETMap Worker - Processes pending jobs from database.

This worker polls the database for queued jobs and processes them one at a time.
Run as a standalone process or systemd service.

Usage:
    python -m app.et_map.worker
    # or from wsgi directory:
    python app/et_map/worker.py

Environment variables:
    POLL_INTERVAL: Seconds between polls (default: 10)
    LOG_LEVEL: Logging level (default: INFO)
"""

import os
import sys
import json
import time
import signal
import logging
import subprocess

# Add parent directory to path for imports when run directly
if __name__ == '__main__':
    wsgi_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    sys.path.insert(0, wsgi_dir)

from app.et_map.raw_data_modules.database import RawDataDatabase
from app.et_map.raw_data_modules.job_manager import RawDataJobManager, JobStatus
from app.et_map.raw_data_modules.coverage_checker import SpatialCoverageChecker
from app.et_map.raw_data_modules.data_fetchers import LandsatFetcher, PRISMFetcher, NLDASFetcher
from app.et_map.raw_data_modules.fetch_manager import DataFetchManager
from app.et_map.raw_data_modules.utils import RawDataUtils
from app.et_map.etmap_modules.config import ETMapConfig

# Configuration
POLL_INTERVAL = int(os.environ.get('POLL_INTERVAL', 10))
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
ETCALCULATION_SCRIPT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calculation.py")

# Setup logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper()),
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('etmap-worker')

# Global flag for graceful shutdown
running = True


def signal_handler(_sig, _frame):
    """Handle shutdown signals gracefully."""
    global running
    logger.info("Shutdown signal received, finishing current job...")
    running = False


class ETMapWorker:
    """Worker that processes ETMap jobs from the database."""

    def __init__(self):
        self.db = RawDataDatabase()
        self.job_manager = RawDataJobManager(self.db)
        self.coverage_checker = SpatialCoverageChecker()
        self.fetch_manager = DataFetchManager()

        # Register fetchers
        self.fetch_manager.register_fetcher('landsat', LandsatFetcher())
        self.fetch_manager.register_fetcher('prism', PRISMFetcher())
        self.fetch_manager.register_fetcher('nldas', NLDASFetcher())

        logger.info("ETMap Worker initialized")

    def process_job(self, job: dict) -> bool:
        """Process a single job. Returns True on success, False on failure."""
        request_id = job['request_id']
        logger.info(f"Processing job: {request_id}")

        try:
            # Parse job data
            request_data = json.loads(job['request_json'])
            date_from = request_data['date_from']
            date_to = request_data['date_to']
            geometry_json = json.dumps(request_data['geometry'])

            area_of_interest = RawDataUtils.parse_geometry(geometry_json)
            logger.info(f"AOI bounds: {area_of_interest.bounds}")

            # Check spatial coverage
            self.job_manager.update_status(request_id, JobStatus.CHECKING_COVERAGE)
            datasets_to_fetch = []

            # Check Landsat coverage
            if not self.coverage_checker.is_covered('landsat', area_of_interest, date_from, date_to):
                datasets_to_fetch.append('landsat')
            else:
                logger.info("Landsat data already covered - skipping download")
                self.job_manager.update_status(request_id, JobStatus.LANDSAT_SKIPPED)

            # Check PRISM coverage
            if not self.coverage_checker.is_covered('prism', area_of_interest, date_from, date_to):
                datasets_to_fetch.append('prism')
            else:
                logger.info("PRISM data already covered - skipping download")
                self.job_manager.update_status(request_id, JobStatus.PRISM_SKIPPED)

            # Check NLDAS coverage
            if not self.coverage_checker.is_covered('nldas', area_of_interest, date_from, date_to):
                datasets_to_fetch.append('nldas')
            else:
                logger.info("NLDAS data already covered - skipping download")
                self.job_manager.update_status(request_id, JobStatus.NLDAS_SKIPPED)

            # Execute needed collections
            if not datasets_to_fetch:
                logger.info("All data already available locally - no fetching needed!")
                self.job_manager.update_status(request_id, JobStatus.SUCCESS)
            else:
                logger.info(f"Need to fetch {len(datasets_to_fetch)} datasets: {datasets_to_fetch}")

                # Fetch each dataset
                for dataset in datasets_to_fetch:
                    if not self._fetch_dataset(request_id, dataset, date_from, date_to, geometry_json):
                        return False

                self.job_manager.update_status(request_id, JobStatus.SUCCESS)
                logger.info(f"Data collection completed for request {request_id}")

            # Trigger calculation
            return self._run_calculation(request_id)

        except Exception as e:
            logger.error(f"Error processing job {request_id}: {e}")
            self.job_manager.update_status(request_id, JobStatus.FAILED, str(e))
            return False

    def _fetch_dataset(self, request_id: str, dataset: str, date_from: str, date_to: str, geometry_json: str) -> bool:
        """Fetch a single dataset. Returns True on success."""
        try:
            # Update status to started
            status_map = {
                'landsat': (JobStatus.LANDSAT_STARTED, JobStatus.LANDSAT_DONE, JobStatus.LANDSAT_ERROR),
                'prism': (JobStatus.PRISM_STARTED, JobStatus.PRISM_DONE, JobStatus.PRISM_ERROR),
                'nldas': (JobStatus.NLDAS_STARTED, JobStatus.NLDAS_DONE, JobStatus.NLDAS_ERROR),
            }
            started, done, error = status_map[dataset]

            self.job_manager.update_status(request_id, started)
            logger.info(f"Starting {dataset} raw data collection...")

            success = self.fetch_manager.fetch_dataset(dataset, date_from, date_to, geometry_json)

            if success:
                self.job_manager.update_status(request_id, done)
                logger.info(f"Completed {dataset} raw data collection")
                return True
            else:
                self.job_manager.update_status(request_id, error, f"{dataset} fetch failed")
                self.job_manager.update_status(request_id, JobStatus.FAILED, f"{dataset}: fetch failed")
                return False

        except Exception as e:
            logger.error(f"{dataset} job failed with exception: {e}")
            self.job_manager.update_status(request_id, JobStatus.FAILED, f"{dataset}: {str(e)}")
            return False

    def _run_calculation(self, request_id: str) -> bool:
        """Run ET calculation synchronously. Returns True on success."""
        try:
            logger.info(f"Starting ET calculation for UUID: {request_id}")
            self.job_manager.update_status(request_id, JobStatus.CALCULATION_STARTED)

            # Get database path for calculation script
            absolute_db_path = os.path.abspath(self.db.db_path)
            logger.info(f"Using database path: {absolute_db_path}")

            cmd = [
                sys.executable,
                ETCALCULATION_SCRIPT_PATH,
                "--uuid", request_id,
                "--db-path", absolute_db_path
            ]

            logger.info(f"Executing command: {' '.join(cmd)}")

            # Run synchronously and capture output
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True
            )

            # Log output in real-time
            for line in process.stdout:
                line = line.strip()
                if line:
                    logger.info(f"[CALC-{request_id[:8]}] {line}")

            return_code = process.wait()

            if return_code == 0:
                logger.info(f"Calculation completed successfully for UUID: {request_id}")
                # Store TIF statistics in database
                self._store_statistics(request_id)
                self.job_manager.update_status(request_id, JobStatus.CALCULATION_COMPLETE)
                return True
            else:
                logger.error(f"Calculation failed for UUID: {request_id} (exit code: {return_code})")
                self.job_manager.update_status(request_id, JobStatus.CALCULATION_FAILED,
                                               f"Process exited with code {return_code}")
                return False

        except FileNotFoundError:
            logger.error(f"calculation.py not found at path: {ETCALCULATION_SCRIPT_PATH}")
            self.job_manager.update_status(request_id, JobStatus.CALCULATION_FAILED,
                                           "calculation.py not found")
            return False

        except Exception as e:
            logger.error(f"Failed to run calculation: {e}")
            self.job_manager.update_status(request_id, JobStatus.CALCULATION_FAILED, str(e))
            return False

    def _store_statistics(self, request_id: str):
        """Read statistics from JSON summary and store in database."""
        try:
            output_path = ETMapConfig.get_output_path(request_id)
            summary_path = os.path.join(output_path, 'et_enhanced', 'ET_comprehensive_summary.json')

            if not os.path.exists(summary_path):
                logger.warning(f"Statistics summary file not found: {summary_path}")
                return

            with open(summary_path, 'r') as f:
                summary = json.load(f)

            if 'statistics' in summary:
                stats = summary['statistics']
                # Add band name for researcher context
                stats['band_name'] = 'ET (mm/day)'
                self.job_manager.update_statistics(request_id, stats)
                logger.info(f"Stored TIF statistics for request {request_id}")
            else:
                logger.warning(f"No statistics found in summary file: {summary_path}")

        except Exception as e:
            logger.error(f"Failed to store statistics for {request_id}: {e}")

    def run(self):
        """Main worker loop - poll for jobs and process them."""
        logger.info(f"ETMap Worker started (poll interval: {POLL_INTERVAL}s)")

        while running:
            try:
                # Try to claim a pending job
                job = self.db.claim_pending_job()

                if job:
                    self.process_job(job)
                else:
                    # No pending jobs, sleep before next poll
                    time.sleep(POLL_INTERVAL)

            except KeyboardInterrupt:
                logger.info("Interrupted by user")
                break
            except Exception as e:
                logger.error(f"Worker error: {e}")
                time.sleep(POLL_INTERVAL)

        logger.info("ETMap Worker stopped")


def main():
    """Entry point for the worker."""
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    worker = ETMapWorker()
    worker.run()


if __name__ == '__main__':
    main()