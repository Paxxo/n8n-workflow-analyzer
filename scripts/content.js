/**
 * content.js - Script que se inyecta en la página de n8n para interactuar con el editor
 * 
 * Este script detecta si estamos en un editor de n8n, extrae workflows y permite
 * aplicar cambios generados por IA directamente en la interfaz.
 * 
 * Funcionalidades:
 * - Detección automática de páginas n8n
 * - Extracción de workflows mediante múltiples métodos
 * - Aplicación de workflows generados por IA
 * - Modificación de workflows existentes
 * - Observación de cambios en tiempo real
 */

// ----- VARIABLES GLOBALES -----

let observingDOM = false;
let lastWorkflowData = null;
let n8nReady = false;
let injectedScripts = false;
let extractWorkflowAttempts = 0;
let lastExtractionTime = 0;
let pageLoadTime = Date.now();
let nodeTypes = [];
let detectionInterval = null;
let workflowExtractionInterval = null;

// Configuración
const CONFIG = {
  // Intervalo para intentar extraer el workflow (ms)
  EXTRACTION_INTERVAL: 2000,
  // Tiempo máximo para seguir intentando extraer el workflow (ms)
  MAX_EXTRACTION_TIME: 60000,
  // Número máximo de intentos de extracción
  MAX_EXTRACTION_ATTEMPTS: 10,
  // Tiempo mínimo entre extracciones (ms)
  MIN_EXTRACTION_INTERVAL: 500,
  // Tiempo de debounce para observador de DOM (ms)
  DOM_OBSERVER_DEBOUNCE: 500
};

// ----- ESCUCHAR MENSAJES -----

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log("Mensaje recibido en content.js:", request);
  
  // Comprobar si estamos en una página de n8n
  if (request.action === "checkN8n") {
    const isN8n = detectN8nPage();
    sendResponse({isN8n: isN8n});
  }
  
  // Extraer workflow
  else if (request.action === "extractWorkflow") {
    // Evitar extracciones demasiado frecuentes
    const now = Date.now();
    if (now - lastExtractionTime < CONFIG.MIN_EXTRACTION_INTERVAL) {
      if (lastWorkflowData) {
        sendResponse({workflow: lastWorkflowData});
        return true;
      }
    }
    
    lastExtractionTime = now;
    
    extractWorkflow().then(result => {
      sendResponse(result);
    }).catch(error => {
      console.error("Error al extraer workflow:", error);
      sendResponse({error: error.message});
    });
    
    // Si no estamos observando cambios en el DOM, comenzar a hacerlo
    if (!observingDOM && n8nReady) {
      startDOMObserver();
    }
  }
  
  // Aplicar workflow generado
  else if (request.action === "applyWorkflow") {
    ensureInjectScript().then(() => {
      applyWorkflow(request.workflow).then(result => {
        sendResponse(result);
      }).catch(error => {
        console.error("Error al aplicar workflow:", error);
        sendResponse({error: error.message});
      });
    });
  }
  
  // Aplicar cambios a un workflow existente
  else if (request.action === "applyChanges") {
    ensureInjectScript().then(() => {
      applyChanges(request.changes, request.originalWorkflow).then(result => {
        sendResponse(result);
      }).catch(error => {
        console.error("Error al aplicar cambios:", error);
        sendResponse({error: error.message});
      });
    });
  }
  
  // Obtener tipos de nodos disponibles
  else if (request.action === "getNodeTypes") {
    getAvailableNodeTypes().then(types => {
      sendResponse({nodeTypes: types});
    }).catch(error => {
      console.error("Error al obtener tipos de nodos:", error);
      sendResponse({error: error.message});
    });
  }
  
  // Obtener credenciales disponibles
  else if (request.action === "getCredentials") {
    getAvailableCredentials().then(credentials => {
      sendResponse({credentials: credentials});
    }).catch(error => {
      console.error("Error al obtener credenciales:", error);
      sendResponse({error: error.message});
    });
  }
  
  // Importante: devolver true para mantener la conexión abierta para respuestas asíncronas
  return true;
});

// ----- FUNCIONES PRINCIPALES -----

/**
 * Asegura que el script de inyección esté cargado
 * @returns {Promise<void>}
 */
async function ensureInjectScript() {
  if (injectedScripts) {
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Solicitar al background script que inyecte inject.js
      chrome.runtime.sendMessage({
        action: "injectScript",
        scriptFile: "scripts/inject.js"
      }, response => {
        if (response && response.success) {
          injectedScripts = true;
          // Esperar a que las funciones estén disponibles
          setTimeout(resolve, 100);
        } else {
          reject(new Error(response?.error || "No se pudo inyectar el script"));
        }
      });
    } catch (error) {
      // Si falla, intentar inyectar manualmente
      try {
        // Inyectar script para manipular la interfaz de n8n
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('scripts/inject.js');
        script.onload = function() {
          injectedScripts = true;
          script.remove();
          // Esperar a que las funciones estén disponibles
          setTimeout(resolve, 100);
        };
        script.onerror = function() {
          reject(new Error("Error al cargar el script inject.js manualmente"));
        };
        document.head.appendChild(script);
      } catch (manualError) {
        reject(new Error(`Error al inyectar script: ${manualError.message}`));
      }
    }
  });
}

/**
 * Detecta si la página actual es un editor de workflows de n8n
 * @returns {boolean} - true si es una página de n8n
 */
function detectN8nPage() {
  // Método 1: Buscar elementos específicos de la interfaz de n8n
  const n8nElements = [
    '.n8n-workflow',
    '.workflow-canvas',
    '#n8n-editor',
    '[data-test-id="canvas-plus-button"]',
    '[data-workflow]',
    '.node-create-dropdown',
    '.node-item',
    '#workflow-editor',
    '.workflow-editor',
    '.el-drawer__wrapper',
    '.workflow-name-wrapper',
    '.workflow-buttons',
    '.node-icon',
    '.node-connection'
  ];
  
  const hasN8nElements = n8nElements.some(selector => 
    document.querySelector(selector) !== null
  );
  
  // Método 2: Comprobar la URL
  const urlIndicators = [
    'n8n.io',
    '/n8n/',
    '/workflow/',
    'workflows',
    'execution',
    'n8n.cloud'
  ];
  
  const urlMatches = urlIndicators.some(indicator => 
    window.location.href.includes(indicator)
  );
  
  // Método 3: Comprobar el título de la página
  const titleIndicators = [
    'n8n',
    'workflow',
    'flujo de trabajo',
    'automatización'
  ];
  
  const titleMatches = titleIndicators.some(indicator => 
    document.title.toLowerCase().includes(indicator.toLowerCase())
  );
  
  // Método 4: Comprobar si hay objetos n8n en window
  const hasN8nGlobals = (
    typeof window.n8n !== 'undefined' ||
    typeof window.$n8n !== 'undefined' ||
    typeof window.n8nWorkflow !== 'undefined'
  );
  
  // Método 5: Comprobar si hay scripts que contienen n8n
  const hasN8nScripts = Array.from(document.querySelectorAll('script')).some(script => 
    script.src && script.src.includes('n8n')
  );
  
  // Considerar como página n8n si al menos uno de los métodos es positivo
  let evidenceCount = 0;
  if (hasN8nElements) evidenceCount++;
  if (urlMatches) evidenceCount++;
  if (titleMatches) evidenceCount++;
  if (hasN8nGlobals) evidenceCount++;
  if (hasN8nScripts) evidenceCount++;
  
  // Actualizar estado
  n8nReady = evidenceCount >= 1;
  
  // Si es una página n8n pero no estábamos observando, iniciar observador
  if (n8nReady && !observingDOM) {
    startDOMObserver();
    
    // Intentar extraer tipos de nodos disponibles
    getAvailableNodeTypes().then(types => {
      nodeTypes = types;
    }).catch(() => {
      // Ignorar errores
    });
  }
  
  return evidenceCount >= 1;
}

/**
 * Extrae el workflow de n8n utilizando varios métodos
 * @returns {Promise<Object>} - Objeto con el workflow o un error
 */
async function extractWorkflow() {
  try {
    // Incrementar contador de intentos
    extractWorkflowAttempts++;
    
    // Intentar diferentes métodos para obtener los datos del workflow
    let workflow = null;
    
    // Método 1: Obtener desde atributos de datos en el DOM
    workflow = await extractFromDOM();
    
    // Método 2: Obtener desde variables globales mediante script inyectado
    if (!workflow) {
      workflow = await extractFromGlobals();
    }
    
    // Método 3: Buscar en elementos JSON visibles
    if (!workflow) {
      workflow = await extractFromVisibleJSON();
    }
    
    // Método 4: Analizar el contenido de la página buscando patrones de workflow
    if (!workflow) {
      workflow = await extractFromPageText();
    }
    
    // Método 5: Utilizar la API de n8n si está disponible
    if (!workflow) {
      workflow = await extractFromAPI();
    }
    
    if (workflow) {
      // Asegurarse de que el workflow sea un string (para poder enviarlo a través de mensajes)
      if (typeof workflow === 'object') {
        workflow = JSON.stringify(workflow);
      }
      
      // Verificar que el workflow tenga formato válido
      if (typeof workflow === 'string') {
        try {
          const parsedWorkflow = JSON.parse(workflow);
          
          // Verificación básica de formato
          if (!parsedWorkflow.nodes || !Array.isArray(parsedWorkflow.nodes)) {
            throw new Error("El workflow extraído no tiene un formato válido (falta 'nodes')");
          }
          
          // Si llegamos aquí, el workflow es válido
          lastWorkflowData = workflow;
          extractWorkflowAttempts = 0; // Reiniciar contador de intentos
          
          // Cancelar el intervalo de extracción si estaba activo
          if (workflowExtractionInterval) {
            clearInterval(workflowExtractionInterval);
            workflowExtractionInterval = null;
          }
          
          return {workflow: workflow};
        } catch (parseError) {
          console.error("Error al parsear workflow extraído:", parseError);
          // Continuar con el siguiente intento
        }
      }
    }
    
    // Si no se pudo extraer el workflow y estamos dentro del tiempo límite, programar otro intento
    if (extractWorkflowAttempts < CONFIG.MAX_EXTRACTION_ATTEMPTS && 
        (Date.now() - pageLoadTime) < CONFIG.MAX_EXTRACTION_TIME) {
      
      // Si no hay un intervalo activo, crear uno
      if (!workflowExtractionInterval) {
        workflowExtractionInterval = setInterval(() => {
          extractWorkflow().then(result => {
            if (result && result.workflow) {
              // Si se extrajo correctamente, notificar al background
              chrome.runtime.sendMessage({
                action: "workflowUpdated",
                workflow: result.workflow,
                significant: true
              });
              
              // Cancelar el intervalo
              clearInterval(workflowExtractionInterval);
              workflowExtractionInterval = null;
            }
          }).catch(() => {
            // Ignorar errores
          });
        }, CONFIG.EXTRACTION_INTERVAL);
      }
    }
    
    // Si tenemos un workflow anteriormente extraído, devolverlo como respaldo
    if (lastWorkflowData) {
      return {workflow: lastWorkflowData, cached: true};
    }
    
    return {error: "No se pudo extraer el workflow utilizando ningún método"};
  } catch (error) {
    console.error('Error general al extraer workflow:', error);
    
    // Si tenemos un workflow anteriormente extraído, devolverlo como respaldo
    if (lastWorkflowData) {
      return {workflow: lastWorkflowData, cached: true};
    }
    
    return {error: error.message};
  }
}

/**
 * Extrae el workflow desde atributos de datos en el DOM
 * @returns {Promise<string|null>} - El workflow en formato JSON o null
 */
async function extractFromDOM() {
  // Buscar elementos que puedan contener el workflow
  const selectors = [
    '[data-workflow]',
    '#workflow-data',
    '.workflow-data',
    '[data-test-id="workflow-data"]',
    'script[type="application/json"]',
    'meta[name="workflow-data"]',
    '[data-id="workflow"]',
    '[data-name="workflow"]',
    '.workflow-information',
    '[data-workflow-id]'
  ];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      try {
        let data = element.getAttribute('data-workflow') || 
                  element.getAttribute('content') || 
                  element.textContent;
                  
        if (data) {
          const parsed = JSON.parse(data);
          // Verificar que es un workflow válido (debe tener nodes y connections)
          if (parsed && parsed.nodes && Array.isArray(parsed.nodes)) {
            return JSON.stringify(parsed);
          }
        }
      } catch (e) {
        console.warn(`Error al parsear elemento ${selector}:`, e);
      }
    }
  }
  
  // Método alternativo: buscar atributos específicos en elementos
  const nodeElements = document.querySelectorAll('.node-item, [data-node-id], [data-node-type]');
  if (nodeElements.length > 0) {
    try {
      // Intentar reconstruir el workflow a partir de los nodos en la pantalla
      const nodes = [];
      const connections = {};
      
      nodeElements.forEach((node, index) => {
        const nodeId = node.getAttribute('data-node-id') || `node_${index}`;
        const nodeType = node.getAttribute('data-node-type') || 'unknown';
        const nodeName = node.querySelector('.node-name')?.textContent || `Node ${index}`;
        
        // Extraer posición si está disponible
        let position = [0, 0];
        if (node.style.transform) {
          const transformMatch = node.style.transform.match(/translate\((\d+)px,\s*(\d+)px\)/);
          if (transformMatch) {
            position = [parseInt(transformMatch[1]), parseInt(transformMatch[2])];
          }
        }
        
        nodes.push({
          id: nodeId,
          name: nodeName,
          type: nodeType,
          position: position,
          parameters: {}
        });
        
        // Buscar conexiones para este nodo
        const connectionElements = document.querySelectorAll(`.connection-link[data-source="${nodeId}"], .connection[data-source="${nodeId}"]`);
        if (connectionElements.length > 0) {
          connections[nodeName] = { main: [[]] };
          
          connectionElements.forEach(conn => {
            const targetNodeId = conn.getAttribute('data-target');
            const targetNodeElement = document.querySelector(`.node-item[data-node-id="${targetNodeId}"]`);
            
            if (targetNodeElement) {
              const targetNodeName = targetNodeElement.querySelector('.node-name')?.textContent || targetNodeId;
              
              connections[nodeName].main[0].push({
                node: targetNodeName,
                type: 'main',
                index: 0
              });
            }
          });
        }
      });
      
      if (nodes.length > 0) {
        return JSON.stringify({
          nodes: nodes,
          connections: connections,
          active: true,
          settings: {},
          id: `reconstructed_${Date.now()}`
        });
      }
    } catch (e) {
      console.warn('Error al reconstruir workflow desde nodos:', e);
    }
  }
  
  return null;
}

/**
 * Extrae el workflow desde variables globales mediante script inyectado
 * @returns {Promise<string|null>} - El workflow en formato JSON o null
 */
async function extractFromGlobals() {
  return new Promise((resolve) => {
    const extractionId = `extraction-${Date.now()}`;
    
    // Escuchar un evento personalizado con los datos
    window.addEventListener(extractionId, function(event) {
      if (event.detail && event.detail.workflow) {
        resolve(event.detail.workflow);
      } else {
        resolve(null);
      }
    }, { once: true });
    
    // Inyectar script para acceder a variables globales
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          // Intentar obtener el workflow desde varias fuentes
          let workflowData = null;
          
          // Método 1: Desde objeto window.n8n
          if (window.n8n && window.n8n.workflow) {
            workflowData = window.n8n.workflow.getCurrentWorkflow ? 
                          window.n8n.workflow.getCurrentWorkflow() : 
                          window.n8n.workflow;
          }
          
          // Método 2: Desde objeto window.$n8n
          if (!workflowData && window.$n8n && window.$n8n.workflow) {
            workflowData = window.$n8n.workflow.getCurrentWorkflow ? 
                          window.$n8n.workflow.getCurrentWorkflow() : 
                          window.$n8n.workflow;
          }
          
          // Método 3: Desde localStorage
          if (!workflowData) {
            const localStorageKeys = Object.keys(localStorage);
            for (const key of localStorageKeys) {
              if (key.includes('workflow') || key.includes('n8n')) {
                try {
                  const data = JSON.parse(localStorage.getItem(key));
                  if (data && data.nodes && Array.isArray(data.nodes)) {
                    workflowData = data;
                    break;
                  }
                } catch (e) {
                  // Ignorar errores al parsear localStorage
                }
              }
            }
          }
          
          // Método 4: Desde variables de la aplicación
          if (!workflowData && window.__INITIAL_STATE__) {
            workflowData = window.__INITIAL_STATE__.workflows && 
                          window.__INITIAL_STATE__.workflows.currentWorkflow;
          }
          
          // Método 5: Desde el store de Vue
          if (!workflowData) {
            const vueElements = Array.from(document.querySelectorAll('*'))
              .filter(el => el.__vue__ && el.__vue__.$store);
            
            if (vueElements.length > 0) {
              const vueStore = vueElements[0].__vue__.$store;
              if (vueStore.state && vueStore.state.workflows && vueStore.state.workflows.currentWorkflow) {
                workflowData = vueStore.state.workflows.currentWorkflow;
              }
            }
          }
          
          // Método 6: Desde el objeto data- en el canvas
          if (!workflowData) {
            const canvasElement = document.querySelector('.workflow-canvas, .n8n-workflow');
            if (canvasElement && canvasElement.dataset) {
              const dataKeys = Object.keys(canvasElement.dataset);
              for (const key of dataKeys) {
                if (key.includes('workflow') || key === 'nodes') {
                  try {
                    const data = JSON.parse(canvasElement.dataset[key]);
                    if (data && (data.nodes || data.connections)) {
                      workflowData = data;
                      break;
                    }
                  } catch (e) {
                    // Ignorar errores al parsear
                  }
                }
              }
            }
          }
          
          // Método 7: Buscar en window cualquier objeto que parezca un workflow
          if (!workflowData) {
            for (const key in window) {
              try {
                if (key.toLowerCase().includes('workflow') || key.toLowerCase().includes('n8n')) {
                  const obj = window[key];
                  if (obj && typeof obj === 'object' && obj.nodes && Array.isArray(obj.nodes)) {
                    workflowData = obj;
                    break;
                  }
                }
              } catch (e) {
                // Algunas propiedades pueden no ser accesibles
              }
            }
          }
          
          // Enviar resultado mediante evento personalizado
          window.dispatchEvent(new CustomEvent('${extractionId}', {
            detail: {
              workflow: workflowData ? JSON.stringify(workflowData) : null
            }
          }));
        } catch (e) {
          console.error('Error al extraer workflow desde variables globales:', e);
          window.dispatchEvent(new CustomEvent('${extractionId}', {
            detail: { workflow: null }
          }));
        }
      })();
    `;
    
    document.head.appendChild(script);
    script.remove();
    
    // Establecer timeout
    setTimeout(() => resolve(null), 1000);
  });
}

/**
 * Extrae el workflow desde elementos JSON visibles
 * @returns {Promise<string|null>} - El workflow en formato JSON o null
 */
async function extractFromVisibleJSON() {
  try {
    // Buscar elementos <pre> o <code> con JSON
    const codeElements = document.querySelectorAll('pre, code, .json-view, .json-data, .json-content, .workflow-json, .json-editor, .json-display');
    for (const element of codeElements) {
      try {
        const text = element.textContent.trim();
        if (text && text.startsWith('{') && text.endsWith('}')) {
          const data = JSON.parse(text);
          if (data && data.nodes && Array.isArray(data.nodes)) {
            return JSON.stringify(data);
          }
        }
      } catch (e) {
        // Ignorar errores al parsear
      }
    }
    
    // Buscar en textareas y inputs que puedan contener JSON
    const formElements = document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
    for (const element of formElements) {
      try {
        const text = element.value || element.textContent;
        if (text && text.includes('"nodes"') && text.includes('"connections"')) {
          const data = JSON.parse(text);
          if (data && data.nodes && Array.isArray(data.nodes)) {
            return JSON.stringify(data);
          }
        }
      } catch (e) {
        // Ignorar errores al parsear
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error al extraer workflow desde JSON visible:', error);
    return null;
  }
}

/**
 * Extrae el workflow buscando patrones en el texto de la página
 * @returns {Promise<string|null>} - El workflow en formato JSON o null
 */
async function extractFromPageText() {
  try {
    // Buscar patrones de JSON en el texto de la página
    const pageText = document.body.innerText;
    
    // Buscar estructuras que parezcan workflows de n8n
    const jsonRegex = /\{[\s\S]*?"nodes"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/g;
    const jsonMatches = pageText.match(jsonRegex);
    
    if (jsonMatches && jsonMatches.length) {
      // Filtrar solo aquellos que tengan la estructura de un workflow
      const potentialWorkflows = jsonMatches
        .filter(json => json.includes('"nodes"') && json.includes('"connections"'))
        .sort((a, b) => b.length - a.length);  // Ordenar por tamaño descendente (el más grande primero)
      
      if (potentialWorkflows.length) {
        try {
          const cleanedJson = potentialWorkflows[0].replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
          const data = JSON.parse(cleanedJson);
          if (data && data.nodes && Array.isArray(data.nodes)) {
            return JSON.stringify(data);
          }
        } catch (e) {
          console.error('Error al parsear JSON del texto:', e);
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error al extraer workflow desde texto de página:', error);
    return null;
  }
}

/**
 * Extrae el workflow utilizando la API de n8n si está disponible
 * @returns {Promise<string|null>} - El workflow en formato JSON o null
 */
async function extractFromAPI() {
  return new Promise((resolve) => {
    // Inyectar script para intentar usar la API de n8n
    const script = document.createElement('script');
    const extractionId = `api-extraction-${Date.now()}`;
    
    script.textContent = `
      (function() {
        try {
          // Intentar obtener el workflow usando diferentes métodos de API
          
          // Método 1: Usando la API REST de n8n si estamos en esa página
          const workflowId = window.location.pathname.match(/workflows\\/([^/]+)/)?.[1];
          
          if (workflowId) {
            fetch(\`/rest/workflows/\${workflowId}\`)
              .then(response => response.json())
              .then(data => {
                window.dispatchEvent(new CustomEvent('${extractionId}', {
                  detail: { workflow: JSON.stringify(data) }
                }));
              })
              .catch(() => {
                // Método 2: Usar la API del frontend de n8n si está disponible
                if (window.n8nApi && window.n8nApi.workflowsApi && typeof window.n8nApi.workflowsApi.getWorkflow === 'function') {
                  window.n8nApi.workflowsApi.getWorkflow(workflowId)
                    .then(data => {
                      window.dispatchEvent(new CustomEvent('${extractionId}', {
                        detail: { workflow: JSON.stringify(data) }
                      }));
                    })
                    .catch(() => {
                      window.dispatchEvent(new CustomEvent('${extractionId}', {
                        detail: { workflow: null }
                      }));
                    });
                } else {
                  window.dispatchEvent(new CustomEvent('${extractionId}', {
                    detail: { workflow: null }
                  }));
                }
              });
          } else {
            window.dispatchEvent(new CustomEvent('${extractionId}', {
              detail: { workflow: null }
            }));
          }
        } catch (e) {
          console.error('Error al extraer workflow desde API:', e);
          window.dispatchEvent(new CustomEvent('${extractionId}', {
            detail: { workflow: null }
          }));
        }
      })();
    `;
    
    // Escuchar evento
    window.addEventListener(extractionId, function(event) {
      if (event.detail && event.detail.workflow) {
        resolve(event.detail.workflow);
      } else {
        resolve(null);
      }
    }, { once: true });
    
    document.head.appendChild(script);
    script.remove();
    
    // Establecer timeout
    setTimeout(() => resolve(null), 2000);
  });
}

/**
 * Aplica un nuevo workflow generado por IA a n8n
 * @param {Object|string} workflow - El workflow a aplicar
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function applyWorkflow(workflow) {
  try {
    // Convertir el workflow a objeto si es string
    const workflowObj = typeof workflow === 'string' ? JSON.parse(workflow) : workflow;
    
    // Intentar ejecutar la función desde el script inyectado
    return new Promise((resolve, reject) => {
      const callId = `applyWorkflow-${Date.now()}`;
      
      // Escuchar respuesta desde el script inyectado
      window.addEventListener(callId, function(event) {
        const result = event.detail;
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error || 'Error desconocido al aplicar workflow'));
        }
      }, { once: true });
      
      // Crear evento para llamar a la función
      const event = new CustomEvent('n8nApplyWorkflow', {
        detail: {
          workflow: workflowObj,
          callId: callId
        }
      });
      
      window.dispatchEvent(event);
      
      // Timeout por si la función no responde
      setTimeout(() => {
        reject(new Error('Timeout al intentar aplicar el workflow'));
      }, 5000);
    });
  } catch (error) {
    console.error('Error en applyWorkflow:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Aplica cambios específicos a un workflow existente
 * @param {Array} changes - Lista de cambios a aplicar
 * @param {Object|string} originalWorkflow - El workflow original
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function applyChanges(changes, originalWorkflow) {
  try {
    // Convertir a objetos si son strings
    const changesObj = typeof changes === 'string' ? JSON.parse(changes) : changes;
    const workflowObj = typeof originalWorkflow === 'string' ? JSON.parse(originalWorkflow) : originalWorkflow;
    
    // Intentar ejecutar la función desde el script inyectado
    return new Promise((resolve, reject) => {
      const callId = `applyChanges-${Date.now()}`;
      
      // Escuchar respuesta desde el script inyectado
      window.addEventListener(callId, function(event) {
        const result = event.detail;
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error || 'Error desconocido al aplicar cambios'));
        }
      }, { once: true });
      
      // Crear evento para llamar a la función
      const event = new CustomEvent('n8nApplyChanges', {
        detail: {
          changes: changesObj,
          originalWorkflow: workflowObj,
          callId: callId
        }
      });
      
      window.dispatchEvent(event);
      
      // Timeout por si la función no responde
      setTimeout(() => {
        reject(new Error('Timeout al intentar aplicar cambios'));
      }, 5000);
    });
  } catch (error) {
    console.error('Error en applyChanges:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene los tipos de nodos disponibles en la instancia de n8n
 * @returns {Promise<Array>} - Lista de tipos de nodos disponibles
 */
async function getAvailableNodeTypes() {
  return new Promise((resolve, reject) => {
    // Si ya tenemos los tipos de nodos, devolverlos directamente
    if (nodeTypes.length > 0) {
      resolve(nodeTypes);
      return;
    }
    
    const extractionId = `node-types-${Date.now()}`;
    
    // Escuchar evento de respuesta
    window.addEventListener(extractionId, function(event) {
      if (event.detail && event.detail.nodeTypes) {
        nodeTypes = event.detail.nodeTypes; // Guardar para futuras consultas
        resolve(event.detail.nodeTypes);
      } else {
        reject(new Error('No se pudieron obtener los tipos de nodos'));
      }
    }, { once: true });
    
    // Inyectar script para obtener los tipos de nodos
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          let availableNodeTypes = [];
          
          // Método 1: A través del store de Vue
          const vueElements = Array.from(document.querySelectorAll('*'))
            .filter(el => el.__vue__ && el.__vue__.$store);
          
          if (vueElements.length > 0) {
            const vueStore = vueElements[0].__vue__.$store;
            if (vueStore.state && vueStore.state.nodeTypes) {
              availableNodeTypes = Object.keys(vueStore.state.nodeTypes);
            }
          }
          
          // Método 2: A través de la API de n8n
          if (availableNodeTypes.length === 0 && window.n8nApi && window.n8nApi.nodeTypesApi) {
            window.n8nApi.nodeTypesApi.getNodeTypes()
              .then(response => {
                availableNodeTypes = response.data.map(nt => nt.name);
                window.dispatchEvent(new CustomEvent('${extractionId}', {
                  detail: { nodeTypes: availableNodeTypes }
                }));
              })
              .catch(error => {
                console.error('Error al obtener tipos de nodos:', error);
                window.dispatchEvent(new CustomEvent('${extractionId}', {
                  detail: { nodeTypes: [] }
                }));
              });
          } else {
            // Método 3: Buscar en el DOM
            if (availableNodeTypes.length === 0) {
              const nodeItems = document.querySelectorAll('.node-item, [data-node-type]');
              const nodeTypeSet = new Set();
              
              nodeItems.forEach(node => {
                const nodeType = node.getAttribute('data-node-type');
                if (nodeType) {
                  nodeTypeSet.add(nodeType);
                }
              });
              
              availableNodeTypes = Array.from(nodeTypeSet);
            }
            
            // Enviar resultado
            window.dispatchEvent(new CustomEvent('${extractionId}', {
              detail: { nodeTypes: availableNodeTypes }
            }));
          }
        } catch (e) {
          console.error('Error al obtener tipos de nodos:', e);
          window.dispatchEvent(new CustomEvent('${extractionId}', {
            detail: { nodeTypes: [] }
          }));
        }
      })();
    `;
    
    document.head.appendChild(script);
    script.remove();
    
    // Timeout
    setTimeout(() => {
      reject(new Error('Timeout al obtener tipos de nodos'));
    }, 3000);
  });
}

/**
 * Obtiene las credenciales disponibles en la instancia de n8n
 * @returns {Promise<Array>} - Lista de credenciales disponibles
 */
async function getAvailableCredentials() {
  return new Promise((resolve, reject) => {
    const extractionId = `credentials-${Date.now()}`;
    
    // Escuchar evento de respuesta
    window.addEventListener(extractionId, function(event) {
      if (event.detail && event.detail.credentials) {
        resolve(event.detail.credentials);
      } else {
        reject(new Error('No se pudieron obtener las credenciales'));
      }
    }, { once: true });
    
    // Inyectar script para obtener credenciales
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          let availableCredentials = [];
          
          // Método 1: A través del store de Vue
          const vueElements = Array.from(document.querySelectorAll('*'))
            .filter(el => el.__vue__ && el.__vue__.$store);
          
          if (vueElements.length > 0) {
            const vueStore = vueElements[0].__vue__.$store;
            if (vueStore.state && vueStore.state.credentials && vueStore.state.credentials.credentials) {
              availableCredentials = vueStore.state.credentials.credentials.map(cred => ({
                id: cred.id,
                name: cred.name,
                type: cred.type
              }));
            }
          }
          
          // Método 2: A través de la API de n8n
          if (availableCredentials.length === 0 && window.n8nApi && window.n8nApi.credentialsApi) {
            window.n8nApi.credentialsApi.getAll()
              .then(response => {
                availableCredentials = response.data.map(cred => ({
                  id: cred.id,
                  name: cred.name,
                  type: cred.type
                }));
                window.dispatchEvent(new CustomEvent('${extractionId}', {
                  detail: { credentials: availableCredentials }
                }));
              })
              .catch(error => {
                console.error('Error al obtener credenciales:', error);
                window.dispatchEvent(new CustomEvent('${extractionId}', {
                  detail: { credentials: [] }
                }));
              });
          } else {
            // Enviar resultado
            window.dispatchEvent(new CustomEvent('${extractionId}', {
              detail: { credentials: availableCredentials }
            }));
          }
        } catch (e) {
          console.error('Error al obtener credenciales:', e);
          window.dispatchEvent(new CustomEvent('${extractionId}', {
            detail: { credentials: [] }
          }));
        }
      })();
    `;
    
    document.head.appendChild(script);
    script.remove();
    
    // Timeout
    setTimeout(() => {
      reject(new Error('Timeout al obtener credenciales'));
    }, 3000);
  });
}

/**
 * Inicia un observador para detectar cambios en el DOM que podrían indicar
 * actualizaciones en el workflow
 */
function startDOMObserver() {
  if (observingDOM) return;
  
  observingDOM = true;
  console.log("Iniciando observador de DOM para workflow de n8n");
  
  const observer = new MutationObserver(function(mutations) {
    // Debounce - esperar a que terminen las mutaciones antes de procesar
    clearTimeout(window.mutationTimeout);
    window.mutationTimeout = setTimeout(async () => {
      // Buscar cambios que sugieran actualización del workflow
      const workflowUpdated = mutations.some(mutation => {
        // Comprobar si el cambio afecta a elementos relevantes
        return Array.from(mutation.addedNodes).some(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          
          return node.classList && (
            node.classList.contains('n8n-workflow') ||
            node.classList.contains('node-item') ||
            node.hasAttribute('data-workflow') ||
            node.querySelector('[data-workflow]') ||
            node.classList.contains('connection') ||
            node.classList.contains('connections-container')
          );
        }) || 
        // Comprobar si se modificaron atributos relevantes
        (mutation.type === 'attributes' && 
         (mutation.attributeName === 'data-workflow' || 
          mutation.attributeName === 'data-nodes' ||
          mutation.attributeName === 'data-connections' ||
          mutation.attributeName === 'class' && 
          mutation.target.classList.contains('node-item')));
      });
      
      if (workflowUpdated) {
        console.log("Detectado cambio en workflow, extrayendo actualización...");
        const result = await extractWorkflow();
        if (result && result.workflow) {
          // Comparar con el último workflow extraído para ver si hay cambios significativos
          const isSignificantChange = lastWorkflowData ? 
            isSignificantWorkflowChange(lastWorkflowData, result.workflow) : true;
          
          // Actualizar última versión extraída
          lastWorkflowData = result.workflow;
          
          // Notificar al background script sobre la actualización
          chrome.runtime.sendMessage({
            action: "workflowUpdated",
            workflow: result.workflow,
            significant: isSignificantChange
          });
        }
      }
    }, CONFIG.DOM_OBSERVER_DEBOUNCE);
  });
  
  // Observar cambios en todo el documento
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-workflow', 'data-nodes', 'data-connections', 'class']
  });
}

/**
 * Compara dos versiones de workflow para determinar si hay cambios significativos
 * @param {string|Object} oldWorkflow - Workflow anterior
 * @param {string|Object} newWorkflow - Nuevo workflow
 * @returns {boolean} - true si hay cambios significativos
 */
function isSignificantWorkflowChange(oldWorkflow, newWorkflow) {
  try {
    const oldData = typeof oldWorkflow === 'string' ? JSON.parse(oldWorkflow) : oldWorkflow;
    const newData = typeof newWorkflow === 'string' ? JSON.parse(newWorkflow) : newWorkflow;
    
    // Comparar número de nodos
    if (!oldData.nodes || !newData.nodes) return true;
    if (oldData.nodes.length !== newData.nodes.length) {
      return true;
    }
    
    // Comparar tipos de nodos
    const oldNodeTypes = oldData.nodes.map(node => node.type).sort();
    const newNodeTypes = newData.nodes.map(node => node.type).sort();
    if (JSON.stringify(oldNodeTypes) !== JSON.stringify(newNodeTypes)) {
      return true;
    }
    
    // Comparar nombres de nodos
    const oldNodeNames = oldData.nodes.map(node => node.name).sort();
    const newNodeNames = newData.nodes.map(node => node.name).sort();
    if (JSON.stringify(oldNodeNames) !== JSON.stringify(newNodeNames)) {
      return true;
    }
    
    // Comparar conexiones (contar número total)
    const countConnections = (connections) => {
      let count = 0;
      if (!connections) return count;
      
      Object.values(connections).forEach(nodeConnections => {
        if (nodeConnections.main) {
          nodeConnections.main.forEach(outputs => {
            count += outputs.length;
          });
        }
      });
      return count;
    };
    
    const oldConnectionCount = countConnections(oldData.connections);
    const newConnectionCount = countConnections(newData.connections);
    
    if (oldConnectionCount !== newConnectionCount) {
      return true;
    }
    
    // Comparar parámetros de los nodos (versión simplificada)
    for (let i = 0; i < oldData.nodes.length; i++) {
      const oldNode = oldData.nodes[i];
      // Encontrar el mismo nodo en el nuevo workflow
      const newNode = newData.nodes.find(n => n.name === oldNode.name && n.type === oldNode.type);
      
      if (!newNode) return true; // Nodo no encontrado en el nuevo workflow
      
      // Comparar parámetros
      if (oldNode.parameters && newNode.parameters) {
        const oldParamKeys = Object.keys(oldNode.parameters).sort();
        const newParamKeys = Object.keys(newNode.parameters).sort();
        
        if (JSON.stringify(oldParamKeys) !== JSON.stringify(newParamKeys)) {
          return true;
        }
        
        // Verificar si algún valor de parámetro ha cambiado
        for (const key of oldParamKeys) {
          if (JSON.stringify(oldNode.parameters[key]) !== JSON.stringify(newNode.parameters[key])) {
            return true;
          }
        }
      }
    }
    
    // Si llegamos aquí, no hay cambios significativos detectados
    return false;
  } catch (error) {
    console.error('Error al comparar workflows:', error);
    return true; // En caso de error, asumir que hay cambios significativos
  }
}

// ----- INICIALIZACIÓN -----

// Inicializar detección de n8n y preparar observador cuando la página esté lista
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  if (detectN8nPage()) {
    startDOMObserver();
    
    // Intentar extraer el workflow después de un breve retraso
    setTimeout(() => {
      extractWorkflow().then(result => {
        if (result && result.workflow) {
          // Notificar al background
          chrome.runtime.sendMessage({
            action: "workflowUpdated",
            workflow: result.workflow,
            significant: true
          });
        }
      }).catch(() => {
        // Ignorar errores
      });
    }, 1000);
  } else {
    // Si no detectamos n8n inmediatamente, configurar un intervalo para seguir intentando
    if (!detectionInterval) {
      detectionInterval = setInterval(() => {
        if (detectN8nPage()) {
          clearInterval(detectionInterval);
          detectionInterval = null;
          startDOMObserver();
        }
      }, 2000);
      
      // Establecer un límite de tiempo para los intentos
      setTimeout(() => {
        if (detectionInterval) {
          clearInterval(detectionInterval);
          detectionInterval = null;
        }
      }, 30000);
    }
  }
} else {
  // Si el documento aún no está listo, esperar a que lo esté
  document.addEventListener('DOMContentLoaded', function() {
    if (detectN8nPage()) {
      startDOMObserver();
    } else {
      // Configurar un intervalo para seguir intentando
      if (!detectionInterval) {
        detectionInterval = setInterval(() => {
          if (detectN8nPage()) {
            clearInterval(detectionInterval);
            detectionInterval = null;
            startDOMObserver();
          }
        }, 2000);
        
        // Establecer un límite de tiempo para los intentos
        setTimeout(() => {
          if (detectionInterval) {
            clearInterval(detectionInterval);
            detectionInterval = null;
          }
        }, 30000);
      }
    }
  });
}

// También detectar cambios en el DOM que puedan indicar que n8n se ha cargado después
const bodyObserver = new MutationObserver(function(mutations) {
  if (!n8nReady && detectN8nPage()) {
    n8nReady = true;
    startDOMObserver();
    
    // Intentar extraer el workflow
    extractWorkflow().then(result => {
      if (result && result.workflow) {
        // Notificar al background
        chrome.runtime.sendMessage({
          action: "workflowUpdated",
          workflow: result.workflow,
          significant: true
        });
      }
    }).catch(() => {
      // Ignorar errores
    });
    
    // Una vez que se ha detectado n8n, no necesitamos seguir observando el body
    bodyObserver.disconnect();
  }
});

// Observar cambios en el body para detectar cuando se carga n8n
bodyObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// Reportar información de inicialización
console.log('n8n AI Assistant Pro - Content script iniciado');
console.log('Versión: ' + chrome.runtime.getManifest().version);
console.log('Tiempo de inicialización: ' + (Date.now() - pageLoadTime) + 'ms');