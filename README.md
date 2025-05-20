# n8n AI Assistant Pro

Una extensión de Chrome para potenciar tu experiencia con n8n, utilizando inteligencia artificial para generar, analizar y optimizar workflows, así como gestionar tu entorno Docker y bases de datos PostgreSQL.

![Banner de n8n AI Assistant Pro](./images/banner.png)

## Características principales

- 🤖 **Generación de workflows completos**: Describe lo que necesitas en lenguaje natural y obtén workflows multi-nodo listos para usar.
- 🔍 **Análisis inteligente**: Analiza workflows existentes para detectar problemas de rendimiento, seguridad y estructura.
- 🛠️ **Optimización automática**: Aplica sugerencias de mejora con un solo clic, sin necesidad de editar manualmente.
- 💬 **Chat conversacional**: Consulta cualquier duda sobre n8n con un asistente interactivo contextual.
- 🐳 **Gestión de Docker y PostgreSQL**: Controla contenedores y bases de datos con comandos en lenguaje natural.
- 🔄 **Integración con múltiples APIs**: Compatible con OpenAI, Claude, OpenRouter y APIs personalizadas.
- 🔒 **Privacidad y seguridad**: Tus API keys y datos se almacenan solo localmente en tu navegador.

## Requisitos

- Google Chrome versión 88 o superior
- n8n versión 0.214 o superior (cloud o self-hosted)
- API key para alguno de los servicios de IA compatibles (OpenAI, Claude, etc.)
- (Opcional) Instalación local de Docker y PostgreSQL para gestión avanzada

## Instalación

### Desde el repositorio (para desarrollo)

1. Clona este repositorio:
   ```bash
   git clone https://github.com/tu-usuario/n8n-ai-assistant-pro.git
   cd n8n-ai-assistant-pro
   ```

2. Abre Chrome y navega a `chrome://extensions/`

3. Activa el "Modo desarrollador" en la esquina superior derecha

4. Haz clic en "Cargar descomprimida" y selecciona la carpeta del repositorio

5. La extensión ahora debería aparecer en tu barra de herramientas de Chrome

### Configuración del backend para Docker y PostgreSQL (opcional)

Si deseas utilizar las funcionalidades de gestión de Docker y PostgreSQL, necesitarás configurar y ejecutar el backend de la API:

1. Navega a la carpeta `backend`:
   ```bash
   cd backend
   ```

2. Instala las dependencias:
   ```bash
   pip install -r requirements.txt
   ```

3. Configura las variables de entorno (crea un archivo `.env`):
   ```
   DEFAULT_POSTGRES_CONNECTION=postgresql://usuario:contraseña@localhost:5432/n8n
   ```

4. Ejecuta el servidor:
   ```bash
   python app.py
   ```

Alternativamente, puedes usar Docker Compose para ejecutar el backend:

```bash
docker-compose up -d
```

## Uso

### Configuración inicial

1. Haz clic en el icono de la extensión en tu barra de herramientas de Chrome
2. Ve a la pestaña "Config"
3. Selecciona tu proveedor de IA preferido (OpenAI, Claude, etc.)
4. Introduce tu API key y guarda la configuración

### Generación de workflows

1. Ve a la pestaña "Generar"
2. Describe el workflow que deseas crear en lenguaje natural
3. Selecciona el nivel de complejidad deseado
4. Haz clic en "Generar Workflow"
5. Revisa el resultado y haz clic en "Aplicar" para implementarlo en n8n

### Análisis y optimización

1. Abre un workflow existente en n8n
2. Ve a la pestaña "Analizar"
3. Haz clic en "Analizar Workflow Actual"
4. Revisa las sugerencias de mejora
5. Haz clic en "Aplicar Sugerencias" para implementar las mejoras automáticamente

### Gestión de Docker y PostgreSQL

1. Ve a la pestaña "Docker/DB"
2. Configura tus conexiones a Docker y PostgreSQL
3. Utiliza los comandos rápidos predefinidos o escribe tus propios comandos en lenguaje natural
4. Visualiza los resultados directamente en la extensión

### Chat interactivo

1. Ve a la pestaña "Chat"
2. Escribe tus preguntas o instrucciones en lenguaje natural
3. El asistente te responderá con información relevante y específica para n8n

## Ejemplos de uso

### Generación de workflow

**Prompt**: "Crea un workflow que escuche un webhook, extraiga datos de una tabla de PostgreSQL según el ID recibido, y envíe los resultados por correo electrónico."

### Análisis y optimización

La extensión puede identificar y sugerir mejoras como:
- Optimización de consultas SQL en nodos PostgreSQL
- Manejo adecuado de errores y retries
- Mejoras en la estructura del workflow
- Configuraciones de seguridad recomendadas

### Comandos de Docker/PostgreSQL

- "Reinicia el contenedor de n8n"
- "Muestra todas las tablas en la base de datos"
- "Muestra los logs de error de PostgreSQL"
- "¿Cuánto espacio ocupa cada base de datos?"

## Arquitectura

El proyecto consta de dos componentes principales:

1. **Extensión de Chrome**:
   - Interfaz de usuario para interactuar con n8n
   - Integración con APIs de IA para generación y análisis
   - Scripts para manipular el DOM y workflows de n8n

2. **Backend API** (opcional):
   - Servidor Flask para ejecutar comandos Docker
   - Gestión de consultas PostgreSQL
   - Procesamiento de comandos en lenguaje natural

## Contribuciones

Las contribuciones son bienvenidas. Para contribuir:

1. Haz un fork del repositorio
2. Crea una rama para tu nueva funcionalidad (`git checkout -b feature/amazing-feature`)
3. Realiza tus cambios
4. Haz commit de tus cambios (`git commit -m 'Add some amazing feature'`)
5. Push a la rama (`git push origin feature/amazing-feature`)
6. Abre un Pull Request

## Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## Créditos

- [n8n](https://n8n.io/) - La plataforma de automatización en la que se basa esta extensión
- Iconos por [FontAwesome](https://fontawesome.com/)
- Desarrollado con ❤️ para la comunidad de n8n

## Descargo de responsabilidad

Esta extensión no está afiliada oficialmente con n8n GmbH. Utilízala bajo tu propia responsabilidad. Asegúrate de seguir los términos de servicio de los proveedores de IA que utilices con esta extensión.
