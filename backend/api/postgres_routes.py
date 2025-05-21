"""
PostgreSQL-related API endpoints for the n8n AI Assistant Pro backend.
"""

from flask import request, jsonify
import logging
import re
from config import get_config
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
    
    @app.route('/postgres/databases', methods=['GET'])
    def list_databases():
        """Endpoint to list PostgreSQL databases."""
        try:
            config = get_config()
            connection_string = request.args.get('connection', config["DEFAULT_POSTGRES_CONNECTION"])
            
            if not connection_string:
                return jsonify({"success": False, "error": "No PostgreSQL connection configured"}), 400
            
            query = """
            SELECT 
                datname as database_name, 
                pg_size_pretty(pg_database_size(datname)) as size,
                pg_database_size(datname) as size_bytes
            FROM pg_database 
            WHERE datistemplate = false 
            ORDER BY pg_database_size(datname) DESC;
            """
            
            result = execute_postgres_query(query, connection_string)
            
            # Process the result
            if result.startswith("PostgreSQL Error:"):
                return jsonify({"success": False, "error": result}), 500
            
            # Parse tabular result into JSON
            lines = result.strip().split('\n')
            if len(lines) < 3:  # Header + separator + at least one row
                return jsonify({"success": True, "databases": []})
                
            headers = lines[0].split('\t')
            databases = []
            
            for line in lines[2:]:  # Skip header and separator
                if not line.strip():  # Skip empty lines
                    continue
                values = line.split('\t')
                if len(values) >= len(headers):
                    db_info = {}
                    for i, header in enumerate(headers):
                        db_info[header.strip()] = values[i].strip()
                    databases.append(db_info)
            
            return jsonify({
                "success": True,
                "databases": databases
            })
            
        except Exception as e:
            logger.error(f"Error listing databases: {str(e)}", exc_info=True)
            return jsonify({"success": False, "error": str(e)}), 500
    
    @app.route('/postgres/tables', methods=['GET'])
    def list_tables():
        """Endpoint to list tables in a PostgreSQL database."""
        try:
            config = get_config()
            connection_string = request.args.get('connection', config["DEFAULT_POSTGRES_CONNECTION"])
            schema = request.args.get('schema', 'public')
            
            if not connection_string:
                return jsonify({"success": False, "error": "No PostgreSQL connection configured"}), 400
            
            # Sanitize schema name to prevent SQL injection
            if not re.match(r'^[a-zA-Z0-9_]+$', schema):
                return jsonify({"success": False, "error": "Invalid schema name"}), 400
            
            query = f"""
            SELECT 
                table_name, 
                (xpath('/row/cnt/text()', xml_count))[1]::text::int as row_count,
                pg_size_pretty(pg_total_relation_size('"' || table_schema || '"."' || table_name || '"')) as total_size
            FROM (
                SELECT 
                    table_name, 
                    table_schema, 
                    query_to_xml('select count(*) as cnt from ' || table_schema || '.' || table_name, false, true, '') as xml_count
                FROM information_schema.tables 
                WHERE table_schema = '{schema}'
            ) t 
            ORDER BY table_name;
            """
            
            result = execute_postgres_query(query, connection_string)
            
            # Process the result
            if result.startswith("PostgreSQL Error:"):
                return jsonify({"success": False, "error": result}), 500
            
            # Parse tabular result into JSON
            lines = result.strip().split('\n')
            if len(lines) < 3:  # Header + separator + at least one row
                return jsonify({"success": True, "tables": []})
                
            headers = lines[0].split('\t')
            tables = []
            
            for line in lines[2:]:  # Skip header and separator
                if not line.strip():  # Skip empty lines
                    continue
                values = line.split('\t')
                if len(values) >= len(headers):
                    table_info = {}
                    for i, header in enumerate(headers):
                        table_info[header.strip()] = values[i].strip()
                    tables.append(table_info)
            
            return jsonify({
                "success": True,
                "schema": schema,
                "tables": tables
            })
            
        except Exception as e:
            logger.error(f"Error listing tables: {str(e)}", exc_info=True)
            return jsonify({"success": False, "error": str(e)}), 500
            
    @app.route('/postgres/table-schema', methods=['GET'])
    def get_table_schema():
        """Endpoint to get schema of a PostgreSQL table."""
        try:
            config = get_config()
            connection_string = request.args.get('connection', config["DEFAULT_POSTGRES_CONNECTION"])
            table_name = request.args.get('table')
            schema = request.args.get('schema', 'public')
            
            if not connection_string:
                return jsonify({"success": False, "error": "No PostgreSQL connection configured"}), 400
                
            if not table_name:
                return jsonify({"success": False, "error": "Table name is required"}), 400
            
            # Sanitize input to prevent SQL injection
            if not re.match(r'^[a-zA-Z0-9_]+$', table_name) or not re.match(r'^[a-zA-Z0-9_]+$', schema):
                return jsonify({"success": False, "error": "Invalid table or schema name"}), 400
            
            query = f"""
            SELECT 
                column_name, 
                data_type, 
                is_nullable, 
                column_default,
                ordinal_position
            FROM information_schema.columns 
            WHERE table_name = '{table_name}' AND table_schema = '{schema}'
            ORDER BY ordinal_position;
            """
            
            result = execute_postgres_query(query, connection_string)
            
            # Process the result
            if result.startswith("PostgreSQL Error:"):
                return jsonify({"success": False, "error": result}), 500
            
            # Parse tabular result into JSON
            lines = result.strip().split('\n')
            if len(lines) < 3:  # Header + separator + at least one row
                return jsonify({"success": True, "columns": []})
                
            headers = lines[0].split('\t')
            columns = []
            
            for line in lines[2:]:  # Skip header and separator
                if not line.strip():  # Skip empty lines
                    continue
                values = line.split('\t')
                if len(values) >= len(headers):
                    column_info = {}
                    for i, header in enumerate(headers):
                        column_info[header.strip()] = values[i].strip()
                    columns.append(column_info)
            
            # Get indexes for the table
            index_query = f"""
            SELECT
                indexname,
                indexdef
            FROM pg_indexes
            WHERE tablename = '{table_name}' AND schemaname = '{schema}';
            """
            
            index_result = execute_postgres_query(index_query, connection_string)
            
            # Process index results
            indexes = []
            if not index_result.startswith("PostgreSQL Error:"):
                index_lines = index_result.strip().split('\n')
                if len(index_lines) >= 3:  # Header + separator + at least one row
                    index_headers = index_lines[0].split('\t')
                    
                    for line in index_lines[2:]:  # Skip header and separator
                        if not line.strip():  # Skip empty lines
                            continue
                        values = line.split('\t')
                        if len(values) >= len(index_headers):
                            index_info = {}
                            for i, header in enumerate(index_headers):
                                index_info[header.strip()] = values[i].strip()
                            indexes.append(index_info)
            
            return jsonify({
                "success": True,
                "table": table_name,
                "schema": schema,
                "columns": columns,
                "indexes": indexes
            })
            
        except Exception as e:
            logger.error(f"Error getting table schema: {str(e)}", exc_info=True)
            return jsonify({"success": False, "error": str(e)}), 500
    
    @app.route('/postgres/query', methods=['POST'])
    def run_query():
        """Endpoint to execute a custom PostgreSQL query."""
        try:
            data = request.json
            query = data.get('query', '')
            connection_string = data.get('connection', get_config()["DEFAULT_POSTGRES_CONNECTION"])
            
            if not query:
                return jsonify({"success": False, "error": "Query is required"}), 400
                
            if not connection_string:
                return jsonify({"success": False, "error": "No PostgreSQL connection configured"}), 400
            
            # Execute the query
            result = execute_postgres_query(query, connection_string)
            
            # Check for errors
            if result.startswith("PostgreSQL Error:"):
                return jsonify({"success": False, "error": result}), 500
            
            # Check if query is SELECT (returns data) or other (returns row count)
            if "Rows affected:" in result:
                # For INSERT, UPDATE, DELETE, etc.
                match = re.search(r"Rows affected: (\d+)", result)
                affected_rows = int(match.group(1)) if match else 0
                
                return jsonify({
                    "success": True,
                    "type": "modification",
                    "affected_rows": affected_rows,
                    "message": result
                })
            else:
                # For SELECT queries, parse tabular result into JSON
                lines = result.strip().split('\n')
                if len(lines) < 2:  # At least header + separator
                    return jsonify({
                        "success": True,
                        "type": "query",
                        "columns": [],
                        "rows": []
                    })
                
                headers = lines[0].split('\t')
                rows = []
                
                for line in lines[2:]:  # Skip header and separator
                    if not line.strip() or '... (showing' in line:  # Skip empty lines and truncation message
                        continue
                    values = line.split('\t')
                    if len(values) >= len(headers):
                        row = {}
                        for i, header in enumerate(headers):
                            row[header.strip()] = values[i].strip() if i < len(values) else None
                        rows.append(row)
                
                # Check if result was truncated
                truncated = False
                truncation_message = ""
                for line in lines:
                    if '... (showing' in line:
                        truncated = True
                        truncation_message = line.strip()
                        break
                
                return jsonify({
                    "success": True,
                    "type": "query",
                    "columns": [h.strip() for h in headers],
                    "rows": rows,
                    "truncated": truncated,
                    "truncation_message": truncation_message
                })
            
        except Exception as e:
            logger.error(f"Error executing custom query: {str(e)}", exc_info=True)
            return jsonify({"success": False, "error": str(e)}), 500