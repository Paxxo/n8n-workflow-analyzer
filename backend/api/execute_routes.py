"""
Command execution API endpoints for the n8n AI Assistant Pro backend.
"""

from flask import request, jsonify
import logging
import time
import uuid
from docker_handler import execute_docker_command
from postgres_handler import execute_postgres_query
from nlp_interpreter import interpret_natural_language_command

logger = logging.getLogger("n8n_ai_assistant_api")

def register_execute_routes(app):
    """Register command execution endpoints."""
    
    @app.route('/execute', methods=['POST'])
    def execute_command():
        """
        Main endpoint to execute commands on Docker or PostgreSQL.
        """
        start_time = time.time()
        request_id = str(uuid.uuid4())
        
        try:
            data = request.json
            logger.info(f"Request [{request_id}] received: {data}")
            
            # Check required data
            if not data:
                logger.warning(f"Request [{request_id}] without data")
                return jsonify({"success": False, "error": "Parameters required to execute commands"}), 400
                
            operation_type = data.get('operation', 'generic')
            command = data.get('command', '')
            
            # Get specific parameters based on operation type
            docker_command = data.get('docker_command', '')
            postgres_query = data.get('postgres_query', '')
            docker_host = data.get('docker_host')
            postgres_connection = data.get('postgres_connection')
            
            # Log the operation
            logger.info(f"Executing [{request_id}] - Type: {operation_type}, Command: {command}")
            
            # Execute based on operation type
            if operation_type == 'docker_command' or docker_command:
                cmd = docker_command or command
                result = execute_docker_command(cmd, docker_host)
            elif operation_type == 'postgres_query' or postgres_query:
                query = postgres_query or command
                result = execute_postgres_query(query, postgres_connection)
            elif operation_type == 'combined':
                # Execute both types of commands
                docker_result = "No Docker command executed"
                postgres_result = "No PostgreSQL query executed"
                
                if docker_command:
                    docker_result = execute_docker_command(docker_command, docker_host)
                if postgres_query:
                    postgres_result = execute_postgres_query(postgres_query, postgres_connection)
                
                result = f"Docker result:\n{docker_result}\n\nPostgreSQL result:\n{postgres_result}"
            else:
                # For generic commands, use AI to interpret and convert them
                result = interpret_natural_language_command(command, docker_host, postgres_connection)
            
            duration = time.time() - start_time
            logger.info(f"Request [{request_id}] completed in {duration:.2f}s")
            
            return jsonify({
                "success": True, 
                "result": result,
                "request_id": request_id,
                "duration": duration
            })
            
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"Error in request [{request_id}]: {str(e)}", exc_info=True)
            return jsonify({
                "success": False, 
                "error": str(e),
                "request_id": request_id,
                "duration": duration
            }), 500
from docker_handler import get_docker_client, execute_docker_command

logger = logging.getLogger("n8n_ai_assistant_api")

def register_docker_routes(app):
    """Register Docker-related endpoints."""
    
    @app.route('/test-docker', methods=['POST'])
    def test_docker_connection():
        """Endpoint to test Docker connection."""
        try:
            data = request.json
            docker_host = data.get('dockerHost')
            
            # Get Docker client
            client = get_docker_client(docker_host)
            
            # Get server info
            docker_info = client.info()
            docker_version = client.version()
            
            # Get container list
            containers = client.containers.list(all=True)
            container_info = []
            
            for container in containers:
                container_info.append({
                    "id": container.short_id,
                    "name": container.name,
                    "image": container.image.tags[0] if container.image.tags else 'none',
                    "status": container.status,
                    "state": container.attrs.get('State', {})
                })
            
            return jsonify({
                "success": True, 
                "message": "Docker connection successful",
                "docker_info": {
                    "version": docker_version.get('Version', 'unknown'),
                    "containers_count": len(containers),
                    "containers": container_info[:10]  # Limit to 10 to avoid huge responses
                }
            })
            
        except Exception as e:
            logger.error(f"Error testing Docker connection: {str(e)}", exc_info=True)
            return jsonify({"success": False, "error": str(e)}), 500
