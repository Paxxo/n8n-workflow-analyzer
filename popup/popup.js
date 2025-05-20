// popup.js - Versión V2 completa con todas las funcionalidades

document.addEventListener('DOMContentLoaded', function() {
    // ----- ELEMENTOS DEL DOM -----
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const detectionStatus = document.getElementById('detection-status');
    const connectionStatus = document.getElementById('connection-status');
    
    // Elementos de configuración
    const providerSelect = document.getElementById('provider-select');
    const modelSelect = document.getElementById('model-select');
    const apiKeyInput = document.getElementById('api-key');
    const saveApiSettings = document.getElementById('save-api-settings');
    const toggleApiVisibility = document.getElementById('toggle-api-visibility');
    const customApiFields = document.querySelector('.custom-api-fields');
    const customApiUrl = document.getElementById('custom-api-url');
    
    // Elementos del chat
    const chatInput = document.getElementById('chat-input');
    const sendMessage = document.getElementById('send-message');
    const chatHistory = document.getElementById('chat-history');
    
    // Elementos de generación
    const workflowDescription = document.getElementById('workflow-description');
    const complexityLevel = document.getElementById('complexity-level');
    const workflowFocus = document.getElementById('workflow-focus');
    const generateWorkflowBtn = document.getElementById('generate-workflow-btn');
    
    // Elementos de análisis
    const analyzeCurrentBtn = document.getElementById('analyze-current-btn');
    const analysisResult = document.getElementById('analysis-result');
    const analysisContent = document.getElementById('analysis-content');
    const applySnippet = document.getElementById('apply-suggestions-btn');
    const copyAnalysis = document.getElementById('copy-analysis-btn');
    
    // Elementos de Docker/DB
    const dockerHost = document.getElementById('docker-host');
    const postgresConnection = document.getElementById('postgres-connection');
    const testConnectionBtn = document.getElementById('test-connection-btn');
    const customCommand = document.getElementById('custom-command');
    const runCommandBtn = document.getElementById('run-command-btn');
    const commandOutput = document.getElementById('command-output');
    const outputContent = document.getElementById('output-content');
    const commandButtons = document.querySelectorAll('.command-btn');
    
    // Elementos de preferencias
    const darkModeToggle = document.getElementById('dark-mode');
    const savePreferences = document.getElementById('save-preferences');
    const clearHistory = document.getElementById('clear-history');
    const exportData = document.getElementById('export-data');
    const autoDetect = document.getElementById('auto-detect');
    const autoSuggest = document.getElementById('auto-suggest');
    const chatHistoryToggle = document.getElementById('chat-history');
    
    // Carga
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');
    
    // ----- ESTADO DE LA APLICACIÓN -----
    let appState = {
      isN8nDetected: false,
      workflowData: null,
      chatMessages: [],
      apiSettings: {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: '',
        customUrl: ''
      },
      preferences: {
        autoDetect: true,
        autoSuggest: false,
        darkMode: false,
        chatHistory: true
      },
      dockerSettings: {
        dockerHost: 'http://localhost:2375',
        postgresConnection: ''
      },
      dockerConnected: false,
      postgresConnected: false
    };
    
    // ----- INICIALIZACIÓN -----
    
    // Cargar configuraciones guardadas
    loadSettings();
    
    // Inicializar UI según estado
    initializeUI();
    
    // Comprobar si estamos en una página de n8n
    detectN8nPage();
    
    // ----- EVENT LISTENERS -----
    
    // Listener para pestañas
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        button.classList.add('active');
        const tabId = `${button.dataset.tab}-tab`;
        document.getElementById(tabId).classList.add('active');
      });
    });
    
    // Listener para cambio de proveedor de API
    providerSelect.addEventListener('change', function() {
      const provider = this.value;
      appState.apiSettings.provider = provider;
      
      // Mostrar/ocultar campos para API personalizada
      if (provider === 'custom') {
        customApiFields.classList.remove('hidden');
      } else {
        customApiFields.classList.add('hidden');
      }
      
      // Filtrar modelos según el proveedor
      updateModelOptions(provider);
    });
    
    // Toggle para mostrar/ocultar API Key
    toggleApiVisibility.addEventListener('click', function() {
      const type = apiKeyInput.type === 'password' ? 'text' : 'password';
      apiKeyInput.type = type;
      
      const icon = toggleApiVisibility.querySelector('i');
      if (type === 'password') {
        icon.className = 'fas fa-eye';
      } else {
        icon.className = 'fas fa-eye-slash';
      }
    });
    
    // Guardar configuración de API
    saveApiSettings.addEventListener('click', function() {
      appState.apiSettings.apiKey = apiKeyInput.value;
      appState.apiSettings.model = modelSelect.value;
      
      if (providerSelect.value === 'custom') {
        appState.apiSettings.customUrl = customApiUrl.value;
      }
      
      saveSettings();
      showNotification('Configuración de API guardada correctamente');
    });
    
    // Enviar mensaje en el chat
    sendMessage.addEventListener('click', function() {
      sendChatMessage();
    });
    
    // Enviar mensaje con Enter (pero permitir nueva línea con Shift+Enter)
    chatInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    
    // Generar workflow
    generateWorkflowBtn.addEventListener('click', function() {
      const description = workflowDescription.value.trim();
      
      if (!description) {
        showNotification('Por favor, describe el workflow que deseas crear', 'error');
        return;
      }
      
      generateWorkflow(description, complexityLevel.value, workflowFocus.value);
    });
    
    // Analizar workflow actual
    analyzeCurrentBtn.addEventListener('click', function() {
      if (!appState.isN8nDetected) {
        showNotification('No se ha detectado un workflow de n8n en la página actual', 'error');
        return;
      }
      
      const options = {
        performance: document.getElementById('analyze-performance').checked,
        security: document.getElementById('analyze-security').checked,
        structure: document.getElementById('analyze-structure').checked,
        errors: document.getElementById('analyze-errors').checked
      };
      
      analyzeCurrentWorkflow(options);
    });
    
    // Aplicar sugerencias al workflow
    applySnippet.addEventListener('click', function() {
      applyWorkflowSuggestions();
    });
    
    // Copiar análisis
    copyAnalysis.addEventListener('click', function() {
      const analysisText = analysisContent.innerText;
      navigator.clipboard.writeText(analysisText)
        .then(() => {
          showNotification('Análisis copiado al portapapeles');
        })
        .catch(err => {
          console.error('Error al copiar: ', err);
          showNotification('Error al copiar el análisis', 'error');
        });
    });
    
    // Probar conexión a Docker y PostgreSQL
    testConnectionBtn.addEventListener('click', function() {
      testConnections();
    });
    
    // Ejecutar comando personalizado
    runCommandBtn.addEventListener('click', function() {
      const cmd = customCommand.value.trim();
      
      if (!cmd) {
        showNotification('Por favor, ingresa un comando para ejecutar', 'error');
        return;
      }
      
      executeCommand(cmd);
    });
    
    // Botones de comandos rápidos
    commandButtons.forEach(button => {
      button.addEventListener('click', function() {
        const command = this.dataset.command;
        executeQuickCommand(command);
      });
    });
    
    // Borrar historial
    clearHistory.addEventListener('click', function() {
      if (confirm('¿Estás seguro de que deseas borrar todo el historial de chat y análisis?')) {
        appState.chatMessages = [];
        localStorage.removeItem('n8nAssistantChatHistory');
        chatHistory.innerHTML = '';
        showNotification('Historial borrado correctamente');
      }
    });
    
    // Exportar datos
    exportData.addEventListener('click', function() {
      const data = {
        chatMessages: appState.chatMessages,
        apiSettings: { ...appState.apiSettings, apiKey: '***REMOVED***' }, // No exportar API key
        preferences: appState.preferences,
        dockerSettings: appState.dockerSettings
      };
      
      const dataStr = JSON.stringify(data, null, 2);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
      
      const exportLink = document.createElement('a');
      exportLink.setAttribute('href', dataUri);
      exportLink.setAttribute('download', 'n8n-ai-assistant-data.json');
      exportLink.click();
    });
    
    // Guardar preferencias
    savePreferences.addEventListener('click', function() {
      appState.preferences.autoDetect = autoDetect.checked;
      appState.preferences.autoSuggest = autoSuggest.checked;
      appState.preferences.darkMode = darkModeToggle.checked;
      appState.preferences.chatHistory = chatHistoryToggle.checked;
      
      saveSettings();
      applyPreferences();
      showNotification('Preferencias guardadas correctamente');
    });
    
    // Toggle modo oscuro
    darkModeToggle.addEventListener('change', function() {
      appState.preferences.darkMode = this.checked;
      applyDarkMode();
      saveSettings();
    });
    
    // ----- FUNCIONES PRINCIPALES -----
    
    // Detectar si estamos en una página de n8n
    function detectN8nPage() {
      if (!appState.preferences.autoDetect) return;
      
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "checkN8n"}, function(response) {
          if (response && response.isN8n) {
            appState.isN8nDetected = true;
            detectionStatus.textContent = "✅ Workflow de n8n detectado";
            detectionStatus.style.color = "var(--success-color)";
            
            // Extraer datos del workflow
            extractWorkflowData();
          } else {
            appState.isN8nDetected = false;
            detectionStatus.textContent = "❌ No se ha detectado un workflow de n8n";
            detectionStatus.style.color = "var(--danger-color)";
          }
        });
      });
    }
    
    // Extraer datos del workflow actual
    function extractWorkflowData() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "extractWorkflow"}, function(response) {
          if (response && response.workflow) {
            appState.workflowData = response.workflow;
            
            // Si está activada la sugerencia automática
            if (appState.preferences.autoSuggest) {
              analyzeCurrentWorkflow({
                performance: true,
                security: true,
                structure: true,
                errors: true
              });
            }
          }
        });
      });
    }
    
    // Enviar mensaje en el chat
    function sendChatMessage() {
      const message = chatInput.value.trim();
      
      if (!message) return;
      
      // Añadir mensaje del usuario al historial
      addChatMessage('user', message);
      
      // Limpiar input
      chatInput.value = '';
      
      // Mostrar indicador de carga
      showLoading('Pensando...');
      
      // Procesar el mensaje con la API seleccionada
      processMessage(message)
        .then(response => {
          // Añadir respuesta al historial
          addChatMessage('assistant', response);
          hideLoading();
        })
        .catch(error => {
          console.error('Error al procesar mensaje:', error);
          addChatMessage('assistant', `Error: ${error.message || 'No se pudo procesar tu mensaje'}`);
          hideLoading();
        });
    }
    
    // Añadir mensaje al historial de chat
    function addChatMessage(role, content) {
      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${role}`;
      messageDiv.textContent = content;
      
      chatHistory.appendChild(messageDiv);
      chatHistory.scrollTop = chatHistory.scrollHeight;
      
      // Guardar en el estado y localStorage si está habilitado
      appState.chatMessages.push({ role, content, timestamp: Date.now() });
      
      if (appState.preferences.chatHistory) {
        localStorage.setItem('n8nAssistantChatHistory', JSON.stringify(appState.chatMessages));
      }
    }
    
    // Generar workflow según descripción
    function generateWorkflow(description, complexity, focus) {
      showLoading('Generando workflow...');
      
      const systemPrompt = `Eres un experto en n8n, una plataforma de automatización low-code. 
      Tu tarea es generar un workflow completo de n8n basado en la descripción proporcionada.
      El nivel de complejidad solicitado es: ${complexity}.
      El enfoque principal debe ser: ${focus}.
      
      Genera un workflow válido en formato JSON que incluya:
      1. Todos los nodos necesarios con sus configuraciones
      2. Las conexiones apropiadas entre los nodos
      3. Manejo de errores adecuado
      
      El resultado debe ser un objeto JSON completo y válido que pueda importarse directamente en n8n.
      
      Estructura de un workflow básico de n8n:
      {
        "name": "Nombre del Workflow",
        "nodes": [
          {
            "id": "uuid-para-nodo-1",
            "name": "Nombre del Nodo",
            "type": "n8n-nodes-base.nombreDelNodo",
            "typeVersion": 1,
            "position": [x, y],
            "parameters": {
              // Parámetros específicos del nodo
            }
          }
        ],
        "connections": {
          "Nombre del Nodo": {
            "main": [
              [
                {
                  "node": "Nombre del Siguiente Nodo",
                  "type": "main",
                  "index": 0
                }
              ]
            ]
          }
        },
        "active": true,
        "settings": {},
        "id": "uuid-para-workflow"
      }`;
      
      const prompt = `Genera un workflow de n8n para: ${description}`;
      
      callAI(systemPrompt, prompt)
        .then(response => {
          // Buscar JSON en la respuesta
          const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                           response.match(/```\n([\s\S]*?)\n```/) ||
                           response.match(/{[\s\S]*"nodes"[\s\S]*"connections"[\s\S]*}/);
          
          let workflowJson = null;
          
          if (jsonMatch && jsonMatch[1]) {
            try {
              workflowJson = JSON.parse(jsonMatch[1]);
            } catch (e) {
              console.error('Error al parsear JSON:', e);
            }
          } else if (jsonMatch) {
            try {
              workflowJson = JSON.parse(jsonMatch[0]);
            } catch (e) {
              console.error('Error al parsear JSON completo:', e);
            }
          }
          
          if (workflowJson) {
            // Aplicar el workflow generado a n8n
            applyGeneratedWorkflow(workflowJson, response);
          } else {
            // Mostrar solo el texto si no se pudo extraer JSON
            showGenerationResult(response);
          }
          
          hideLoading();
        })
        .catch(error => {
          console.error('Error al generar workflow:', error);
          showNotification('Error al generar el workflow: ' + error.message, 'error');
          hideLoading();
        });
    }
    
    // Aplicar workflow generado a n8n
    function applyGeneratedWorkflow(workflowJson, fullResponse) {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "applyWorkflow",
          workflow: workflowJson
        }, function(response) {
          if (response && response.success) {
            showNotification('Workflow aplicado correctamente');
            showGenerationResult(fullResponse);
          } else {
            showNotification('No se pudo aplicar el workflow, pero se ha generado correctamente', 'warning');
            showGenerationResult(fullResponse);
          }
        });
      });
    }
    
    // Mostrar resultado de la generación
    function showGenerationResult(response) {
      // Cambiar a la pestaña de chat para mostrar el resultado
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      document.querySelector('[data-tab="chat"]').classList.add('active');
      document.getElementById('chat-tab').classList.add('active');
      
      // Añadir la respuesta al chat
      addChatMessage('assistant', response);
    }
    
    // Analizar workflow actual
    function analyzeCurrentWorkflow(options) {
      if (!appState.workflowData) {
        showNotification('No se ha podido extraer el workflow para analizar', 'error');
        return;
      }
      
      showLoading('Analizando workflow...');
      
      const systemPrompt = `Eres un experto en n8n, una plataforma de automatización low-code.
      Tu tarea es analizar minuciosamente el workflow proporcionado y ofrecer recomendaciones detalladas.
      
      En tu análisis, debes centrarte en:
      ${options.performance ? '- Rendimiento y optimización de recursos' : ''}
      ${options.security ? '- Seguridad y manejo de credenciales' : ''}
      ${options.structure ? '- Estructura y organización del workflow' : ''}
      ${options.errors ? '- Posibles errores o puntos de fallo' : ''}
      
      Proporciona recomendaciones específicas y, cuando sea posible, incluye snippets de código
      o configuraciones mejoradas que puedan aplicarse directamente.
      
      Estructura tu respuesta en las siguientes secciones:
      1. RESUMEN GENERAL: Descripción breve del workflow y su propósito
      2. ANÁLISIS POR ÁREAS:
         - Rendimiento (si aplica)
         - Seguridad (si aplica)
         - Estructura (si aplica)
         - Posibles errores (si aplica)
      3. RECOMENDACIONES CONCRETAS: Lista numerada de cambios sugeridos
      4. CÓDIGO DE MEJORAS: Snippets JSON de configuraciones mejoradas que podrían aplicarse
      
      El formato de tus recomendaciones debe ser específico y aplicable directamente.`;
      
      const prompt = `Analiza el siguiente workflow de n8n:
      
      \`\`\`json
      ${appState.workflowData}
      \`\`\``;
      
      callAI(systemPrompt, prompt)
        .then(response => {
          // Mostrar resultado del análisis
          analysisContent.innerHTML = formatResponse(response);
          analysisResult.classList.remove('hidden');
          
          hideLoading();
        })
        .catch(error => {
          console.error('Error al analizar workflow:', error);
          showNotification('Error al analizar el workflow: ' + error.message, 'error');
          hideLoading();
        });
    }
    
    // Aplicar sugerencias al workflow
    function applyWorkflowSuggestions() {
      showLoading('Aplicando sugerencias...');
      
      // Primero necesitamos generar cambios específicos basados en el análisis
      const analysisText = analysisContent.innerText;
      
      const systemPrompt = `Eres un experto en n8n, una plataforma de automatización low-code.
      Basándote en el análisis proporcionado, genera los cambios exactos que deben aplicarse al workflow
      en un formato que pueda ser interpretado programáticamente.
      
      El formato debe ser JSON con la siguiente estructura:
      {
        "changes": [
          {
            "type": "update_node", // o "add_node", "remove_node", "update_connection", etc.
            "nodeId": "id_del_nodo", // si aplica
            "data": { /* datos específicos del cambio */ }
          }
        ]
      }
      
      Debes analizar cuidadosamente el workflow original y el análisis para identificar:
      1. Los nodos que necesitan ser modificados
      2. Los cambios específicos que deben aplicarse a cada nodo
      3. Nuevos nodos o conexiones que deban añadirse
      4. Nodos o conexiones que deban eliminarse
      
      Asegúrate de que los cambios sean específicos, detallados y compatibles con la estructura de n8n.`;
      
      const prompt = `Basándote en este análisis:
      
      ${analysisText}
      
      Genera los cambios específicos que deben aplicarse al workflow original:
      
      \`\`\`json
      ${appState.workflowData}
      \`\`\``;
      
      callAI(systemPrompt, prompt)
        .then(response => {
          // Extraer JSON de cambios
          const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                           response.match(/```\n([\s\S]*?)\n```/) ||
                           response.match(/{[\s\S]*"changes"[\s\S]*}/);
          
          let changesJson = null;
          
          if (jsonMatch && jsonMatch[1]) {
            try {
              changesJson = JSON.parse(jsonMatch[1]);
            } catch (e) {
              console.error('Error al parsear JSON de cambios:', e);
            }
          } else if (jsonMatch) {
            try {
              changesJson = JSON.parse(jsonMatch[0]);
            } catch (e) {
              console.error('Error al parsear JSON completo de cambios:', e);
            }
          }
          
          if (changesJson && changesJson.changes) {
            // Aplicar los cambios al workflow
            applyChangesToWorkflow(changesJson.changes);
          } else {
            showNotification('No se pudieron extraer cambios específicos del análisis', 'warning');
          }
          
          hideLoading();
        })
        .catch(error => {
          console.error('Error al generar cambios:', error);
          showNotification('Error al generar cambios para el workflow: ' + error.message, 'error');
          hideLoading();
        });
    }
    
    // Aplicar cambios específicos al workflow
    function applyChangesToWorkflow(changes) {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "applyChanges",
          changes: changes,
          originalWorkflow: appState.workflowData
        }, function(response) {
          if (response && response.success) {
            showNotification('Cambios aplicados correctamente');
            
            // Actualizar los datos del workflow
            extractWorkflowData();
          } else {
            showNotification('No se pudieron aplicar todos los cambios: ' + (response ? response.error : 'Error desconocido'), 'warning');
          }
        });
      });
    }
    
    // Testear conexiones a Docker y PostgreSQL
    function testConnections() {
      showLoading('Probando conexiones...');
      
      // Guardar configuración
      appState.dockerSettings.dockerHost = dockerHost.value;
      appState.dockerSettings.postgresConnection = postgresConnection.value;
      saveSettings();
      
      // Probar conexión a Docker
      fetch(`${dockerHost.value}/version`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(response => response.json())
      .then(data => {
        appState.dockerConnected = true;
        connectionStatus.textContent = '✅ Docker conectado';
        connectionStatus.style.color = 'var(--success-color)';
        
        // Ahora probar PostgreSQL a través de un endpoint de la API
        return fetch('http://localhost:5000/test-postgres', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            connectionString: postgresConnection.value
          })
        });
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          appState.postgresConnected = true;
          showNotification('Conexiones establecidas correctamente');
        } else {
          appState.postgresConnected = false;
          showNotification('Conexión a Docker OK, pero fallo en PostgreSQL: ' + data.error, 'warning');
        }
        hideLoading();
      })
      .catch(error => {
        console.error('Error al conectar:', error);
        appState.dockerConnected = false;
        appState.postgresConnected = false;
        connectionStatus.textContent = '❌ Error de conexión';
        connectionStatus.style.color = 'var(--danger-color)';
        showNotification('Error al conectar: ' + error.message, 'error');
        hideLoading();
      });
    }
    
    // Ejecutar comando personalizado
    function executeCommand(command) {
      showLoading('Ejecutando comando...');
      
      // Primero, procesamos el comando con IA para convertirlo a operaciones específicas
      const systemPrompt = `Eres un asistente técnico especializado en Docker y PostgreSQL. 
      Tu tarea es interpretar comandos en lenguaje natural y convertirlos en operaciones técnicas específicas.
      
      Debes generar un objeto JSON con la siguiente estructura:
      {
        "operation": "docker_command" | "postgres_query" | "combined",
        "docker_command": "comando docker específico" (si aplica),
        "postgres_query": "consulta SQL específica" (si aplica),
        "description": "descripción de lo que hará esta operación"
      }
      
      Ejemplos:
      - Para "reiniciar el contenedor de n8n": { "operation": "docker_command", "docker_command": "docker restart n8n", "description": "Reiniciar el contenedor n8n" }
      - Para "muestra todas las tablas": { "operation": "postgres_query", "postgres_query": "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';", "description": "Listar todas las tablas en el esquema público" }
      - Para "elimina las filas duplicadas de la tabla usuarios": { "operation": "postgres_query", "postgres_query": "DELETE FROM usuarios WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY id) AS rnum FROM usuarios) t WHERE t.rnum > 1);", "description": "Eliminar filas duplicadas de la tabla usuarios" }`;
      
      const prompt = `Interpreta y convierte a operaciones específicas el siguiente comando: "${command}"`;
      
      callAI(systemPrompt, prompt)
        .then(response => {
          // Extraer JSON de la respuesta
          const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                           response.match(/```\n([\s\S]*?)\n```/) ||
                           response.match(/{[\s\S]*"operation"[\s\S]*}/);
          
          let operationJson = null;
          
          if (jsonMatch && jsonMatch[1]) {
            try {
              operationJson = JSON.parse(jsonMatch[1]);
            } catch (e) {
              console.error('Error al parsear JSON de operación:', e);
            }
          } else if (jsonMatch) {
            try {
              operationJson = JSON.parse(jsonMatch[0]);
            } catch (e) {
              console.error('Error al parsear JSON completo de operación:', e);
            }
          }
          
          if (operationJson && operationJson.operation) {
            // Ejecutar la operación específica
            executeSpecificOperation(operationJson);
          } else {
            showNotification('No se pudo interpretar el comando correctamente', 'warning');
            hideLoading();
          }
        })
        .catch(error => {
          console.error('Error al interpretar comando:', error);
          showNotification('Error al interpretar el comando: ' + error.message, 'error');
          hideLoading();
        });
    }
    
    // Ejecutar operación específica (Docker o PostgreSQL)
    function executeSpecificOperation(operation) {
      // Mostrar la descripción de lo que se va a hacer
      outputContent.textContent = `Operación: ${operation.description || 'Sin descripción'}\n\nEjecutando...`;
      commandOutput.classList.remove('hidden');
      
      // Punto final de la API para ejecutar comandos
      const apiEndpoint = 'http://localhost:5000/execute';
      
      fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          operation: operation.operation,
          docker_command: operation.docker_command,
          postgres_query: operation.postgres_query,
          docker_host: appState.dockerSettings.dockerHost,
          postgres_connection: appState.dockerSettings.postgresConnection
        })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          outputContent.textContent = `Operación: ${operation.description || 'Sin descripción'}\n\nResultado:\n${data.result}`;
        } else {
          outputContent.textContent = `Operación: ${operation.description || 'Sin descripción'}\n\nError: ${data.error}`;
        }
        hideLoading();
      })
      .catch(error => {
        console.error('Error al ejecutar operación:', error);
        outputContent.textContent = `Operación: ${operation.description || 'Sin descripción'}\n\nError: ${error.message}`;
        hideLoading();
      });
    }
    
    // Ejecutar comando rápido predefinido
    function executeQuickCommand(command) {
      showLoading('Ejecutando comando rápido...');
      
      let operation = {};
      
      switch (command) {
        case 'docker-status':
          operation = {
            operation: "docker_command",
            docker_command: "docker ps",
            description: "Listar todos los contenedores en ejecución"
          };
          break;
        case 'restart-n8n':
          operation = {
            operation: "docker_command",
            docker_command: "docker restart n8n",
            description: "Reiniciar el contenedor de n8n"
          };
          break;
        case 'db-status':
          operation = {
            operation: "postgres_query",
            postgres_query: "SELECT datname as database, pg_size_pretty(pg_database_size(datname)) as size FROM pg_database;",
            description: "Mostrar tamaño de bases de datos PostgreSQL"
          };
          break;
        case 'logs-n8n':
          operation = {
            operation: "docker_command",
            docker_command: "docker logs --tail 100 n8n",
            description: "Mostrar últimas 100 líneas de logs de n8n"
          };
          break;
        default:
          showNotification('Comando no reconocido', 'error');
          hideLoading();
          return;
      }
      
      executeSpecificOperation(operation);
    }
    
    // Procesar mensaje con la API de IA
    async function processMessage(message) {
      // Si el mensaje parece relacionado con Docker o DB, usamos un prompt específico
      const isDockerOrDBRelated = message.toLowerCase().includes('docker') || 
                                 message.toLowerCase().includes('postgres') || 
                                 message.toLowerCase().includes('base de datos') || 
                                 message.toLowerCase().includes('contenedor');
      
      // Si el mensaje parece una solicitud de generación de workflow/nodos
      const isWorkflowGeneration = message.toLowerCase().includes('crea un workflow') || 
                                message.toLowerCase().includes('genera un workflow') ||
                                message.toLowerCase().includes('crear nodo') ||
                                message.toLowerCase().includes('generar nodo') ||
                                message.toLowerCase().includes('hacer un workflow');
      
      let systemPrompt = "";
      
      if (isWorkflowGeneration) {
        systemPrompt = `Eres un experto en n8n, una plataforma de automatización low-code.
        Tu tarea es crear workflows completos o nodos individuales basados en las descripciones proporcionadas.
        
        Para nodos individuales, proporciona el bloque JSON completo y correctamente formateado.
        Para workflows completos, genera un objeto JSON válido que incluya todos los nodos y conexiones necesarios.
        
        Estructura de un nodo típico de n8n:
        {
          "id": "uuid-para-nodo",
          "name": "Nombre descriptivo",
          "type": "n8n-nodes-base.nombreDelTipoDeNodo",
          "typeVersion": 1,
          "position": [x, y],
          "parameters": {
            // Parámetros específicos del nodo
          }
        }
        
        Estructura de conexiones entre nodos:
        "connections": {
          "Nombre del Nodo Origen": {
            "main": [
              [
                {
                  "node": "Nombre del Nodo Destino",
                  "type": "main",
                  "index": 0
                }
              ]
            ]
          }
        }
        
        Proporciona siempre el código JSON completo y listo para usar.`;
      } else if (isDockerOrDBRelated) {
        systemPrompt = `Eres un asistente técnico especializado en n8n, Docker y PostgreSQL.
        n8n es una plataforma de automatización low-code que permite crear workflows visuales.
        Proporciona información detallada y útil sobre Docker, PostgreSQL y su integración con n8n.
        
        Si el usuario está intentando realizar operaciones específicas en Docker o PostgreSQL, incluye
        comandos específicos que pueda ejecutar, preferiblemente usando la pestaña "Docker/DB" de esta extensión.
        
        Ejemplos de operaciones comunes con Docker:
        - Reiniciar un contenedor: "docker restart nombre_contenedor"
        - Ver logs: "docker logs --tail 100 nombre_contenedor"
        - Listar contenedores: "docker ps -a"
        
        Ejemplos de operaciones comunes con PostgreSQL:
        - Listar tablas: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
        - Ver esquema de tabla: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'nombre_tabla';"
        - Analizar rendimiento: "EXPLAIN ANALYZE SELECT * FROM tabla WHERE condicion;"`;
      } else {
        systemPrompt = `Eres un asistente experto en n8n, una plataforma de automatización low-code.
        Tu especialidad es ayudar a los usuarios a crear, entender y optimizar workflows en n8n.
        Proporciona respuestas detalladas, ejemplos y buenas prácticas para trabajar con n8n.
        
        Recuerda que el usuario tiene acceso a varias funcionalidades en esta extensión:
        1. Generación de workflows y nodos completos
        2. Análisis y optimización de workflows existentes
        3. Gestión de Docker y bases de datos PostgreSQL
        
        Ofrece soluciones prácticas y, cuando sea posible, sugiere acciones específicas que el
        usuario pueda realizar con la extensión para resolver su problema.
        
        Si el usuario está buscando crear un nuevo workflow o nodo, sugiérele que use la pestaña
        "Generar" para obtener mejores resultados.`;
      }
      
      // Incluir contexto de mensajes previos (últimos 5 mensajes)
      const recentMessages = appState.chatMessages.slice(-5).map(msg => {
        return {
          role: msg.role,
          content: msg.content
        };
      });
      
      return callAI(systemPrompt, message, recentMessages);
    }
    
    // Llamada a la API de IA (abstracción para diferentes proveedores)
    async function callAI(systemPrompt, userPrompt, chatHistory = []) {
      const provider = appState.apiSettings.provider;
      const model = appState.apiSettings.model;
      const apiKey = appState.apiSettings.apiKey;
      
      if (!apiKey) {
        throw new Error('No se ha configurado una API key. Por favor, configura la API en la pestaña de configuración.');
      }
      
      // Construir mensajes según historial y prompts actuales
      let messages = [];
      
      // Añadir mensaje del sistema
      messages.push({ role: "system", content: systemPrompt });
      
      // Añadir historial de chat si existe
      if (chatHistory && chatHistory.length > 0) {
        messages = [...messages, ...chatHistory];
      }
      
      // Añadir mensaje del usuario actual
      messages.push({ role: "user", content: userPrompt });
      
      // Llamar a la API según el proveedor
      switch (provider) {
        case 'openai':
          return callOpenAI(model, messages, apiKey);
        case 'anthropic':
          return callAnthropic(model, messages, apiKey);
        case 'openrouter':
          return callOpenRouter(model, messages, apiKey);
        case 'custom':
          return callCustomAPI(model, messages, apiKey);
        default:
          throw new Error('Proveedor de API no soportado');
      }
    }
    
    // Llamada a la API de OpenAI
    async function callOpenAI(model, messages, apiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.7,
            max_tokens: 4000
          })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error?.message || 'Error en la API de OpenAI');
        }
        
        return data.choices[0].message.content;
      } catch (error) {
        console.error('Error en OpenAI:', error);
        throw error;
      }
    }
    
    // Llamada a la API de Anthropic (Claude)
    async function callAnthropic(model, messages, apiKey) {
      try {
        // Convertir formato de mensajes de ChatGPT a Claude
        const systemMessage = messages.find(msg => msg.role === 'system');
        const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
        
        // Claude no tiene concepto de mensaje de sistema, así que lo añadimos como contenido del primer mensaje
        let claudeMessages = nonSystemMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        }));
        
        // Si hay un mensaje de sistema, lo agregamos al principio del primer mensaje de usuario
        if (systemMessage && claudeMessages.length > 0) {
          // Encontrar el primer mensaje de usuario
          const firstUserMsgIndex = claudeMessages.findIndex(msg => msg.role === 'user');
          
          if (firstUserMsgIndex !== -1) {
            claudeMessages[firstUserMsgIndex].content = `${systemMessage.content}\n\n${claudeMessages[firstUserMsgIndex].content}`;
          } else {
            // Si no hay mensajes de usuario, añadimos uno con el contenido del sistema
            claudeMessages.unshift({
              role: 'user',
              content: systemMessage.content
            });
          }
        }
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model,
            messages: claudeMessages,
            max_tokens: 4000
          })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error?.message || 'Error en la API de Anthropic');
        }
        
        return data.content[0].text;
      } catch (error) {
        console.error('Error en Anthropic:', error);
        throw error;
      }
    }
    
    // Llamada a la API de OpenRouter
    async function callOpenRouter(model, messages, apiKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': window.location.href,
            'X-Title': 'n8n AI Assistant Pro'
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.7,
            max_tokens: 4000
          })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error?.message || 'Error en la API de OpenRouter');
        }
        
        return data.choices[0].message.content;
      } catch (error) {
        console.error('Error en OpenRouter:', error);
        throw error;
      }
    }
    
    // Llamada a una API personalizada
    async function callCustomAPI(model, messages, apiKey) {
      try {
        const customUrl = appState.apiSettings.customUrl;
        
        if (!customUrl) {
          throw new Error('No se ha configurado una URL para la API personalizada');
        }
        
        const response = await fetch(customUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.7,
            max_tokens: 4000
          })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error?.message || 'Error en la API personalizada');
        }
        
        // Intentar extraer el contenido según diferentes formatos
        return data.choices?.[0]?.message?.content || 
               data.content?.[0]?.text ||
               data.response ||
               data.result ||
               JSON.stringify(data);
      } catch (error) {
        console.error('Error en API personalizada:', error);
        throw error;
      }
    }
    
    // ----- FUNCIONES AUXILIARES -----
    
    // Formatear respuesta con Markdown
    function formatResponse(response) {
      return response
        .replace(/\n\n/g, '<br><br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^#{3}\s*(.*?)$/gm, '<h3>$1</h3>')
        .replace(/^#{2}\s*(.*?)$/gm, '<h2>$1</h2>')
        .replace(/^#{1}\s*(.*?)$/gm, '<h1>$1</h1>');
    }
    
    // Mostrar notificación
    function showNotification(message, type = 'success') {
      const notification = document.createElement('div');
      notification.className = `notification ${type}`;
      notification.textContent = message;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.classList.add('show');
      }, 10);
      
      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
          notification.remove();
        }, 300);
      }, 3000);
    }
    
    // Mostrar overlay de carga
    function showLoading(message = 'Procesando...') {
      loadingMessage.textContent = message;
      loadingOverlay.classList.remove('hidden');
    }
    
    // Ocultar overlay de carga
    function hideLoading() {
      loadingOverlay.classList.add('hidden');
    }
    
    // Cargar configuraciones guardadas
    function loadSettings() {
      try {
        // Cargar API settings
        const savedApiSettings = localStorage.getItem('n8nAssistantApiSettings');
        if (savedApiSettings) {
          appState.apiSettings = { ...appState.apiSettings, ...JSON.parse(savedApiSettings) };
        }
        
        // Cargar preferencias
        const savedPreferences = localStorage.getItem('n8nAssistantPreferences');
        if (savedPreferences) {
          appState.preferences = { ...appState.preferences, ...JSON.parse(savedPreferences) };
        }
        
        // Cargar configuración de Docker
        const savedDockerSettings = localStorage.getItem('n8nAssistantDockerSettings');
        if (savedDockerSettings) {
          appState.dockerSettings = { ...appState.dockerSettings, ...JSON.parse(savedDockerSettings) };
        }
        
        // Cargar historial de chat
        if (appState.preferences.chatHistory) {
          const savedChatHistory = localStorage.getItem('n8nAssistantChatHistory');
          if (savedChatHistory) {
            appState.chatMessages = JSON.parse(savedChatHistory);
          }
        }
      } catch (error) {
        console.error('Error al cargar configuraciones:', error);
        // Si hay error, usamos los valores por defecto
      }
    }
    
    // Guardar configuraciones
    function saveSettings() {
      try {
        // API settings
        localStorage.setItem('n8nAssistantApiSettings', JSON.stringify(appState.apiSettings));
        
        // Preferencias
        localStorage.setItem('n8nAssistantPreferences', JSON.stringify(appState.preferences));
        
        // Docker settings
        localStorage.setItem('n8nAssistantDockerSettings', JSON.stringify(appState.dockerSettings));
        
        // El historial de chat se guarda al añadir mensajes si está habilitado
      } catch (error) {
        console.error('Error al guardar configuraciones:', error);
      }
    }
    
    // Inicializar UI según estado
    function initializeUI() {
      // Aplicar modo oscuro si está habilitado
      if (appState.preferences.darkMode) {
        applyDarkMode();
      }
      
      // Establecer valores en los inputs según configuración guardada
      if (appState.apiSettings.provider) {
        providerSelect.value = appState.apiSettings.provider;
        updateModelOptions(appState.apiSettings.provider);
      }
      
      if (appState.apiSettings.model) {
        modelSelect.value = appState.apiSettings.model;
      }
      
      if (appState.apiSettings.apiKey) {
        apiKeyInput.value = appState.apiSettings.apiKey;
      }
      
      if (appState.apiSettings.customUrl) {
        customApiUrl.value = appState.apiSettings.customUrl;
      }
      
      // Mostrar/ocultar campos para API personalizada
      if (appState.apiSettings.provider === 'custom') {
        customApiFields.classList.remove('hidden');
      } else {
        customApiFields.classList.add('hidden');
      }
      
      // Establecer valores para Docker/PostgreSQL
      dockerHost.value = appState.dockerSettings.dockerHost;
      postgresConnection.value = appState.dockerSettings.postgresConnection;
      
      // Establecer preferencias
      autoDetect.checked = appState.preferences.autoDetect;
      autoSuggest.checked = appState.preferences.autoSuggest;
      darkModeToggle.checked = appState.preferences.darkMode;
      chatHistoryToggle.checked = appState.preferences.chatHistory;
      
      // Cargar historial de chat
      if (appState.chatMessages && appState.chatMessages.length > 0) {
        chatHistory.innerHTML = '';
        appState.chatMessages.forEach(msg => {
          const messageDiv = document.createElement('div');
          messageDiv.className = `message ${msg.role}`;
          messageDiv.textContent = msg.content;
          chatHistory.appendChild(messageDiv);
        });
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }
    }
    
    // Aplicar modo oscuro
    function applyDarkMode() {
      if (appState.preferences.darkMode) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    }
    
    // Aplicar preferencias
    function applyPreferences() {
      applyDarkMode();
      
      // Si se deshabilitó el historial de chat, preguntar si quiere borrar el existente
      if (!appState.preferences.chatHistory && appState.chatMessages.length > 0) {
        if (confirm('¿Deseas borrar el historial de chat existente?')) {
          appState.chatMessages = [];
          localStorage.removeItem('n8nAssistantChatHistory');
          chatHistory.innerHTML = '';
        }
      }
    }
    
    // Actualizar opciones de modelos según el proveedor
    function updateModelOptions(provider) {
      // Mostrar solo los modelos del proveedor seleccionado
      Array.from(modelSelect.options).forEach(option => {
        if (option.dataset.provider === provider || provider === 'custom') {
          option.style.display = '';
        } else {
          option.style.display = 'none';
        }
      });
      
      // Seleccionar el primer modelo disponible
      const availableOptions = Array.from(modelSelect.options).filter(
        option => option.style.display !== 'none'
      );
      
      if (availableOptions.length > 0) {
        modelSelect.value = availableOptions[0].value;
      }
    }
  });