"""
PostgreSQL interaction functionality for the n8n AI Assistant Pro backend.
"""

import psycopg2
import re
import logging
from config import get_config

logger = logging.getLogger("n8n_ai_assistant_api")

def create_postgres_connection(connection_string):
    """Create and return a PostgreSQL connection."""
    return psycopg2.connect(connection_string)

def is_dangerous_query(query):
    """Detect if a SQL query is potentially dangerous."""
    dangerous_patterns = [
        r"delete\s+from\s+\w+\s*;?$",
        r"truncate\s+table\s+\w+\s*;?$",
        r"drop\s+table\s+\w+\s*;?$",
        r"update\s+\w+\s+set\s+.+;?$"
    ]
    for pattern in dangerous_patterns:
        if re.search(pattern, query, re.IGNORECASE):
            return True
    return False

def execute_postgres_query(query, connection_string):
    """
    Execute a SQL query on PostgreSQL.
    
    Args:
        query: SQL query to execute
        connection_string: PostgreSQL connection string
        
    Returns:
        Result of the query execution
    """
    try:
        # Check for empty query
        if not query:
            return "Empty SQL query"
        
        # Check for missing connection string
        if not connection_string:
            return "No PostgreSQL connection string provided"
        
        # Establish PostgreSQL connection
        conn = create_postgres_connection(connection_string)
        
        if not conn:
            return "Could not establish PostgreSQL connection"
        
        cursor = conn.cursor()
        
        # Check for dangerous queries
        if is_dangerous_query(query):
            cursor.close()
            conn.close()
            return "Query rejected for security reasons. Operations that can modify the database massively without specific conditions are not allowed."
        
        # Set timeout for long queries
        config = get_config()
        cursor.execute(f"SET statement_timeout = {config['COMMAND_TIMEOUT'] * 1000};")
        
        # Execute the query
        cursor.execute(query)
        
        # Try to get results
        try:
            rows = cursor.fetchall()
            
            # Get column names
            column_names = [desc[0] for desc in cursor.description]
            
            # Format results as a table
            result = '\t'.join(column_names) + '\n'
            result += '-' * (sum(len(name) for name in column_names) + (len(column_names) - 1) * 1) + '\n'
            
            # Limit results if too many
            max_results = config["MAX_RESULTS"]
            if len(rows) > max_results:
                limited_rows = rows[:max_results]
                for row in limited_rows:
                    result += '\t'.join(str(cell) for cell in row) + '\n'
                result += f"\n... (showing {max_results} of {len(rows)} results)"
            else:
                for row in rows:
                    result += '\t'.join(str(cell) for cell in row) + '\n'
                
        except psycopg2.ProgrammingError:
            # For queries that don't return results (INSERT, UPDATE, etc.)
            conn.commit()
            result = f"Query executed successfully. Rows affected: {cursor.rowcount}"
        
        # Close cursor and connection
        cursor.close()
        conn.close()
        
        return result
        
    except psycopg2.Error as e:
        # Handle specific PostgreSQL errors
        error_message = str(e).strip()
        return f"PostgreSQL Error: {error_message}"
    except Exception as e:
        logger.error(f"Error executing PostgreSQL query: {str(e)}", exc_info=True)
        return f"Error executing PostgreSQL query: {str(e)}"