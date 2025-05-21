"""
Natural language interpreter for Docker and PostgreSQL commands.
"""

import re
import logging
from docker_handler import execute_docker_command, get_container_names
from postgres_handler import execute_postgres_query

logger = logging.getLogger("n8n_ai_assistant_api")

def interpret_natural_language_command(command, docker_host, postgres_connection):
    """
    Interpret a natural language command and convert it to a specific operation.
    
    Args:
        command: Natural language command
        docker_host: Docker host URL
        postgres_connection: PostgreSQL connection string
        
    Returns:
        Result of the interpreted operation
    """
    try:
        # Convert to lowercase for easier comparison
        command_lower = command.lower()
        
        # Commands related to Docker
        if any(keyword in command_lower for keyword in ['container', 'docker', 'image', 'volume']):
            # List containers
            if any(keyword in command_lower for keyword in ['list', 'show', 'view']) and 'container' in command_lower:
                return execute_docker_command('ps -a', docker_host)
            
            # Restart container
            if any(keyword in command_lower for keyword in ['restart', 'reboot']):
                # Look for container name
                for container_name in get_container_names(docker_host):
                    if container_name.lower() in command_lower:
                        return execute_docker_command(f'restart {container_name}', docker_host)
                
                # If specifically mentions n8n
                if 'n8n' in command_lower:
                    return execute_docker_command('restart n8n', docker_host)
                
                return "Please specify which container you want to restart"
            
            # View logs
            if any(keyword in command_lower for keyword in ['log', 'logs', 'records']):
                # Look for container name
                for container_name in get_container_names(docker_host):
                    if container_name.lower() in command_lower:
                        # Look for number of lines
                        lines = 100  # Default
                        match = re.search(r'(\d+)\s+(lines|last|latest)', command_lower)
                        if match:
                            lines = int(match.group(1))
                        
                        return execute_docker_command(f'logs --tail {lines} {container_name}', docker_host)
                
                # If specifically mentions n8n
                if 'n8n' in command_lower:
                    return execute_docker_command('logs --tail 100 n8n', docker_host)
                
                return "Please specify which container logs you want to see"
            
            # Container statistics
            if any(keyword in command_lower for keyword in ['stats', 'statistics', 'status', 'usage']):
                return execute_docker_command('stats --no-stream', docker_host)
            
            # List images
            if any(keyword in command_lower for keyword in ['image', 'images']):
                if any(keyword in command_lower for keyword in ['list', 'show', 'view']):
                    return execute_docker_command('images', docker_host)
            
            # If no specific Docker command is recognized
            return "Could not interpret Docker command. Please be more specific or use direct Docker syntax."
        
        # Commands related to PostgreSQL
        elif any(keyword in command_lower for keyword in ['database', 'postgresql', 'postgres', 'table', 'schema', 'sql', 'query']):
            # List databases
            if any(keyword in command_lower for keyword in ['database', 'databases']):
                if any(keyword in command_lower for keyword in ['list', 'show', 'view']):
                    return execute_postgres_query(
                        "SELECT datname as database_name, pg_size_pretty(pg_database_size(datname)) as size "
                        "FROM pg_database WHERE datistemplate = false ORDER BY pg_database_size(datname) DESC;", 
                        postgres_connection
                    )
            
            # List tables
            if 'table' in command_lower and any(keyword in command_lower for keyword in ['list', 'show', 'view']):
                # Look for specific schema
                schema = 'public'  # Default
                if 'schema' in command_lower:
                    match = re.search(r'schema\s+([a-zA-Z0-9_]+)', command_lower)
                    if match:
                        schema = match.group(1)
                
                return execute_postgres_query(
                    f"SELECT table_name, (xpath('/row/cnt/text()', xml_count))[1]::text::int as row_count "
                    f"FROM (SELECT table_name, table_schema, "
                    f"query_to_xml('select count(*) as cnt from ' || table_schema || '.' || table_name, false, true, '') as xml_count "
                    f"FROM information_schema.tables WHERE table_schema = '{schema}') t ORDER BY table_name;", 
                    postgres_connection
                )
            
            # View table schema
            if 'schema' in command_lower:
                # Look for table name in the command
                match = re.search(r'(table|tables)\s+([a-zA-Z0-9_]+)', command_lower)
                if match:
                    table_name = match.group(2)
                    return execute_postgres_query(
                        f"SELECT column_name, data_type, is_nullable, column_default "
                        f"FROM information_schema.columns WHERE table_name = '{table_name}' ORDER BY ordinal_position;", 
                        postgres_connection
                    )
                else:
                    return "Please specify which table schema you want to view"
            
            # Top 10 largest tables
            if any(keyword in command_lower for keyword in ['large', 'largest', 'size', 'space', 'disk']):
                return execute_postgres_query("""
                    SELECT 
                        table_schema, 
                        table_name, 
                        pg_size_pretty(pg_total_relation_size('"' || table_schema || '"."' || table_name || '"')) as total_size,
                        pg_size_pretty(pg_relation_size('"' || table_schema || '"."' || table_name || '"')) as data_size,
                        pg_size_pretty(pg_total_relation_size('"' || table_schema || '"."' || table_name || '"') - 
                                      pg_relation_size('"' || table_schema || '"."' || table_name || '"')) as external_size
                    FROM information_schema.tables
                    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
                    ORDER BY pg_total_relation_size('"' || table_schema || '"."' || table_name || '"') DESC
                    LIMIT 10;
                """, postgres_connection)
            
            # If no specific PostgreSQL command is recognized
            return "Could not interpret PostgreSQL command. Please be more specific or use direct SQL."
            
        # If command doesn't match any category
        return "Could not interpret command. Please be more specific about whether you want to work with Docker containers or PostgreSQL databases."
        
    except Exception as e:
        logger.error(f"Error interpreting natural language command: {str(e)}", exc_info=True)
        return f"Error interpreting command: {str(e)}"