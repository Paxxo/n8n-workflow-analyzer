"""
Utility functions for the n8n AI Assistant Pro backend.
"""

import logging
import socket
from flask import request, jsonify
import signal
import os
import sys

logger = logging.getLogger("n8n_ai_assistant_api")

def check_port_in_use(port):
    """Check if a port is in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def graceful_shutdown(environ):
    """
    Attempt to gracefully shut down the Flask server.
    
    Args:
        environ: WSGI environment dictionary
    
    Returns:
        True if shutdown was successful, False otherwise
    """
    try:
        # Try Werkzeug's shutdown function
        shutdown_func = environ.get('werkzeug.server.shutdown')
        if shutdown_func is not None:
            shutdown_func()
            logger.info("Server gracefully shutdown via Werkzeug")
            return True
        
        # Try with signal
        pid = os.getpid()
        os.kill(pid, signal.SIGTERM)
        logger.info("Server shutdown signal sent")
        return True
    except Exception as e:
        logger.error(f"Error during graceful shutdown: {str(e)}")
        return False