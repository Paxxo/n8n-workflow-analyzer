"""
API backend para el n8n AI Assistant Pro

Este servidor Flask proporciona endpoints para:
1. Ejecutar comandos Docker
2. Ejecutar consultas PostgreSQL
3. Interactuar con inteligencia artificial
4. Gestionar el entorno de n8n

Autor: n8n AI Assistant Pro Team
Versión: 2.0.0
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import subprocess
import os
import docker
import psycopg2
import logging
import time
import re
import uuid
from urllib.parse import urlparse
from datetime import datetime
from dotenv import load_dotenv

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("n8n_ai_assistant_api")

# Cargar variables de entorno
load_dotenv()

app = Flask(__name__)
CORS(app)  # Habilitar CORS para todas las rutas

# Configuración global
CONFIG = {
    "DEFAULT_POSTGRES_CONNECTION": os.getenv("DEFAULT_POSTGRES_CONNECTION", ""),
    "DEFAULT_DOCKER_HOST": os.getenv("DEFAULT_DOCKER_HOST", "unix:///var/run/docker.sock"),
    "COMMAND_TIMEOUT": int(os.getenv("COMMAND_TIMEOUT", "30")),
    "MAX_RESULTS": int(os.getenv("MAX_RESULTS", "1000")),
    "DEBUG": os.getenv("FLASK_DEBUG", "0") == "1"
}

# Inicializar cliente Docker global
try:
    docker_client = docker.DockerClient(base_url=CONFIG["DEFAULT_DOCKER_HOST"])
    logger.info(f"Cliente Docker inicializado con host: {CONFIG['DEFAULT_DOCKER_HOST']}")
except Exception as e:
    docker_client = None
    logger.warning(f"No se pudo inicializar el cliente Docker: {str(e)}")

# Endpoints principales

@app.route('/health', methods=['GET'])
def health_check():
    """Endpoint para verificar la salud del servicio"""
    docker_status = "OK" if docker_client else "ERROR"
    
    # Verificar conexión a PostgreSQL si hay configuración por defecto
    postgres_status = "N/A"
    if CONFIG["DEFAULT_POSTGRES_CONNECTION"]:
        try:
            conn = create_postgres_connection(CONFIG["DEFAULT_POSTGRES_CONNECTION"])
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

@app.route('/execute', methods=['POST'])
def execute_command():
    """
    Endpoint principal para ejecutar comandos en Docker o PostgreSQL
    """
    start_time = time.time()
    request_id = str(uuid.uuid4())
    
    try:
        data = request.json
        logger.info(f"Solicitud [{request_id}] recibida: {data}")
        
        # Verificar datos requeridos
        if not data:
            logger.warning(f"Solicitud [{request_id}] sin datos")
            return jsonify({"success": False, "error": "Se requieren parámetros para ejecutar comandos"}), 400
            
        operation_type = data.get('operation', 'generic')
        command = data.get('command', '')
        
        # Obtener parámetros específicos según el tipo de operación
        docker_command = data.get('docker_command', '')
        postgres_query = data.get('postgres_query', '')
        docker_host = data.get('docker_host', CONFIG["DEFAULT_DOCKER_HOST"])
        postgres_connection = data.get('postgres_connection', CONFIG["DEFAULT_POSTGRES_CONNECTION"])
        
        # Log de la operación
        logger.info(f"Ejecutando [{request_id}] - Tipo: {operation_type}, Command: {command}")
        
        # Ejecutar según el tipo de operación
        if operation_type == 'docker_command' or docker_command:
            cmd = docker_command or command
            result = execute_docker_command(cmd, docker_host)
        elif operation_type == 'postgres_query' or postgres_query:
            query = postgres_query or command
            result = execute_postgres_query(query, postgres_connection)
        elif operation_type == 'combined':
            # Ejecutar ambos tipos de comandos
            docker_result = "No se ejecutó comando Docker"
            postgres_result = "No se ejecutó consulta PostgreSQL"
            
            if docker_command:
                docker_result = execute_docker_command(docker_command, docker_host)
            if postgres_query:
                postgres_result = execute_postgres_query(postgres_query, postgres_connection)
            
            result = f"Resultado Docker:\n{docker_result}\n\nResultado PostgreSQL:\n{postgres_result}"
        else:
            # Para comandos genéricos, utilizar IA para interpretarlos y convertirlos
            result = interpret_natural_language_command(command, docker_host, postgres_connection)
        
        duration = time.time() - start_time
        logger.info(f"Solicitud [{request_id}] completada en {duration:.2f}s")
        
        return jsonify({
            "success": True, 
            "result": result,
            "request_id": request_id,
            "duration": duration
        })
        
    except Exception as e:
        duration = time.time() - start_time
        logger.error(f"Error en solicitud [{request_id}]: {str(e)}", exc_info=True)
        return jsonify({
            "success": False, 
            "error": str(e),
            "request_id": request_id,
            "duration": duration
        }), 500

@app.route('/test-postgres', methods=['POST'])
def test_postgres_connection():
    """
    Endpoint para probar la conexión a PostgreSQL
    """
    try:
        data = request.json
        connection_string = data.get('connectionString', '')
        
        if not connection_string:
            return jsonify({"success": False, "error": "Se requiere una cadena de conexión"}), 400
        
        # Intentar conectar a PostgreSQL
        conn = create_postgres_connection(connection_string)
        if conn:
            # Obtener información de la base de datos
            cursor = conn.cursor()
            cursor.execute("SELECT version();")
            db_version = cursor.fetchone()[0]
            
            # Obtener lista de bases de datos
            cursor.execute("SELECT datname FROM pg_database WHERE datistemplate = false;")
            databases = [row[0] for row in cursor.fetchall()]
            
            cursor.close()
            conn.close()
            
            return jsonify({
                "success": True, 
                "message": "Conexión exitosa a PostgreSQL",
                "db_info": {
                    "version": db_version,
                    "databases": databases
                }
            })
        
    except Exception as e:
        logger.error(f"Error al probar conexión PostgreSQL: {str(e)}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500
    
    return jsonify({"success": False, "error": "No se pudo establecer conexión"}), 500

@app.route('/test-docker', methods=['POST'])
def test_docker_connection():
    """
    Endpoint para probar la conexión a Docker
    """
    try:
        data = request.json
        docker_host = data.get('dockerHost', CONFIG["DEFAULT_DOCKER_HOST"])
        
        # Intentar conectar a Docker
        client = docker.DockerClient(base_url=docker_host)
        
        # Obtener información del servidor
        docker_info = client.info()
        docker_version = client.version()
        
        # Obtener lista de contenedores
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
            "message": "Conexión exitosa a Docker",
            "docker_info": {
                "version": docker_version.get('Version', 'unknown'),
                "containers_count": len(containers),
                "containers": container_info[:10]  # Limitar a 10 para evitar respuestas enormes
            }
        })
        
    except Exception as e:
        logger.error(f"Error al probar conexión Docker: {str(e)}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/n8n/status', methods=['GET'])
def n8n_status():
    """
    Endpoint para verificar el estado de n8n
    """
    try:
        # Verificar si hay un contenedor n8n en ejecución
        if not docker_client:
            return jsonify({"success": False, "error": "Cliente Docker no disponible"}), 500
        
        try:
            n8n_container = docker_client.containers.get('n8n')
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
                "error": "No se encontró un contenedor con el nombre 'n8n'"
            }), 404
        
    except Exception as e:
        logger.error(f"Error al verificar estado de n8n: {str(e)}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/n8n/restart', methods=['POST'])
def n8n_restart():
    """
    Endpoint para reiniciar el contenedor n8n
    """
    try:
        if not docker_client:
            return jsonify({"success": False, "error": "Cliente Docker no disponible"}), 500
        
        try:
            n8n_container = docker_client.containers.get('n8n')
            n8n_container.restart()
            
            return jsonify({
                "success": True,
                "message": "Contenedor n8n reiniciado correctamente"
            })
        except docker.errors.NotFound:
            return jsonify({
                "success": False,
                "error": "No se encontró un contenedor con el nombre 'n8n'"
            }), 404
            
    except Exception as e:
        logger.error(f"Error al reiniciar n8n: {str(e)}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

# Funciones para ejecutar comandos

def execute_docker_command(command, docker_host):
    """
    Ejecuta un comando de Docker
    
    Args:
        command: Comando Docker a ejecutar
        docker_host: URL del host de Docker
        
    Returns:
        Resultado de la ejecución del comando
    """
    try:
        # Verificar si es un comando vacío
        if not command:
            return "Comando Docker vacío"
        
        # Crear cliente Docker si es necesario
        global docker_client
        client = docker_client
        
        if docker_host != CONFIG["DEFAULT_DOCKER_HOST"] or client is None:
            client = docker.DockerClient(base_url=docker_host)
        
        # Limpiar el comando si comienza con 'docker '
        if command.startswith('docker '):
            command = command[7:]
        
        # Determinar qué tipo de comando de Docker es
        if command.startswith('ps') or command == 'ps':
            # Listar contenedores
            all_containers = True if '-a' in command else False
            containers = client.containers.list(all=all_containers)
            result = "CONTAINER ID\tIMAGE\t\tSTATUS\t\tNAMES\n"
            for container in containers:
                result += f"{container.short_id}\t{container.image.tags[0] if container.image.tags else 'none'}\t\t{container.status}\t{container.name}\n"
                
        elif command.startswith('logs'):
            # Obtener logs de un contenedor
            parts = command.split()
            container_name = parts[-1]
            
            # Opciones
            tail_lines = 100  # Por defecto
            follow = False
            
            # Comprobar si se especificó --tail
            if '--tail' in command:
                tail_index = parts.index('--tail')
                if tail_index + 1 < len(parts) and parts[tail_index + 1].isdigit():
                    tail_lines = int(parts[tail_index + 1])
            
            # Comprobar si se especificó -f o --follow
            if '-f' in parts or '--follow' in parts:
                follow = True
            
            container = client.containers.get(container_name)
            
            if follow:
                # Para follow, limitamos a un tiempo máximo
                timeout = time.time() + 10  # 10 segundos máximo
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
            # Reiniciar un contenedor
            parts = command.split()
            container_name = parts[-1]
            container = client.containers.get(container_name)
            container.restart()
            result = f"Contenedor {container_name} reiniciado correctamente"
            
        elif command.startswith('exec'):
            # Ejecutar comando dentro de un contenedor
            parts = command.split()
            if len(parts) < 3:
                return "Error: formato esperado 'exec CONTAINER COMMAND'"
                
            container_name = parts[1]
            cmd = ' '.join(parts[2:])
            
            container = client.containers.get(container_name)
            exec_result = container.exec_run(cmd)
            result = exec_result.output.decode('utf-8')
            
        elif command.startswith('images'):
            # Listar imágenes
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
            # Estadísticas de contenedores
            containers = client.containers.list()
            result = "CONTAINER\tCPU %\tMEM USAGE / LIMIT\tMEM %\tNET I/O\tBLOCK I/O\n"
            
            for container in containers:
                stats = container.stats(stream=False)
                
                # Calcular porcentaje de CPU
                cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - stats['precpu_stats']['cpu_usage']['total_usage']
                system_delta = stats['cpu_stats']['system_cpu_usage'] - stats['precpu_stats']['system_cpu_usage']
                num_cpus = stats['cpu_stats']['online_cpus']
                cpu_percent = (cpu_delta / system_delta) * num_cpus * 100.0
                
                # Calcular uso de memoria
                mem_usage = stats['memory_stats']['usage']
                mem_limit = stats['memory_stats']['limit']
                mem_percent = (mem_usage / mem_limit) * 100.0
                
                # Formatear valores
                mem_usage_mb = mem_usage / (1024 * 1024)
                mem_limit_mb = mem_limit / (1024 * 1024)
                
                # Red y almacenamiento
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
                
        else:
            # Para comandos no reconocidos, intentar usar el cliente docker-py
            # Este enfoque es más limitado y solo funciona para comandos simples
            if command.startswith('start'):
                parts = command.split()
                container_name = parts[-1]
                container = client.containers.get(container_name)
                container.start()
                result = f"Contenedor {container_name} iniciado correctamente"
                
            elif command.startswith('stop'):
                parts = command.split()
                container_name = parts[-1]
                container = client.containers.get(container_name)
                container.stop()
                result = f"Contenedor {container_name} detenido correctamente"
                
            elif command.startswith('pull'):
                parts = command.split()
                image_name = parts[-1]
                client.images.pull(image_name)
                result = f"Imagen {image_name} descargada correctamente"
                
            else:
                # Intentar ejecutar el comando mediante subprocess como último recurso
                # Esto es menos seguro pero necesario para comandos complejos
                command_with_docker = f"docker {command}"
                result = subprocess.check_output(command_with_docker, shell=True, timeout=CONFIG["COMMAND_TIMEOUT"]).decode('utf-8')
        
        return result
        
    except docker.errors.NotFound as e:
        return f"Error: Contenedor o imagen no encontrado: {str(e)}"
    except docker.errors.APIError as e:
        return f"Error de API de Docker: {str(e)}"
    except subprocess.TimeoutExpired:
        return f"Error: El comando excedió el tiempo límite de {CONFIG['COMMAND_TIMEOUT']} segundos"
    except Exception as e:
        logger.error(f"Error al ejecutar comando Docker: {str(e)}", exc_info=True)
        return f"Error al ejecutar comando Docker: {str(e)}"

def execute_postgres_query(query, connection_string):
    """
    Ejecuta una consulta SQL en PostgreSQL
    
    Args:
        query: Consulta SQL a ejecutar
        connection_string: Cadena de conexión a PostgreSQL
        
    Returns:
        Resultado de la ejecución de la consulta
    """
    try:
        # Verificar si es una consulta vacía
        if not query:
            return "Consulta SQL vacía"
        
        # Verificar si hay cadena de conexión
        if not connection_string:
            return "No se ha proporcionado una cadena de conexión a PostgreSQL"
        
        # Establecer conexión a PostgreSQL
        conn = create_postgres_connection(connection_string)
        
        if not conn:
            return "No se pudo establecer conexión a PostgreSQL"
        
        cursor = conn.cursor()
        
        # Limitar consultas peligrosas
        if is_dangerous_query(query):
            cursor.close()
            conn.close()
            return "Consulta rechazada por motivos de seguridad. No se permiten operaciones que puedan modificar masivamente la base de datos sin condiciones específicas."
        
        # Establecer un timeout para consultas largas
        cursor.execute(f"SET statement_timeout = {CONFIG['COMMAND_TIMEOUT'] * 1000};")
        
        # Ejecutar la consulta
        cursor.execute(query)
        
        # Intentar obtener resultados
        try:
            rows = cursor.fetchall()
            
            # Obtener nombres de columnas
            column_names = [desc[0] for desc in cursor.description]
            
            # Formatear resultados como tabla
            result = '\t'.join(column_names) + '\n'
            result += '-' * (sum(len(name) for name in column_names) + (len(column_names) - 1) * 1) + '\n'
            
            # Limitar resultados si son demasiados
            if len(rows) > CONFIG["MAX_RESULTS"]:
                limited_rows = rows[:CONFIG["MAX_RESULTS"]]
                for row in limited_rows:
                    result += '\t'.join(str(cell) for cell in row) + '\n'
                result += f"\n... (mostrando {CONFIG['MAX_RESULTS']} de {len(rows)} resultados)"
            else:
                for row in rows:
                    result += '\t'.join(str(cell) for cell in row) + '\n'
                
        except psycopg2.ProgrammingError:
            # Para consultas que no devuelven resultados (INSERT, UPDATE, etc.)
            conn.commit()
            result = f"Consulta ejecutada correctamente. Filas afectadas: {cursor.rowcount}"
        
        # Cerrar cursor y conexión
        cursor.close()
        conn.close()
        
        return result
        
    except psycopg2.Error as e:
        # Manejar errores específicos de PostgreSQL
        error_message = str(e).strip()
        return f"Error de PostgreSQL: {error_message}"
    except Exception as e:
        logger.error(f"Error al ejecutar consulta PostgreSQL: {str(e)}", exc_info=True)
        return f"Error al ejecutar consulta PostgreSQL: {str(e)}"

def interpret_natural_language_command(command, docker_host, postgres_connection):
    """
    Interpreta un comando en lenguaje natural y lo convierte en una operación específica
    
    Args:
        command: Comando en lenguaje natural
        docker_host: URL del host de Docker
        postgres_connection: Cadena de conexión a PostgreSQL
        
    Returns:
        Resultado de la operación interpretada
    """
    try:
        # Convertir a minúsculas para facilitar comparación
        command_lower = command.lower()
        
        # Comandos relacionados con Docker
        if any(keyword in command_lower for keyword in ['contenedor', 'docker', 'imagen', 'volumen']):
            # Listar contenedores
            if any(keyword in command_lower for keyword in ['lista', 'mostrar', 'ver']) and 'contenedor' in command_lower:
                return execute_docker_command('ps -a', docker_host)
            
            # Reiniciar contenedor
            if any(keyword in command_lower for keyword in ['reiniciar', 'restart', 'reboot']):
                # Buscar nombre del contenedor
                for container_name in get_container_names(docker_host):
                    if container_name.lower() in command_lower:
                        return execute_docker_command(f'restart {container_name}', docker_host)
                
                # Si menciona n8n especificamente
                if 'n8n' in command_lower:
                    return execute_docker_command('restart n8n', docker_host)
                
                return "Por favor, especifica qué contenedor deseas reiniciar"
            
            # Ver logs
            if any(keyword in command_lower for keyword in ['log', 'logs', 'registro']):
                # Buscar nombre del contenedor
                for container_name in get_container_names(docker_host):
                    if container_name.lower() in command_lower:
                        # Buscar número de líneas
                        lines = 100  # Por defecto
                        match = re.search(r'(\d+)\s+(líneas|lines|últimas|ultimas|últimos|ultimos)', command_lower)
                        if match:
                            lines = int(match.group(1))
                        
                        return execute_docker_command(f'logs --tail {lines} {container_name}', docker_host)
                
                # Si menciona n8n especificamente
                if 'n8n' in command_lower:
                    return execute_docker_command('logs --tail 100 n8n', docker_host)
                
                return "Por favor, especifica de qué contenedor deseas ver los logs"
            
            # Estadísticas de contenedores
            if any(keyword in command_lower for keyword in ['estadística', 'estadisticas', 'stats', 'estado', 'uso']):
                return execute_docker_command('stats --no-stream', docker_host)
            
            # Listar imágenes
            if any(keyword in command_lower for keyword in ['imagen', 'imagenes', 'images']):
                if any(keyword in command_lower for keyword in ['lista', 'mostrar', 'ver']):
                    return execute_docker_command('images', docker_host)
            
            # Si no se reconoce un comando específico de Docker
            return "No se pudo interpretar el comando de Docker. Por favor, sé más específico o utiliza la sintaxis directa de Docker."
        
        # Comandos relacionados con PostgreSQL
        elif any(keyword in command_lower for keyword in ['base de datos', 'postgresql', 'postgres', 'tabla', 'database', 'schema', 'esquema', 'sql', 'consulta', 'query']):
            # Listar bases de datos
            if any(keyword in command_lower for keyword in ['base de datos', 'database', 'databases']):
                if any(keyword in command_lower for keyword in ['lista', 'mostrar', 'ver']):
                    return execute_postgres_query("SELECT datname as database_name, pg_size_pretty(pg_database_size(datname)) as size FROM pg_database WHERE datistemplate = false ORDER BY pg_database_size(datname) DESC;", postgres_connection)
            
            # Listar tablas
            if 'tabla' in command_lower and any(keyword in command_lower for keyword in ['lista', 'mostrar', 'ver']):
                # Buscar esquema específico
                schema = 'public'  # Por defecto
                if 'esquema' in command_lower:
                    match = re.search(r'esquema\s+([a-zA-Z0-9_]+)', command_lower)
                    if match:
                        schema = match.group(1)
                
                return execute_postgres_query(f"SELECT table_name, (xpath('/row/cnt/text()', xml_count))[1]::text::int as row_count FROM (SELECT table_name, table_schema, query_to_xml('select count(*) as cnt from ' || table_schema || '.' || table_name, false, true, '') as xml_count FROM information_schema.tables WHERE table_schema = '{schema}') t ORDER BY table_name;", postgres_connection)
            
            # Ver esquema de tabla
            if 'esquema' in command_lower:
                # Buscar nombre de tabla en el comando
                match = re.search(r'(tabla|table)\s+([a-zA-Z0-9_]+)', command_lower)
                if match:
                    table_name = match.group(2)
                    return execute_postgres_query(f"SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '{table_name}' ORDER BY ordinal_position;", postgres_connection)
                else:
                    return "Por favor, especifica de qué tabla deseas ver el esquema"
            
            # Top 10 tablas más grandes
            if any(keyword in command_lower for keyword in ['grande', 'grandes', 'tamaño', 'size', 'espacio', 'disco']):
                return execute_postgres_query("""
                    SELECT 
                        table_schema, 
                        table_name, 
                        pg_size_pretty(pg_total_relation_size('"' || table_schema || '"."' || table_name || '"')) as total_size,
                        pg_size_pretty(pg_relation_size('"' || table_schema || '"."' || table_name || '"')) as data_size,
                        pg_size_pretty(pg_total_relation_size('"' || table_schema || '"."' || table_name || '"') - pg_relation_size('"' || table_schema || '"."' || table_name || '"')) as external_size
                    FROM information_schema.tables
                    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
                    ORDER BY pg_total_relation_size('"' || table_schema || '"."' || table_name || '"') DESC
                    LIMIT 10;
                """, postgres_connection)
        # Si no se reconoce un comando específico de PostgreSQL
        return "No se pudo interpretar el comando de PostgreSQL. Por favor, sé más específico o utiliza una consulta SQL directa."
    except Exception as e:
        logger.error(f"Error al interpretar comando en lenguaje natural: {str(e)}", exc_info=True)
        return f"Error al interpretar comando en lenguaje natural: {str(e)}"

# Utilidades auxiliares

def get_container_names(docker_host):
    """Devuelve una lista de nombres de contenedores Docker activos"""
    try:
        client = docker.DockerClient(base_url=docker_host)
        return [container.name for container in client.containers.list(all=True)]
    except Exception:
        return []

def is_dangerous_query(query):
    """Detecta si una consulta SQL es potencialmente peligrosa"""
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

def create_postgres_connection(connection_string):
    """Crea y retorna una conexión a PostgreSQL"""
    return psycopg2.connect(connection_string)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=CONFIG["DEBUG"])