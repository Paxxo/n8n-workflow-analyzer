#!/bin/bash
# Script para terminar el servidor Flask de n8n AI Assistant Pro

echo "Terminando el servidor Flask de n8n AI Assistant Pro..."

# Determinar si estamos ejecutando en Docker o directamente
if [ -f /.dockerenv ] || grep -q docker /proc/1/cgroup; then
    echo "Detectado entorno Docker"
    
    # Si estamos dentro de Docker, usar docker-compose para detener
    if [ -f "/app/docker-compose.yml" ]; then
        echo "Deteniendo con docker-compose..."
        cd /app && docker-compose down
    else
        # Detener directamente el contenedor
        echo "Intentando terminar el proceso Flask..."
        pkill -f "python app.py" || true
    fi
else
    echo "Ejecutando en entorno nativo"
    
    # Intentar ejecutar el script de terminación en Python
    if [ -f "backend/terminate_app.py" ]; then
        echo "Ejecutando script de terminación..."
        python backend/terminate_app.py
    else
        # Buscar y terminar el proceso Flask
        PID=$(ps aux | grep "[p]ython.*app.py" | awk '{print $2}')
        
        if [ -n "$PID" ]; then
            echo "Terminando proceso Flask con PID $PID"
            kill -15 $PID
            
            # Esperar a que termine
            COUNTER=0
            while kill -0 $PID 2>/dev/null; do
                echo "Esperando a que el proceso termine..."
                sleep 1
                COUNTER=$((COUNTER + 1))
                
                # Si tarda demasiado, usar SIGKILL
                if [ $COUNTER -gt 5 ]; then
                    echo "Forzando terminación..."
                    kill -9 $PID 2>/dev/null || true
                    break
                fi
            done
            
            echo "Proceso terminado."
        else
            echo "No se encontró un proceso Flask en ejecución."
        fi
    fi
fi

# Verificar si el puerto 5000 sigue en uso
if netstat -tuln | grep -q ":5000 "; then
    echo "ADVERTENCIA: El puerto 5000 sigue en uso. Es posible que el servidor no se haya detenido correctamente."
    
    # Intentar encontrar qué proceso está usando el puerto
    if command -v lsof >/dev/null 2>&1; then
        echo "Proceso usando el puerto 5000:"
        lsof -i :5000
    fi
else
    echo "✓ Confirmado: El puerto 5000 está libre. El servidor se ha detenido correctamente."
fi

echo "Terminación completada."