"""
Docker interaction functionality for the n8n AI Assistant Pro backend.
"""

import docker
import subprocess
import time
import logging
from datetime import datetime
from config import get_config

# Module-level variables
docker_client = None
logger = logging.getLogger("n8n_ai_assistant_api")

def init_docker_client():
    """Initialize the global Docker client."""
    global docker_client
    config = get_config()
    
    try:
        docker_client = docker.DockerClient(base_url=config["DEFAULT_DOCKER_HOST"])
        logger.info(f"Docker client initialized with host: {config['DEFAULT_DOCKER_HOST']}")
    except Exception as e:
        docker_client = None
        logger.warning(f"Could not initialize Docker client: {str(e)}")

def get_docker_client(docker_host=None):
    """Get the Docker client, optionally creating a new one with a specific host."""
    global docker_client
    config = get_config()
    
    # Use the provided docker_host or the default one
    host = docker_host or config["DEFAULT_DOCKER_HOST"]
    
    # Return the global client if it's already initialized with the right host
    if docker_client is not None and host == config["DEFAULT_DOCKER_HOST"]:
        return docker_client
    
    # Create a new client with the specified host
    try:
        return docker.DockerClient(base_url=host)
    except Exception as e:
        logger.error(f"Error creating Docker client with host {host}: {str(e)}")
        raise

def get_container_names(docker_host=None):
    """Get a list of container names from Docker."""
    try:
        client = get_docker_client(docker_host)
        return [container.name for container in client.containers.list(all=True)]
    except Exception as e:
        logger.error(f"Error getting container names: {str(e)}")
        return []

def execute_docker_command(command, docker_host=None):
    """
    Execute a Docker command.
    
    Args:
        command: Docker command to execute
        docker_host: URL of the Docker host (optional)
        
    Returns:
        Result of the command execution
    """
    try:
        # Check for empty command
        if not command:
            return "Empty Docker command"
        
        # Clean up the command if it starts with 'docker '
        if command.startswith('docker '):
            command = command[7:]
        
        # Get the Docker client
        client = get_docker_client(docker_host)
        config = get_config()
        
        # Process different Docker commands
        if command.startswith('ps') or command == 'ps':
            # List containers
            all_containers = True if '-a' in command else False
            containers = client.containers.list(all=all_containers)
            result = "CONTAINER ID\tIMAGE\t\tSTATUS\t\tNAMES\n"
            for container in containers:
                result += f"{container.short_id}\t{container.image.tags[0] if container.image.tags else 'none'}\t\t{container.status}\t{container.name}\n"
                
        elif command.startswith('logs'):
            # Get container logs
            parts = command.split()
            container_name = parts[-1]
            
            # Check for options
            tail_lines = 100  # Default
            follow = False
            
            if '--tail' in command:
                tail_index = parts.index('--tail')
                if tail_index + 1 < len(parts) and parts[tail_index + 1].isdigit():
                    tail_lines = int(parts[tail_index + 1])
            
            if '-f' in parts or '--follow' in parts:
                follow = True
            
            container = client.containers.get(container_name)
            
            if follow:
                # For follow mode, we limit to a maximum time
                timeout = time.time() + 10  # 10 seconds maximum
                logs = []
                
                for line in container.logs(stream=True, tail=tail_lines):
                    logs.append(line.decode('utf-8').strip())
                    if time.time() > timeout:
                        logs.append("... Truncated (10 second limit) ...")
                        break
                
                result = "\n".join(logs)
            else:
                result = container.logs(tail=tail_lines).decode('utf-8')
            
        elif command.startswith('restart'):
            # Restart a container
            parts = command.split()
            container_name = parts[-1]
            container = client.containers.get(container_name)
            container.restart()
            result = f"Container {container_name} restarted successfully"
            
        elif command.startswith('exec'):
            # Execute command in a container
            parts = command.split()
            if len(parts) < 3:
                return "Error: expected format 'exec CONTAINER COMMAND'"
                
            container_name = parts[1]
            cmd = ' '.join(parts[2:])
            
            container = client.containers.get(container_name)
            exec_result = container.exec_run(cmd)
            result = exec_result.output.decode('utf-8')
            
        elif command.startswith('images'):
            # List images
            images = client.images.list()
            result = "REPOSITORY\tTAG\t\tIMAGE ID\t\tCREATED\t\tSIZE\n"
            for image in images:
                repo_tags = image.tags[0] if image.tags else '<none>:<none>'
                repo, tag = '<none>', '<none>'
                if ':' in repo_tags:
                    repo, tag = repo_tags.split(':', 1)
                
                created = datetime.fromtimestamp(image.attrs['Created']).strftime('%Y-%m-%d %H:%M:%S')
                size_mb = image.attrs['Size'] / (1024 * 1024)
                
                result += f"{repo}\t{tag}\t\t{image.short_id}\t{created}\t{size_mb:.2f} MB\n"
                
        elif command.startswith('stats'):
            # Container statistics
            containers = client.containers.list()
            result = "CONTAINER\tCPU %\tMEM USAGE / LIMIT\tMEM %\tNET I/O\tBLOCK I/O\n"
            
            for container in containers:
                stats = container.stats(stream=False)
                
                # Calculate CPU percentage
                cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - stats['precpu_stats']['cpu_usage']['total_usage']
                system_delta = stats['cpu_stats']['system_cpu_usage'] - stats['precpu_stats']['system_cpu_usage']
                num_cpus = stats['cpu_stats']['online_cpus']
                cpu_percent = (cpu_delta / system_delta) * num_cpus * 100.0
                
                # Calculate memory usage
                mem_usage = stats['memory_stats']['usage']
                mem_limit = stats['memory_stats']['limit']
                mem_percent = (mem_usage / mem_limit) * 100.0
                
                # Format values
                mem_usage_mb = mem_usage / (1024 * 1024)
                mem_limit_mb = mem_limit / (1024 * 1024)
                
                # Network and storage
                net_io = "N/A"
                if 'networks' in stats:
                    rx_bytes = sum(net['rx_bytes'] for net in stats['networks'].values())
                    tx_bytes = sum(net['tx_bytes'] for net in stats['networks'].values())
                    rx_mb = rx_bytes / (1024 * 1024)
                    tx_mb = tx_bytes / (1024 * 1024)
                    net_io = f"{rx_mb:.2f}MB / {tx_mb:.2f}MB"
                
                block_io = "N/A"
                if 'blkio_stats' in stats and 'io_service_bytes_recursive' in stats['blkio_stats']:
                    reads = sum(item['value'] for item in stats['blkio_stats']['io_service_bytes_recursive'] if item['op'] == 'Read')
                    writes = sum(item['value'] for item in stats['blkio_stats']['io_service_bytes_recursive'] if item['op'] == 'Write')
                    reads_mb = reads / (1024 * 1024)
                    writes_mb = writes / (1024 * 1024)
                    block_io = f"{reads_mb:.2f}MB / {writes_mb:.2f}MB"
                
                result += f"{container.name}\t{cpu_percent:.2f}%\t{mem_usage_mb:.2f}MB / {mem_limit_mb:.2f}MB\t{mem_percent:.2f}%\t{net_io}\t{block_io}\n"
                
        elif command.startswith('start'):
            # Start a container
            parts = command.split()
            container_name = parts[-1]
            container = client.containers.get(container_name)
            container.start()
            result = f"Container {container_name} started successfully"
            
        elif command.startswith('stop'):
            # Stop a container
            parts = command.split()
            container_name = parts[-1]
            container = client.containers.get(container_name)
            container.stop()
            result = f"Container {container_name} stopped successfully"
            
        elif command.startswith('pull'):
            # Pull an image
            parts = command.split()
            image_name = parts[-1]
            client.images.pull(image_name)
            result = f"Image {image_name} pulled successfully"
            
        else:
            # Try using subprocess as a last resort for complex commands
            command_with_docker = f"docker {command}"
            result = subprocess.check_output(
                command_with_docker, 
                shell=True, 
                timeout=config["COMMAND_TIMEOUT"]
            ).decode('utf-8')
        
        return result
        
    except docker.errors.NotFound as e:
        return f"Error: Container or image not found: {str(e)}"
    except docker.errors.APIError as e:
        return f"Docker API Error: {str(e)}"
    except subprocess.TimeoutExpired:
        return f"Error: Command exceeded the time limit of {get_config()['COMMAND_TIMEOUT']} seconds"
    except Exception as e:
        logger.error(f"Error executing Docker command: {str(e)}", exc_info=True)
        return f"Error executing Docker command: {str(e)}"
