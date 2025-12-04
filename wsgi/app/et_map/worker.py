#!/usr/bin/env python3
"""ETMap Worker - Processes pending jobs from database"""

import time
import json
import logging
import signal
import sys
from datetime import datetime

from .db import ETMapDatabase
from .etmap_modules.data_collection import execute_data_collection
from .etmap_modules.trigger_calculation import trigger_calculation_sync

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('etmap-worker')

POLL_INTERVAL = 10  # seconds
running = True
def signal_handler(sig, frame):
    global running
    logger.info("Shutdown signal received, finishing current job...")
    running = False

def process_pending_jobs():
    """Process one pending job at a time"""
    db = ETMapDatabase()

    request_id = job['request_id']
    logger.info(f"Processing job: {request_id}")

    try:
        # Update status
        db.update_status(request_id, 'landsat_started')

          # Run calculation (synchronous)
        db.update_status(request_id, 'calculation_started')
        trigger_calculation_sync(request_id)

        db.update_status(request_id, 'calculation_complete')
        logger.info(f"Job completed: {request_id}")

    except Exception as e:
        logger.error(f"Job failed: {request_id} - {e}")
        db.update_status(request_id, 'failed', message=str(e))
    return True
def main():
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logger.info("ETMap Worker started")
    logger.info("ETMap Worker stopped")

if __name__ == '__main__':
      main()