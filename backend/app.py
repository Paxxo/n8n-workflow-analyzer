"""
Main entry point for the n8n AI Assistant Pro backend API.

This Flask application provides endpoints for:
1. Executing Docker commands
2. Running PostgreSQL queries
3. Managing the n8n environment
4. Health and status checks

Author: n8n AI Assistant Pro Team
Version: 2.0.0
"""

from flask import Flask
from flask_cors import CORS
import logging
from config import setup_config, get_config
from api.docker_routes import register_docker_routes
from api.postgres_routes import register_postgres_routes
from api.n8n_routes import register_n8n_routes
from api.health_routes import register_health_routes
from api.execute_routes import register_execute_routes
from docker_handler import init_docker_client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("n8n_ai_assistant_api")

# Initialize the application
def create_app():
    """Create and configure the Flask application."""
    # Load configuration
    setup_config()
    
    # Create Flask app
    app = Flask(__name__)
    CORS(app)  # Enable CORS for all routes
    
    # Initialize Docker client
    init_docker_client()
    
    # Register API routes
    register_health_routes(app)
    register_docker_routes(app)
    register_postgres_routes(app)
    register_n8n_routes(app)
    register_execute_routes(app)
    
    return app

# Create the Flask application
app = create_app()

# Run the application if executed directly
if __name__ == "__main__":
    config = get_config()
    app.run(host="0.0.0.0", port=5000, debug=config["DEBUG"])
