#!/usr/bin/env python
"""
Script para terminar de forma segura la aplicación Flask de n8n AI Assistant Pro.
Este script se conecta al servidor Flask en ejecución y lo cierra correctamente.
"""

import os
import sys
import signal
import requests
import socket
import time
import subprocess
import psutil

def find_flask_process():
    """Busca el proceso de Flask por nombre"""
    print("Buscando proceso de Flask...")
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = proc.info['cmdline']
            if cmdline and 'python' in proc.info['name'].lower():
                cmdline_str = ' '.join(cmdline) if cmdline else ''
                if 'app.py' in cmdline_str and ('flask' in cmdline_str.lower() or 'n8n_ai_assistant_api' in cmdline_str):
                    print(f"Proceso de Flask encontrado: PID {proc.info['pid']}")
                    return proc.info['pid']
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return None

def terminate_by_pid(pid):
    """Termina un proceso utilizando su PID"""
    if not pid:
        return False
    
    print(f"Intentando terminar proceso con PID {pid}...")
    try:
        process = psutil.Process(pid)
        process.terminate()
        
        # Esperar a que termine
        gone, alive = psutil.wait_procs([process], timeout=5)
        
        if process in alive:
            print("El proceso no respondió a SIGTERM. Enviando SIGKILL...")
            process.kill()
        
        print(f"Proceso con PID {pid} terminado correctamente.")
        return True
    except psutil.NoSuchProcess:
        print(f"El proceso con PID {pid} ya no existe.")
        return True
    except Exception as e:
        print(f"Error al terminar proceso: {e}")
        return False

def terminate_by_http(port=5000):
    """Intenta terminar la aplicación Flask enviando una solicitud HTTP especial"""
    try:
        print(f"Intentando terminar el servidor Flask en el puerto {port} vía HTTP...")
        # Esta ruta no existe, pero al menos verificará si el servidor está en ejecución
        requests.get(f"http://localhost:{port}/shutdown", timeout=2)
        print("Solicitud de apagado enviada.")
        return True
    except requests.exceptions.ConnectionError:
        print("No se pudo conectar al servidor Flask.")
        return False
    except Exception as e:
        print(f"Error al enviar solicitud de apagado: {e}")
        return False

def check_port_in_use(port=5000):
    """Verifica si el puerto está en uso"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def find_process_by_port(port=5000):
    """Encuentra un proceso que esté usando un puerto específico"""
    for proc in psutil.process_iter(['pid', 'connections']):
        try:
            connections = proc.connections()
            for conn in connections:
                if conn.laddr.port == port:
                    return proc.pid
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return None

def main():
    """Función principal"""
    print("Iniciando terminación de la aplicación n8n AI Assistant Pro...")
    
    # Comprobar si el puerto 5000 está en uso
    if check_port_in_use(5000):
        print("Puerto 5000 en uso. Buscando proceso...")
        
        # Intentar encontrar el proceso por puerto
        port_pid = find_process_by_port(5000)
        if port_pid:
            print(f"Proceso encontrado usando el puerto 5000: PID {port_pid}")
            if terminate_by_pid(port_pid):
                print("Aplicación terminada correctamente por PID.")
                return True
    
    # Intentar encontrar el proceso por nombre
    pid = find_flask_process()
    if pid:
        if terminate_by_pid(pid):
            print("Aplicación terminada correctamente por PID.")
            return True
    
    # Intentar terminar vía HTTP
    if terminate_by_http():
        # Esperar un poco para darle tiempo a que se cierre
        time.sleep(2)
        if not check_port_in_use(5000):
            print("Aplicación terminada correctamente vía HTTP.")
            return True
    
    # Última opción: intentar encontrar y matar todos los procesos python que se parezcan
    print("Buscando procesos de Python relacionados...")
    killed = False
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            if proc.info['name'].lower() == 'python' or proc.info['name'].lower() == 'python3':
                cmdline = proc.info['cmdline']
                if cmdline and ('app.py' in ' '.join(cmdline) or 'flask' in ' '.join(cmdline)):
                    print(f"Terminando proceso Python: PID {proc.info['pid']}")
                    terminate_by_pid(proc.info['pid'])
                    killed = True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    
    # Verificar si todavía está en uso el puerto
    if check_port_in_use(5000):
        print("⚠️ No se pudo terminar completamente la aplicación. El puerto 5000 sigue en uso.")
        return False
    else:
        print("✅ Aplicación terminada correctamente.")
        return True

if __name__ == "__main__":
    if main():
        print("Proceso de terminación completado con éxito.")
        sys.exit(0)
    else:
        print("No se pudo terminar la aplicación completamente.")
        sys.exit(1)