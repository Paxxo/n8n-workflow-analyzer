"""
Configuration management for the n8n AI Assistant Pro backend.
"""

import os
from dotenv import load_dotenv

# Global configuration dictionary
CONFIG = {}

def setup_config():
    """Load and set up the application configuration."""
    # Load environment variables from .env file
    load_dotenv()
    
    global CONFIG
    CONFIG = {
        "DEFAULT_POSTGRES_CONNECTION": os.getenv("DEFAULT_POSTGRES_CONNECTION", ""),
        "DEFAULT_DOCKER_HOST": os.getenv("DEFAULT_DOCKER_HOST", "unix:///var/run/docker.sock"),
        "COMMAND_TIMEOUT": int(os.getenv("COMMAND_TIMEOUT", "30")),
        "MAX_RESULTS": int(os.getenv("MAX_RESULTS", "1000")),
        "DEBUG": os.getenv("FLASK_DEBUG", "0") == "1"
    }

def get_config():
    """Get the current configuration."""
    return CONFIG