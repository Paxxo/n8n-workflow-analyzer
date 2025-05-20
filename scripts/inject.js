/**
 * inject.js - Script que se inyecta directamente en la página de n8n
 * 
 * Este script proporciona funciones para interactuar con el editor de workflows,
 * permitiendo la aplicación de workflows completos o cambios específicos generados por IA.
 */

(function() {
    console.log("n8n AI Assistant: Script de inyección cargado");
    
    // Funciones para interactuar con el editor de n8n
    
    /**
     * Aplica un workflow completo generado por IA
     * Expuesto a través de un evento personalizado para que content.js pueda llamarlo
     * 
     * @param {Object} workflowData - Datos del workflow a aplicar
     * @returns {Object} - Resultado de la operación
     */
    function applyGeneratedWorkflow(workflowData) {
      try {
        // Verificar si el workflow es válido
        if (!workflowData || !workflowData.nodes || !Array.isArray(workflowData.nodes)) {
          console.error('Datos de workflow inválidos:', workflowData);
          return { success: false, error: 'Formato de workflow inválido' };
        }
        
        // Buscar la instancia de n8n en varios posibles lugares
        let n8nInstance = findN8nInstance();
        
        if (!n8nInstance) {
          console.error('No se pudo encontrar la instancia de n8n');
          return { success: false, error: 'No se pudo encontrar la instancia de n8n' };
        }
        
        // Intentar varios métodos para aplicar el workflow
        
        // Método 1: A través de la API oficial si está disponible
        if (n8nInstance.workflows && typeof n8nInstance.workflows.importWorkflow === 'function') {
          n8nInstance.workflows.importWorkflow(workflowData);
          return { success: true };
        }
        
        // Método 2: A través del store si está disponible
        if (n8nInstance.$store && n8nInstance.$store.dispatch) {
          n8nInstance.$store.dispatch('workflows/importWorkflow', { workflow: workflowData });
          return { success: true };
        }
        
        // Método 3: Usando el store global
        const vueInstance = findVueInstance();
        if (vueInstance && vueInstance.$store) {
          vueInstance.$store.dispatch('workflows/importWorkflow', { workflow: workflowData });
          return { success: true };
        }
        
        // Método 4: A través de API de n8n más reciente
        if (window.n8nWorkflowHelpers && window.n8nWorkflowHelpers.importWorkflow) {
          window.n8nWorkflowHelpers.importWorkflow(workflowData);
          return { success: true };
        }
        
        // Método 5: Directamente en el canvas
        const workflowCanvas = document.querySelector('.workflow-canvas') || 
                              document.querySelector('.n8n-workflow') ||
                              document.querySelector('#workflow-canvas');
        
        if (workflowCanvas && workflowCanvas.__vue__) {
          const canvasComponent = workflowCanvas.__vue__;
          
          // Limpiar canvas actual
          const currentNodes = document.querySelectorAll('.node-item');
          currentNodes.forEach(node => {
            if (canvasComponent.removeNode) {
              const nodeId = node.getAttribute('data-node-id') || node.id;
              canvasComponent.removeNode(nodeId);
            }
          });
          
          // Intentar agregar nodos uno por uno
          workflowData.nodes.forEach(node => {
            if (canvasComponent.addNodeToCanvas) {
              canvasComponent.addNodeToCanvas(node.type, node.position, node);
            }
          });
          
          // Intentar añadir conexiones
          if (workflowData.connections && canvasComponent.addConnection) {
            Object.entries(workflowData.connections).forEach(([sourceNode, connections]) => {
              if (connections.main) {
                connections.main.forEach((outputs, outputIndex) => {
                  outputs.forEach(output => {
                    canvasComponent.addConnection({
                      source: sourceNode,
                      sourceIndex: outputIndex,
                      target: output.node,
                      targetIndex: output.index || 0
                    });
                  });
                });
              }
            });
          }
          
          return { success: true };
        }
        
        // Si llegamos aquí, no pudimos aplicar el workflow
        return { success: false, error: 'No se pudo aplicar el workflow con ningún método disponible' };
      } catch (error) {
        console.error('Error al aplicar workflow:', error);
        return { success: false, error: error.message };
      }
    }
    
    /**
     * Aplica cambios específicos a un workflow existente
     * Expuesto a través de un evento personalizado para que content.js pueda llamarlo
     * 
     * @param {Array} changes - Lista de cambios a aplicar
     * @param {Object} originalWorkflow - Workflow original
     * @returns {Object} - Resultado de la operación
     */
    function applyWorkflowChanges(changes, originalWorkflow) {
      try {
        if (!changes || !Array.isArray(changes)) {
          console.error('Cambios inválidos:', changes);
          return { success: false, error: 'Formato de cambios inválido' };
        }
        
        // Buscar la instancia de n8n
        let n8nInstance = findN8nInstance();
        
        if (!n8nInstance) {
          console.error('No se pudo encontrar la instancia de n8n');
          return { success: false, error: 'No se pudo encontrar la instancia de n8n' };
        }
        
        // Aplicar cada cambio
        const results = changes.map(change => {
          try {
            switch (change.type) {
              case 'update_node':
                return updateNode(n8nInstance, change.nodeId, change.data);
              case 'add_node':
                return addNode(n8nInstance, change.data);
              case 'remove_node':
                return removeNode(n8nInstance, change.nodeId);
              case 'update_connection':
                return updateConnection(n8nInstance, change.connectionId, change.data);
              case 'add_connection':
                return addConnection(n8nInstance, change.data);
              case 'remove_connection':
                return removeConnection(n8nInstance, change.connectionId);
              default:
                console.warn('Tipo de cambio no soportado:', change.type);
                return { success: false, error: 'Tipo de cambio no soportado: ' + change.type };
            }
          } catch (error) {
            console.error(`Error al aplicar cambio ${change.type}:`, error);
            return { success: false, error: error.message };
          }
        });
        
        // Verificar si todos los cambios se aplicaron correctamente
        const allSuccessful = results.every(result => result.success);
        
        if (allSuccessful) {
          return { success: true };
        } else {
          const errors = results
            .filter(result => !result.success)
            .map(result => result.error)
            .join(', ');
            
          return { success: false, error: errors };
        }
      } catch (error) {
        console.error('Error al aplicar cambios:', error);
        return { success: false, error: error.message };
      }
    }
    
    // ----- FUNCIONES AUXILIARES -----
    
    /**
     * Encuentra la instancia de n8n en diferentes contextos
     * @returns {Object|null} - Instancia de n8n o null si no se encuentra
     */
    function findN8nInstance() {
      // Intentar varias opciones donde podría estar la instancia de n8n
      
      // Opción 1: Variable global
      if (window.n8n) {
        return window.n8n;
      }
      
      // Opción 2: Otra variable global
      if (window.$n8n) {
        return window.$n8n;
      }
      
      // Opción 3: A través del componente Vue en el canvas
      const workflowCanvas = document.querySelector('.workflow-canvas') || 
                            document.querySelector('.n8n-workflow') ||
                            document.querySelector('#workflow-canvas');
      
      if (workflowCanvas && workflowCanvas.__vue__) {
        return workflowCanvas.__vue__;
      }
      
      // Opción 4: A través del store de Vue
      const vueInstance = findVueInstance();
      if (vueInstance && vueInstance.$store) {
        return { $store: vueInstance.$store };
      }
      
      // Opción 5: Buscar en window cualquier propiedad que pueda contener n8n
      for (const key in window) {
        if (key.toLowerCase().includes('n8n') && window[key] && typeof window[key] === 'object') {
          return window[key];
        }
      }
      
      return null;
    }
    
    /**
     * Encuentra una instancia de Vue
     * @returns {Object|null} - Instancia de Vue o null si no se encuentra
     */
    function findVueInstance() {
      // Buscar un elemento que tenga una instancia de Vue
      const elements = Array.from(document.querySelectorAll('*'));
      
      for (const element of elements) {
        if (element.__vue__) {
          return element.__vue__;
        }
      }
      
      // Buscar el elemento raíz de Vue
      const appElement = document.querySelector('#app');
      if (appElement && appElement.__vue__) {
        return appElement.__vue__;
      }
      
      return null;
    }
    
    /**
     * Actualiza un nodo existente
     * @param {Object} n8nInstance - Instancia de n8n
     * @param {string} nodeId - ID del nodo a actualizar
     * @param {Object} data - Datos para actualizar
     * @returns {Object} - Resultado de la operación
     */
    function updateNode(n8nInstance, nodeId, data) {
      // Intentar diferentes métodos para actualizar un nodo
      
      // Método 1: A través de la API
      if (n8nInstance.nodeHelpers && typeof n8nInstance.nodeHelpers.updateNode === 'function') {
        n8nInstance.nodeHelpers.updateNode(nodeId, data);
        return { success: true };
      }
      
      // Método 2: A través del store
      if (n8nInstance.$store && n8nInstance.$store.dispatch) {
        n8nInstance.$store.dispatch('workflows/updateNode', { nodeId, updateInformation: data });
        return { success: true };
      }
      
      // Método 3: Usando el store desde Vue
      const vueInstance = findVueInstance();
      if (vueInstance && vueInstance.$store) {
        vueInstance.$store.dispatch('workflows/updateNode', { nodeId, updateInformation: data });
        return { success: true };
      }
      
      // Método 4: A través de alguna API más reciente
      if (window.n8nWorkflowHelpers && window.n8nWorkflowHelpers.updateNode) {
        window.n8nWorkflowHelpers.updateNode(nodeId, data);
        return { success: true };
      }
      
      // Método 5: Manipulación directa del DOM si es necesario
      const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
      if (nodeElement && nodeElement.__vue__) {
        const nodeComponent = nodeElement.__vue__;
        
        // Actualizar propiedades en el componente
        for (const [key, value] of Object.entries(data)) {
          nodeComponent[key] = value;
        }
        
        return { success: true };
      }
      
      return { success: false, error: 'No se pudo actualizar el nodo con ningún método disponible' };
    }
    
    /**
     * Añade un nuevo nodo
     * @param {Object} n8nInstance - Instancia de n8n
     * @param {Object} data - Datos del nodo a añadir
     * @returns {Object} - Resultado de la operación
     */
    function addNode(n8nInstance, data) {
      // Intentar diferentes métodos para añadir un nodo
      
      // Método 1: A través de la API
      if (n8nInstance.nodeHelpers && typeof n8nInstance.nodeHelpers.addNode === 'function') {
        n8nInstance.nodeHelpers.addNode(data.type, data.position, data);
        return { success: true };
      }
      
      // Método 2: A través del store
      if (n8nInstance.$store && n8nInstance.$store.dispatch) {
        n8nInstance.$store.dispatch('workflows/addNode', { data });
        return { success: true };
      }
      
      // Método 3: Usando el store desde Vue
      const vueInstance = findVueInstance();
      if (vueInstance && vueInstance.$store) {
        vueInstance.$store.dispatch('workflows/addNode', { data });
        return { success: true };
      }
      
      // Método 4: A través de alguna API más reciente
      if (window.n8nWorkflowHelpers && window.n8nWorkflowHelpers.addNode) {
        window.n8nWorkflowHelpers.addNode(data.type, data.position, data);
        return { success: true };
      }
      
      // Método 5: Añadir directamente al canvas
      const workflowCanvas = document.querySelector('.workflow-canvas') || 
                            document.querySelector('.n8n-workflow') ||
                            document.querySelector('#workflow-canvas');
                            
      if (workflowCanvas && workflowCanvas.__vue__ && typeof workflowCanvas.__vue__.addNodeToCanvas === 'function') {
        workflowCanvas.__vue__.addNodeToCanvas(data.type, data.position, data);
        return { success: true };
      }
      
      return { success: false, error: 'No se pudo añadir el nodo con ningún método disponible' };
    }
    
    /**
     * Elimina un nodo
     * @param {Object} n8nInstance - Instancia de n8n
     * @param {string} nodeId - ID del nodo a eliminar
     * @returns {Object} - Resultado de la operación
     */
    function removeNode(n8nInstance, nodeId) {
      // Intentar diferentes métodos para eliminar un nodo
      
      // Método 1: A través de la API
      if (n8nInstance.nodeHelpers && typeof n8nInstance.nodeHelpers.removeNode === 'function') {
        n8nInstance.nodeHelpers.removeNode(nodeId);
        return { success: true };
      }
      
      // Método 2: A través del store
      if (n8nInstance.$store && n8nInstance.$store.dispatch) {
        n8nInstance.$store.dispatch('workflows/removeNode', { nodeId });
        return { success: true };
      }
      
      // Método 3: Usando el store desde Vue
      const vueInstance = findVueInstance();
      if (vueInstance && vueInstance.$store) {
        vueInstance.$store.dispatch('workflows/removeNode', { nodeId });
        return { success: true };
      }
      
      // Método 4: A través de alguna API más reciente
      if (window.n8nWorkflowHelpers && window.n8nWorkflowHelpers.removeNode) {
        window.n8nWorkflowHelpers.removeNode(nodeId);
        return { success: true };
      }
      
      // Método 5: Eliminar directamente del canvas
      const workflowCanvas = document.querySelector('.workflow-canvas') || 
                            document.querySelector('.n8n-workflow') ||
                            document.querySelector('#workflow-canvas');
                            
      if (workflowCanvas && workflowCanvas.__vue__ && typeof workflowCanvas.__vue__.removeNodeFromCanvas === 'function') {
        workflowCanvas.__vue__.removeNodeFromCanvas(nodeId);
        return { success: true };
      }
      
      return { success: false, error: 'No se pudo eliminar el nodo con ningún método disponible' };
    }
    
    /**
     * Actualiza una conexión
     * @param {Object} n8nInstance - Instancia de n8n
     * @param {Object} connectionId - ID o datos de la conexión a actualizar
     * @param {Object} data - Datos para actualizar
     * @returns {Object} - Resultado de la operación
     */
    function updateConnection(n8nInstance, connectionId, data) {
      // Intentar diferentes métodos para actualizar conexión
      
      // Método 1: A través del store
      if (n8nInstance.$store && n8nInstance.$store.dispatch) {
        n8nInstance.$store.dispatch('workflows/updateConnection', { connectionId, updateInformation: data });
        return { success: true };
      }
      
      // Método 2: Usando el store desde Vue
      const vueInstance = findVueInstance();
      if (vueInstance && vueInstance.$store) {
        vueInstance.$store.dispatch('workflows/updateConnection', { connectionId, updateInformation: data });
        return { success: true };
      }
      
      // Método 3: A través de alguna API más reciente
      if (window.n8nWorkflowHelpers && window.n8nWorkflowHelpers.updateConnection) {
        window.n8nWorkflowHelpers.updateConnection(connectionId, data);
        return { success: true };
      }
      
      return { success: false, error: 'No se pudo actualizar la conexión con ningún método disponible' };
    }
    
    /**
     * Añade una conexión
     * @param {Object} n8nInstance - Instancia de n8n
     * @param {Object} data - Datos de la conexión a añadir
     * @returns {Object} - Resultado de la operación
     */
    function addConnection(n8nInstance, data) {
      // Intentar diferentes métodos para añadir una conexión
      
      // Método 1: A través de la API
      if (n8nInstance.nodeHelpers && typeof n8nInstance.nodeHelpers.addConnection === 'function') {
        n8nInstance.nodeHelpers.addConnection(data);
        return { success: true };
      }
      
      // Método 2: A través del store
      if (n8nInstance.$store && n8nInstance.$store.dispatch) {
        n8nInstance.$store.dispatch('workflows/addConnection', { data });
        return { success: true };
      }
      
      // Método 3: Usando el store desde Vue
      const vueInstance = findVueInstance();
      if (vueInstance && vueInstance.$store) {
        vueInstance.$store.dispatch('workflows/addConnection', { data });
        return { success: true };
      }
      
      // Método 4: A través de alguna API más reciente
      if (window.n8nWorkflowHelpers && window.n8nWorkflowHelpers.addConnection) {
        window.n8nWorkflowHelpers.addConnection(data);
        return { success: true };
      }
      
      // Método 5: Añadir directamente al canvas
      const workflowCanvas = document.querySelector('.workflow-canvas') || 
                            document.querySelector('.n8n-workflow') ||
                            document.querySelector('#workflow-canvas');
                            
      if (workflowCanvas && workflowCanvas.__vue__ && typeof workflowCanvas.__vue__.addConnection === 'function') {
        workflowCanvas.__vue__.addConnection(data);
        return { success: true };
      }
      
      return { success: false, error: 'No se pudo añadir la conexión con ningún método disponible' };
    }
    
    /**
     * Elimina una conexión
     * @param {Object} n8nInstance - Instancia de n8n
     * @param {Object} connectionId - ID o datos de la conexión a eliminar
     * @returns {Object} - Resultado de la operación
     */
    function removeConnection(n8nInstance, connectionId) {
      // Intentar diferentes métodos para eliminar conexión
      
      // Método 1: A través del store
      if (n8nInstance.$store && n8nInstance.$store.dispatch) {
        n8nInstance.$store.dispatch('workflows/removeConnection', { connectionId });
        return { success: true };
      }
      
      // Método 2: Usando el store desde Vue
      const vueInstance = findVueInstance();
      if (vueInstance && vueInstance.$store) {
        vueInstance.$store.dispatch('workflows/removeConnection', { connectionId });
        return { success: true };
      }
      
      // Método 3: A través de alguna API más reciente
      if (window.n8nWorkflowHelpers && window.n8nWorkflowHelpers.removeConnection) {
        window.n8nWorkflowHelpers.removeConnection(connectionId);
        return { success: true };
      }
      
      // Método 4: Eliminar directamente del canvas
      const workflowCanvas = document.querySelector('.workflow-canvas') || 
                            document.querySelector('.n8n-workflow') ||
                            document.querySelector('#workflow-canvas');
                            
      if (workflowCanvas && workflowCanvas.__vue__ && typeof workflowCanvas.__vue__.removeConnection === 'function') {
        workflowCanvas.__vue__.removeConnection(connectionId);
        return { success: true };
      }
      
      return { success: false, error: 'No se pudo eliminar la conexión con ningún método disponible' };
    }
    
    // ----- ESCUCHAR EVENTOS DESDE CONTENT SCRIPT -----
    
    // Escuchar evento para aplicar workflow
    window.addEventListener('n8nApplyWorkflow', function(event) {
      const { workflow, callId } = event.detail;
      
      // Aplicar workflow
      const result = applyGeneratedWorkflow(workflow);
      
      // Enviar respuesta
      window.dispatchEvent(new CustomEvent(callId, {
        detail: result
      }));
    });
    
    // Escuchar evento para aplicar cambios
    window.addEventListener('n8nApplyChanges', function(event) {
      const { changes, originalWorkflow, callId } = event.detail;
      
      // Aplicar cambios
      const result = applyWorkflowChanges(changes, originalWorkflow);
      
      // Enviar respuesta
      window.dispatchEvent(new CustomEvent(callId, {
        detail: result
      }));
    });
    
    // Exponer funciones globalmente para debugging (sólo en desarrollo)
    if (location.hostname === 'localhost' || location.hostname.includes('127.0.0.1')) {
      window.n8nAIAssistant = {
        applyGeneratedWorkflow,
        applyWorkflowChanges,
        findN8nInstance,
        findVueInstance
      };
    }
  })();