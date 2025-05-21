"""
n8n-specific API endpoints for the n8n AI Assistant Pro backend.
"""

from flask import jsonify
import logging
import docker
from docker_handler import get_docker_client

logger = logging.getLogger("n8n_ai_assistant_api")

def register_n8n_routes(app):
    """Register n8n-related endpoints."""
    
    @app.route('/n8n/status', methods=['GET'])
    def n8n_status():
        """Endpoint to check n8n status."""
        try:
            # Check if n8n container is running
            client = get_docker_client()
            
            try:
                n8n_container = client.containers.get('n8n')
                container_status = n8n_container.status
                container_state = n8n_container.attrs.get('State', {})
                
                return jsonify({
                    "success": True,
                    "status": container_status,
                    "running": container_status == 'running',
                    "details": container_state,
                    "logs": n8n_container.logs(tail=20).decode('utf-8').split('\n')
                })
            except docker.errors.NotFound:
                return jsonify({
                    "success": False,
                    "error": "No container named 'n8n' found"
                }), 404
            
        except Exception as e:
            logger.error(f"Error checking n8n status: {str(e)}", exc_info=True)
            return jsonify({"success": False, "error": str(e)}), 500
    
    @app.route('/n8n/restart', methods=['POST'])
    def n8n_restart():
        """Endpoint to restart n8n container."""
        try:
            client = get_docker_client()
            
            try:
                n8n_container = client.containers.get('n8n')
                n8n_container.restart()
                
                return jsonify({
                    "success": True,
                    "message": "n8n container restarted successfully"
                })
            except docker.errors.NotFound:
                return jsonify({
                    "success": False,
                    "error": "No container named 'n8n' found"
                }), 404
                
        except Exception as e:
            logger.error(f"Error restarting n8n: {str(e)}", exc_info=True)
            return jsonify({"success": False, "error": str(e)}), 500
