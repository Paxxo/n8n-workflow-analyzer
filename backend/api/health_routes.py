"""
Health and status endpoints for the n8n AI Assistant Pro backend.
"""

from flask import jsonify, request
import logging
from datetime import datetime
import docker
from config import get_config
from postgres_handler import create_postgres_connection
from docker_handler import get_docker_client
from utils import graceful_shutdown

logger = logging.getLogger("n8n_ai_assistant_api")

def register_health_routes(app):
    """Register health and status endpoints."""
    
    @app.route('/health', methods=['GET'])
    def health_check():
        """Endpoint to check the health of the service."""
        config = get_config()
        
        # Check Docker status
        docker_status = "OK"
        try:
            client = get_docker_client()
            # Simple check: try to list containers
            client.containers.list(limit=1)
        except Exception as e:
            docker_status = f"ERROR: {str(e)}"
        
        # Check PostgreSQL status if default connection is configured
        postgres_status = "N/A"
        if config["DEFAULT_POSTGRES_CONNECTION"]:
            try:
                conn = create_postgres_connection(config["DEFAULT_POSTGRES_CONNECTION"])
                if conn:
                    postgres_status = "OK"
                    conn.close()
            except Exception as e:
                postgres_status = f"ERROR: {str(e)}"
        
        return jsonify({
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "version": "2.0.0",
            "services": {
                "docker": docker_status,
                "postgresql": postgres_status
            }
        })
    
    @app.route('/shutdown', methods=['POST'])
    def shutdown():
        """Endpoint to gracefully shut down the server."""
        logger.info("Received request to shut down the server")
        
        if graceful_shutdown(request.environ):
            return jsonify({"success": True, "message": "Server shutting down"})
        else:
            return jsonify({"success": False, "error": "Could not shut down server"}), 500