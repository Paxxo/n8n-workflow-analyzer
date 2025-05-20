/**
 * background.js - Script en segundo plano de la extensión n8n AI Assistant Pro
 * 
 * Este script se ejecuta en el contexto del navegador y gestiona:
 * - Comunicación entre popup.js y content.js
 * - Ejecución de comandos en Docker y PostgreSQL
 * - Actualización de datos de workflow
 * - Inyección de scripts en páginas web
 * - Instalación y actualización de la extensión
 */

// Variables globales
let currentTabId = null;
let currentWorkflow = null;
let lastApiCall = null;
let isProcessingCommand = false;

// ----- LISTENERS DE MENSAJES -----

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log("Mensaje recibido en background.js:", request);
  
  // Actualización de workflow desde content.js
  if (request.action === "workflowUpdated") {
    // Almacenar el workflow actualizado para acceso rápido
    chrome.storage.local.set({ 'currentWorkflow': request.workflow });
    currentWorkflow = request.workflow;
    
    // Registrar la acción para analytics
    trackUserAction('workflow_update', {
      size: request.workflow.length,
      significant: request.significant
    });
    
    // Si hay cambios importantes, notificar al usuario
    if (request.significant) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: 'Workflow actualizado',
        message: 'Se han detectado cambios importantes en tu workflow',
        priority: 1
      });
    }
    
    // Propagar el evento al popup si está abierto
    chrome.runtime.sendMessage({
      action: "workflowDataUpdated",
      workflow: request.workflow
    }).catch(() => {
      // Ignorar errores si el popup no está abierto
    });
  }
  
  // Ejecución de comandos Docker o PostgreSQL
  else if (request.action === "executeCommand") {
    if (isProcessingCommand) {
      sendResponse({ success: false, error: "Ya hay un comando en ejecución. Por favor, espera a que termine." });
      return true;
    }
    
    isProcessingCommand = true;
    
    executeBackendCommand(request.command, request.type, request.parameters)
      .then(result => {
        isProcessingCommand = false;
        sendResponse(result);
      })
      .catch(error => {
        isProcessingCommand = false;
        sendResponse({ success: false, error: error.message });
      });
    
    // Necesario para mantener abierta la conexión para respuesta asíncrona
    return true;
  }
  
  // Inyección de scripts en la página activa
  else if (request.action === "injectScript") {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0]) {
        sendResponse({ success: false, error: "No se encontró una pestaña activa" });
        return;
      }
      
      const tabId = tabs[0].id;
      
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: [request.scriptFile]
      })
      .then(() => {
        trackUserAction('script_injected', { script: request.scriptFile });
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error al inyectar script:', error);
        sendResponse({ 
          success: false, 
          error: error.message,
          details: {
            scriptFile: request.scriptFile,
            tabId: tabId,
            tabUrl: tabs[0].url
          }
        });
      });
    });
    
    // Necesario para mantener abierta la conexión para respuesta asíncrona
    return true;
  }
  
  // Aplicación de workflow generado por IA
  else if (request.action === "applyGeneratedWorkflow") {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0]) {
        sendResponse({ success: false, error: "No se encontró una pestaña activa" });
        return;
      }
      
      const tabId = tabs[0].id;
      
      // Primero inyectar el script inject.js si no está inyectado
      injectRequiredScripts(tabId)
        .then(() => {
          // Luego ejecutar el método para aplicar el workflow
          return chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: applyWorkflowInPage,
            args: [request.workflow]
          });
        })
        .then(results => {
          if (results && results[0] && results[0].result) {
            trackUserAction('workflow_applied', { 
              size: JSON.stringify(request.workflow).length,
              nodes: request.workflow.nodes ? request.workflow.nodes.length : 'unknown'
            });
            sendResponse(results[0].result);
          } else {
            sendResponse({ success: false, error: 'No se recibió respuesta al aplicar el workflow' });
          }
        })
        .catch(error => {
          console.error('Error al aplicar workflow:', error);
          sendResponse({ success: false, error: error.message });
        });
    });
    
    // Necesario para mantener abierta la conexión para respuesta asíncrona
    return true;
  }
  
  // Aplicación de cambios a un workflow
  else if (request.action === "applyWorkflowChanges") {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0]) {
        sendResponse({ success: false, error: "No se encontró una pestaña activa" });
        return;
      }
      
      const tabId = tabs[0].id;
      
      // Primero inyectar el script inject.js si no está inyectado
      injectRequiredScripts(tabId)
        .then(() => {
          // Luego ejecutar el método para aplicar los cambios
          return chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: applyChangesInPage,
            args: [request.changes, request.originalWorkflow]
          });
        })
        .then(results => {
          if (results && results[0] && results[0].result) {
            trackUserAction('changes_applied', { 
              changes: request.changes.length || 1
            });
            sendResponse(results[0].result);
          } else {
            sendResponse({ success: false, error: 'No se recibió respuesta al aplicar los cambios' });
          }
        })
        .catch(error => {
          console.error('Error al aplicar cambios:', error);
          sendResponse({ success: false, error: error.message });
        });
    });
    
    // Necesario para mantener abierta la conexión para respuesta asíncrona
    return true;
  }
  
  // Solicitud de extracción de workflow desde popup.js
  else if (request.action === "requestWorkflowData") {
    if (currentWorkflow) {
      sendResponse({ success: true, workflow: currentWorkflow });
    } else {
      chrome.storage.local.get(['currentWorkflow'], function(data) {
        if (data.currentWorkflow) {
          sendResponse({ success: true, workflow: data.currentWorkflow });
        } else {
          // Si no hay workflow guardado, intentar extraer de la pestaña activa
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (!tabs || !tabs[0]) {
              sendResponse({ success: false, error: "No se encontró una pestaña activa ni datos de workflow guardados" });
              return;
            }
            
            chrome.tabs.sendMessage(tabs[0].id, { action: "extractWorkflow" })
              .then(response => {
                if (response && response.workflow) {
                  chrome.storage.local.set({ 'currentWorkflow': response.workflow });
                  currentWorkflow = response.workflow;
                  sendResponse({ success: true, workflow: response.workflow });
                } else {
                  sendResponse({ success: false, error: "No se pudo extraer el workflow" });
                }
              })
              .catch(error => {
                sendResponse({ success: false, error: error.message || "Error al comunicarse con la pestaña" });
              });
          });
        }
      });
    }
    
    // Necesario para mantener abierta la conexión para respuesta asíncrona
    return true;
  }
  
  // Manejo de atajos de teclado
  else if (request.action === "shortcutTriggered") {
    // Reenviar al popup si está abierto
    chrome.runtime.sendMessage({
      action: "shortcutTriggered",
      command: request.command
    }).catch(() => {
      // Si el popup no está abierto, abrirlo
      chrome.action.openPopup().then(() => {
        // Esperar a que el popup esté listo y luego enviar el mensaje
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: "shortcutTriggered",
            command: request.command
          });
        }, 200);
      });
    });
  }
  
  // Llamadas a APIs de IA desde el popup para evitar restricciones CORS
  else if (request.action === "callAIApi") {
    callAIService(request.provider, request.endpoint, request.data, request.apiKey)
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    // Necesario para mantener abierta la conexión para respuesta asíncrona
    return true;
  }
});

// ----- FUNCIONES PRINCIPALES -----

/**
 * Ejecuta comandos a través del backend
 * @param {string} command - Comando a ejecutar
 * @param {string} type - Tipo de comando (docker_command, postgres_query, etc.)
 * @param {Object} parameters - Parámetros adicionales para el comando
 * @returns {Promise<Object>} - Resultado de la ejecución
 */
async function executeBackendCommand(command, type, parameters = {}) {
  try {
    // Obtener configuración
    const settings = await chrome.storage.local.get(['dockerSettings']);
    const dockerHost = settings.dockerSettings?.dockerHost || 'http://localhost:5000';
    const postgresConnection = settings.dockerSettings?.postgresConnection || '';
    
    // Endpoint del backend
    const endpoint = `${dockerHost}/execute`;
    
    // Preparar los datos según el tipo de comando
    let requestData = {
      command: command,
      operation: type || 'generic',
      postgres_connection: postgresConnection,
      ...parameters
    };
    
    // Registrar el inicio de la llamada para analytics
    lastApiCall = {
      type: 'backend',
      command: command,
      timestamp: Date.now()
    };
    
    // Realizar la petición
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    const data = await response.json();
    
    // Registrar el resultado para analytics
    lastApiCall.duration = Date.now() - lastApiCall.timestamp;
    lastApiCall.success = response.ok;
    
    if (!response.ok) {
      throw new Error(data.error || 'Error al ejecutar el comando');
    }
    
    // Guardar el resultado en el almacenamiento temporal
    const tempData = {
      timestamp: Date.now(),
      command: command,
      result: data.result
    };
    
    chrome.storage.local.get(['tempCommandResults'], function(storage) {
      const commandResults = storage.tempCommandResults || [];
      commandResults.unshift(tempData);
      
      // Limitar a los últimos 20 resultados
      if (commandResults.length > 20) {
        commandResults.pop();
      }
      
      chrome.storage.local.set({ 'tempCommandResults': commandResults });
    });
    
    return data;
  } catch (error) {
    console.error('Error en executeBackendCommand:', error);
    throw error;
  }
}

/**
 * Inyecta los scripts necesarios en la página
 * @param {number} tabId - ID de la pestaña
 * @returns {Promise<void>}
 */
async function injectRequiredScripts(tabId) {
  return new Promise((resolve, reject) => {
    // Verificar si el script ya está inyectado
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => window.n8nAIAssistantInjected
    })
    .then(results => {
      if (results && results[0] && results[0].result) {
        // El script ya está inyectado
        resolve();
      } else {
        // Inyectar el script inject.js
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['scripts/inject.js']
        })
        .then(() => {
          // Marcar que el script está inyectado
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => { window.n8nAIAssistantInjected = true; }
          })
          .then(resolve)
          .catch(reject);
        })
        .catch(reject);
      }
    })
    .catch(reject);
  });
}

/**
 * Función que se ejecuta en la página para aplicar un workflow
 * @param {Object} workflow - Workflow a aplicar
 * @returns {Object} - Resultado de la operación
 */
function applyWorkflowInPage(workflow) {
  try {
    if (typeof window.applyGeneratedWorkflow === 'function') {
      return window.applyGeneratedWorkflow(workflow);
    } else {
      return { success: false, error: 'La función applyGeneratedWorkflow no está disponible en la página' };
    }
  } catch (error) {
    return { success: false, error: error.message || 'Error al aplicar workflow' };
  }
}

/**
 * Función que se ejecuta en la página para aplicar cambios a un workflow
 * @param {Array} changes - Cambios a aplicar
 * @param {Object} originalWorkflow - Workflow original
 * @returns {Object} - Resultado de la operación
 */
function applyChangesInPage(changes, originalWorkflow) {
  try {
    if (typeof window.applyWorkflowChanges === 'function') {
      return window.applyWorkflowChanges(changes, originalWorkflow);
    } else {
      return { success: false, error: 'La función applyWorkflowChanges no está disponible en la página' };
    }
  } catch (error) {
    return { success: false, error: error.message || 'Error al aplicar cambios' };
  }
}

/**
 * Realiza llamadas a servicios de IA (para evitar CORS desde el popup)
 * @param {string} provider - Proveedor (openai, anthropic, openrouter)
 * @param {string} endpoint - Endpoint específico
 * @param {Object} data - Datos para la llamada
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} - Respuesta del servicio
 */
async function callAIService(provider, endpoint, data, apiKey) {
  try {
    let url, headers;
    
    switch (provider) {
      case 'openai':
        url = `https://api.openai.com/v1/${endpoint}`;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        break;
      
      case 'anthropic':
        url = `https://api.anthropic.com/v1/${endpoint}`;
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        };
        break;
      
      case 'openrouter':
        url = `https://openrouter.ai/api/v1/${endpoint}`;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'n8n-ai-assistant-extension',
          'X-Title': 'n8n AI Assistant Pro'
        };
        break;
      
      case 'custom':
        url = data.url;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        
        // Agregar headers personalizados si existen
        if (data.headers) {
          headers = { ...headers, ...data.headers };
        }
        
        // Eliminar la URL de los datos para no enviarla duplicada
        const customData = { ...data };
        delete customData.url;
        delete customData.headers;
        data = customData;
        break;
        
      default:
        throw new Error(`Proveedor de IA no soportado: ${provider}`);
    }
    
    // Registrar el inicio de la llamada para analytics
    lastApiCall = {
      type: 'ai',
      provider: provider,
      endpoint: endpoint,
      timestamp: Date.now()
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    // Registrar el resultado para analytics
    lastApiCall.duration = Date.now() - lastApiCall.timestamp;
    lastApiCall.success = response.ok;
    lastApiCall.status = response.status;
    
    if (!response.ok) {
      throw new Error(result.error?.message || `Error en la API de ${provider}: ${response.status}`);
    }
    
    return {
      success: true,
      result: result
    };
  } catch (error) {
    console.error(`Error en callAIService (${provider}):`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ----- FUNCIONES DE UTILIDAD -----

/**
 * Registra acciones del usuario para analytics interno
 * @param {string} action - Nombre de la acción
 * @param {Object} details - Detalles adicionales
 */
function trackUserAction(action, details = {}) {
  // Solo registrar si el usuario ha aceptado analytics
  chrome.storage.local.get(['preferences'], function(data) {
    if (data.preferences && data.preferences.allowAnalytics) {
      const event = {
        action,
        details,
        timestamp: Date.now(),
        url: (currentTabId ? `tab:${currentTabId}` : 'unknown')
      };
      
      // Guardar evento en el almacenamiento local
      chrome.storage.local.get(['analytics'], function(data) {
        const analytics = data.analytics || [];
        analytics.push(event);
        
        // Limitar a 100 eventos
        if (analytics.length > 100) {
          analytics.shift();
        }
        
        chrome.storage.local.set({ 'analytics': analytics });
      });
    }
  });
}

/**
 * Limpia almacenamiento temporal ocasionalmente
 */
function cleanupTemporaryStorage() {
  const now = Date.now();
  
  chrome.storage.local.get(['tempData', 'tempCommandResults'], function(data) {
    let hasChanges = false;
    
    // Limpiar datos temporales generales
    if (data.tempData) {
      const cleanData = {};
      
      // Eliminar datos más antiguos que una semana
      Object.keys(data.tempData).forEach(key => {
        if (data.tempData[key].timestamp && (now - data.tempData[key].timestamp) < 7 * 24 * 60 * 60 * 1000) {
          cleanData[key] = data.tempData[key];
        } else {
          hasChanges = true;
        }
      });
      
      if (hasChanges) {
        chrome.storage.local.set({ 'tempData': cleanData });
      }
    }
    
    // Limpiar resultados de comandos antiguos
    if (data.tempCommandResults && data.tempCommandResults.length > 0) {
      let hasCommandChanges = false;
      
      // Eliminar resultados más antiguos que un día
      const cleanCommandResults = data.tempCommandResults.filter(item => {
        if (item.timestamp && (now - item.timestamp) < 24 * 60 * 60 * 1000) {
          return true;
        } else {
          hasCommandChanges = true;
          return false;
        }
      });
      
      if (hasCommandChanges) {
        chrome.storage.local.set({ 'tempCommandResults': cleanCommandResults });
      }
    }
  });
}

// ----- EVENT LISTENERS ADICIONALES -----

// Listener para la instalación de la extensión
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    // Primera instalación - mostrar página de bienvenida
    chrome.tabs.create({
      url: chrome.runtime.getURL('pages/welcome.html')
    });
    
    // Inicializar configuraciones por defecto
    chrome.storage.local.set({
      'apiSettings': {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: '',
        customUrl: ''
      },
      'preferences': {
        autoDetect: true,
        autoSuggest: false,
        darkMode: false,
        chatHistory: true,
        allowAnalytics: false
      },
      'dockerSettings': {
        dockerHost: 'http://localhost:5000',
        postgresConnection: ''
      },
      'analytics': [],
      'tempData': {},
      'tempCommandResults': []
    });
    
    // Registrar evento de instalación
    trackUserAction('extension_installed', {
      version: chrome.runtime.getManifest().version,
      browser: getBrowserInfo()
    });
  } else if (details.reason === 'update') {
    // Actualización - registrar evento
    const thisVersion = chrome.runtime.getManifest().version;
    console.log('Actualizado a la versión', thisVersion);
    
    trackUserAction('extension_updated', {
      version: thisVersion,
      previousVersion: details.previousVersion
    });
    
    // Opcionalmente mostrar novedades de la versión
    /* 
    chrome.tabs.create({
      url: chrome.runtime.getURL('pages/update.html')
    });
    */
  }
});

// Listener para cambios de pestaña activa
chrome.tabs.onActivated.addListener(function(activeInfo) {
  currentTabId = activeInfo.tabId;
  
  // Verificar si la nueva pestaña activa es una página de n8n
  chrome.tabs.get(activeInfo.tabId, function(tab) {
    if (tab.url && (tab.url.includes('n8n') || tab.url.includes('workflow'))) {
      // Intentar extraer el workflow después de un breve retraso para permitir que la página cargue
      setTimeout(() => {
        chrome.tabs.sendMessage(activeInfo.tabId, { action: "checkN8n" })
          .then(response => {
            if (response && response.isN8n) {
              chrome.tabs.sendMessage(activeInfo.tabId, { action: "extractWorkflow" })
                .then(response => {
                  if (response && response.workflow) {
                    chrome.storage.local.set({ 'currentWorkflow': response.workflow });
                    currentWorkflow = response.workflow;
                  }
                })
                .catch(() => {
                  // Ignorar errores si el content script no está listo
                });
            }
          })
          .catch(() => {
            // Ignorar errores si el content script no está listo
          });
      }, 1000);
    }
  });
});

// Escuchar comandos de teclado
chrome.commands.onCommand.addListener(function(command) {
  if (command === "analyze_workflow") {
    // Enviar mensaje al popup para analizar el workflow actual
    chrome.runtime.sendMessage({
      action: "shortcutTriggered",
      command: "analyze_workflow"
    }).catch(() => {
      // Si el popup no está abierto, abrirlo
      chrome.action.openPopup().then(() => {
        // Esperar a que el popup esté listo y luego enviar el mensaje
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: "shortcutTriggered",
            command: "analyze_workflow"
          });
        }, 200);
      });
    });
  }
  else if (command === "generate_workflow") {
    // Enviar mensaje al popup para mostrar la interfaz de generación
    chrome.runtime.sendMessage({
      action: "shortcutTriggered",
      command: "generate_workflow"
    }).catch(() => {
      // Si el popup no está abierto, abrirlo
      chrome.action.openPopup().then(() => {
        // Esperar a que el popup esté listo y luego enviar el mensaje
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: "shortcutTriggered",
            command: "generate_workflow"
          });
        }, 200);
      });
    });
  }
  
  // Registrar uso de atajos de teclado
  trackUserAction('keyboard_shortcut_used', { command });
});

// ----- FUNCIONES DE UTILIDAD ADICIONALES -----

/**
 * Obtiene información sobre el navegador
 * @returns {string} - Información del navegador
 */
function getBrowserInfo() {
  const userAgent = navigator.userAgent;
  let browserInfo = 'Unknown';
  
  if (userAgent.indexOf("Chrome") > -1) {
    browserInfo = 'Chrome';
  } else if (userAgent.indexOf("Firefox") > -1) {
    browserInfo = 'Firefox';
  } else if (userAgent.indexOf("Edge") > -1) {
    browserInfo = 'Edge';
  } else if (userAgent.indexOf("Safari") > -1) {
    browserInfo = 'Safari';
  } else if (userAgent.indexOf("Opera") > -1) {
    browserInfo = 'Opera';
  }
  
  return browserInfo;
}

// ----- INICIALIZACIÓN -----

// Ejecutar limpieza cada día
setInterval(cleanupTemporaryStorage, 24 * 60 * 60 * 1000);

// Limpiar al inicio
cleanupTemporaryStorage();

// Registrar evento de inicio
console.log('n8n AI Assistant Pro - Background script iniciado');