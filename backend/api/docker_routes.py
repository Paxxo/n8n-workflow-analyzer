"""
Docker-related API endpoints for the n8n AI Assistant Pro backend.
"""

from flask import request, jsonify
import logging
from postgres_handler import create_postgres_connection, execute_postgres_query

logger = logging.getLogger("n8n_ai_assistant_api")

def register_postgres_routes(app):
    """Register PostgreSQL-related endpoints."""
    
    @app.route('/test-postgres', methods=['POST'])
    def test_postgres_connection():
        """Endpoint to test PostgreSQL connection."""
        try:
            data = request.json
            connection_string = data.get('connectionString', '')
            
            if not connection_string:
                return jsonify({"success": False, "error": "Connection string required"}), 400
            
            # Try to connect to PostgreSQL
            conn = create_postgres_connection(connection_string)
            if conn:
                # Get database information
                cursor = conn.cursor()
                cursor.execute("SELECT version();")
                db_version = cursor.fetchone()[0]
                
                # Get list of databases
                cursor.execute("SELECT datname FROM pg_database WHERE datistemplate = false;")
                databases = [row[0] for row in cursor.fetchall()]
                
                cursor.close()
                conn.close()
                
                return jsonify({
                    "success": True, 
                    "message": "PostgreSQL connection successful",
                    "db_info": {
                        "version": db_version,
                        "databases": databases
                    }
                })
            
        except Exception as e:
            logger.error(f"Error testing PostgreSQL connection: {str(e)}", exc_info=True)
            return jsonify({"success": False, "error": str(e)}), 500
        
        return jsonify({"success": False, "error": "Could not establish connection"}), 500