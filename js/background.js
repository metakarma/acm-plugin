/**
 * ACM Manager - Background Script
 * 
 * Responsible for:
 * - Initializing the database
 * - Handling messages from content scripts
 * - Managing storage operations
 */

// Initialize the extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('ACM Manager installed');
  initDatabase();
  
  // Suppress connector errors
  suppressConnectorErrors();
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background script received message:', message);
  
  if (message.action === 'saveACM') {
    saveACMToDatabase(message.data)
      .then(result => {
        console.log('ACM saved successfully:', result);
        sendResponse({ success: true, id: result });
      })
      .catch(error => {
        console.error('Error saving ACM:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates we will send a response asynchronously
  }
  
  if (message.action === 'getACMs') {
    getACMsFromDatabase(message.query)
      .then(acms => {
        sendResponse({ success: true, acms });
      })
      .catch(error => {
        console.error('Error retrieving ACMs:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'deleteACM') {
    deleteACMFromDatabase(message.id)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error deleting ACM:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'findConversationByUrl') {
    findConversationByUrl(message.url)
      .then(conversation => {
        sendResponse({ success: true, conversation });
      })
      .catch(error => {
        console.error('Error finding conversation by URL:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'clearAllACMs') {
    clearAllACMsFromDatabase()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error clearing all ACMs:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === 'settingsUpdated') {
    // Broadcast the settings update to all tabs with content scripts
    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated', settings: message.settings })
          .catch(error => {
            // Ignore errors for tabs where content script is not running
            console.log('Could not send settings update to tab:', tab.id);
          });
      });
    });
    
    sendResponse({ success: true });
    return true;
  }
});

/**
 * Database Functionality
 */

// Database configuration
const DB_NAME = 'acm-manager-db';
const DB_VERSION = 1;
const STORES = {
  acms: 'acms',
  attachments: 'attachments',
  metadata: 'metadata'
};

// Initialize the IndexedDB database
function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = event => {
      console.error('Error opening database:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = event => {
      console.log('Database initialized successfully');
      resolve(event.target.result);
    };
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains(STORES.acms)) {
        const acmsStore = db.createObjectStore(STORES.acms, { keyPath: 'id' });
        acmsStore.createIndex('timestamp', 'timestamp', { unique: false });
        acmsStore.createIndex('sourceChatbot', 'sourceChatbot', { unique: false });
        acmsStore.createIndex('conversationUrl', 'conversationUrl', { unique: false });
      }
      
      if (!db.objectStoreNames.contains(STORES.attachments)) {
        const attachmentsStore = db.createObjectStore(STORES.attachments, { keyPath: 'id' });
        attachmentsStore.createIndex('acmId', 'acmId', { unique: false });
      }
      
      if (!db.objectStoreNames.contains(STORES.metadata)) {
        db.createObjectStore(STORES.metadata, { keyPath: 'key' });
      }
      
      console.log('Database setup complete');
    };
  });
}

// Open a connection to the database
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = event => {
      console.error('Error opening database:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = event => {
      resolve(event.target.result);
    };
  });
}

// Generate a unique ID for new ACMs
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Save an ACM to the database
async function saveACMToDatabase(acmData) {
  try {
    console.log('Background: Saving ACM to database', acmData);
    
    // Ensure the ACM has a unique ID
    if (!acmData.id) {
      acmData.id = generateUniqueId();
    }
    
    // Make sure timestamp is set
    if (!acmData.timestamp) {
      acmData.timestamp = new Date().toISOString();
    }
    
    // Ensure we have URL tracking
    if (!acmData.conversationUrl) {
      console.log('Background: No conversation URL provided, using generic identifier');
      acmData.conversationUrl = `generic-${acmData.sourceChatbot}-${Date.now()}`;
    }
    
    // Add current timestamp to each interaction if not present
    acmData.interactions.forEach(interaction => {
      if (!interaction.timestamp) {
        interaction.timestamp = new Date().toISOString();
      }
    });
    
    const db = await openDatabase();
    const transaction = db.transaction([STORES.acms, STORES.attachments], 'readwrite');
    const acmsStore = transaction.objectStore(STORES.acms);
    const attachmentsStore = transaction.objectStore(STORES.attachments);
    
    // Check if we're updating an existing conversation
    let isUpdate = false;
    try {
      const existingRequest = acmsStore.get(acmData.id);
      await new Promise((resolve, reject) => {
        existingRequest.onsuccess = () => resolve(existingRequest.result);
        existingRequest.onerror = (event) => reject(event.target.error);
      });
      
      if (existingRequest.result) {
        isUpdate = true;
        console.log('Background: Updating existing conversation:', acmData.id);
      }
    } catch (error) {
      console.log('Background: Error checking for existing conversation:', error);
      // Continue with save as new
    }
    
    // Process attachments if any
    const attachmentPromises = [];
    acmData.interactions.forEach(interaction => {
      if (interaction.attachments && interaction.attachments.length > 0) {
        interaction.attachments.forEach(attachment => {
          if (!attachment.id) {
            attachment.id = generateUniqueId();
          }
          attachment.acmId = acmData.id;
          
          const attachmentPromise = new Promise((resolve, reject) => {
            const attachmentRequest = attachmentsStore.add(attachment);
            attachmentRequest.onsuccess = () => resolve(attachment.id);
            attachmentRequest.onerror = event => reject(event.target.error);
          });
          
          attachmentPromises.push(attachmentPromise);
        });
      }
    });
    
    // Wait for all attachments to be saved
    await Promise.all(attachmentPromises);
    console.log('Background: Attachments saved successfully');
    
    // Save the ACM
    return new Promise((resolve, reject) => {
      let acmRequest;
      
      if (isUpdate) {
        // If updating, use put instead of add
        acmRequest = acmsStore.put(acmData);
      } else {
        acmRequest = acmsStore.add(acmData);
      }
      
      acmRequest.onsuccess = () => {
        console.log('Background: ACM saved with ID:', acmData.id, 'and', acmData.interactions.length, 'interactions');
        
        // Update session count
        chrome.storage.local.get(['sessionCount'], (result) => {
          const currentCount = result.sessionCount || 0;
          chrome.storage.local.set({ sessionCount: currentCount + 1 });
          console.log('Background: Updated session count to', currentCount + 1);
        });
        
        resolve(acmData.id);
      };
      
      acmRequest.onerror = event => {
        console.error('Background: Error saving ACM:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Background: Error in saveACMToDatabase:', error);
    throw error;
  }
}

// Retrieve ACMs from the database based on query parameters
async function getACMsFromDatabase(query = {}) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORES.acms], 'readonly');
    const acmsStore = transaction.objectStore(STORES.acms);
    
    // Get all ACMs and filter based on query
    return new Promise((resolve, reject) => {
      const acmsRequest = acmsStore.getAll();
      
      acmsRequest.onsuccess = () => {
        let acms = acmsRequest.result;
        
        // Apply filters if provided
        if (query.sourceChatbot) {
          acms = acms.filter(acm => acm.sourceChatbot === query.sourceChatbot);
        }
        
        if (query.fromDate) {
          const fromDate = new Date(query.fromDate).getTime();
          acms = acms.filter(acm => new Date(acm.timestamp).getTime() >= fromDate);
        }
        
        if (query.toDate) {
          const toDate = new Date(query.toDate).getTime();
          acms = acms.filter(acm => new Date(acm.timestamp).getTime() <= toDate);
        }
        
        // Sort by timestamp (newest first)
        acms.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        resolve(acms);
      };
      
      acmsRequest.onerror = event => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Error in getACMsFromDatabase:', error);
    throw error;
  }
}

// Delete an ACM from the database
async function deleteACMFromDatabase(acmId) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORES.acms, STORES.attachments], 'readwrite');
    const acmsStore = transaction.objectStore(STORES.acms);
    const attachmentsStore = transaction.objectStore(STORES.attachments);
    
    // Delete the ACM
    const acmDeletePromise = new Promise((resolve, reject) => {
      const acmRequest = acmsStore.delete(acmId);
      acmRequest.onsuccess = () => resolve();
      acmRequest.onerror = event => reject(event.target.error);
    });
    
    // Delete associated attachments
    const attachmentsIndex = attachmentsStore.index('acmId');
    const attachmentsRequest = attachmentsIndex.getAll(acmId);
    
    const attachmentsDeletePromise = new Promise((resolve, reject) => {
      attachmentsRequest.onsuccess = () => {
        const attachments = attachmentsRequest.result;
        const deletePromises = attachments.map(attachment => 
          new Promise((resolveDelete, rejectDelete) => {
            const deleteRequest = attachmentsStore.delete(attachment.id);
            deleteRequest.onsuccess = () => resolveDelete();
            deleteRequest.onerror = event => rejectDelete(event.target.error);
          })
        );
        
        Promise.all(deletePromises)
          .then(() => resolve())
          .catch(error => reject(error));
      };
      
      attachmentsRequest.onerror = event => {
        reject(event.target.error);
      };
    });
    
    // Wait for both operations to complete
    await Promise.all([acmDeletePromise, attachmentsDeletePromise]);
    console.log('ACM and attachments deleted successfully:', acmId);
    return true;
  } catch (error) {
    console.error('Error in deleteACMFromDatabase:', error);
    throw error;
  }
}

// Clear all ACMs from the database
async function clearAllACMsFromDatabase() {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORES.acms, STORES.attachments], 'readwrite');
    const acmsStore = transaction.objectStore(STORES.acms);
    const attachmentsStore = transaction.objectStore(STORES.attachments);
    
    // Clear all ACMs
    const acmsClearPromise = new Promise((resolve, reject) => {
      const acmRequest = acmsStore.clear();
      acmRequest.onsuccess = () => resolve();
      acmRequest.onerror = event => reject(event.target.error);
    });
    
    // Clear all attachments
    const attachmentsClearPromise = new Promise((resolve, reject) => {
      const attachmentsRequest = attachmentsStore.clear();
      attachmentsRequest.onsuccess = () => resolve();
      attachmentsRequest.onerror = event => reject(event.target.error);
    });
    
    // Reset session counter
    chrome.storage.local.set({ sessionCount: 0 });
    
    // Wait for both operations to complete
    await Promise.all([acmsClearPromise, attachmentsClearPromise]);
    console.log('All ACMs and attachments cleared successfully');
    return true;
  } catch (error) {
    console.error('Error in clearAllACMsFromDatabase:', error);
    throw error;
  }
}

// Find a conversation by its URL
async function findConversationByUrl(url) {
  try {
    console.log('Background: Looking for conversation with URL:', url);
    
    // If URL is not provided, return null
    if (!url) {
      console.log('Background: No URL provided');
      return null;
    }
    
    const db = await openDatabase();
    const transaction = db.transaction([STORES.acms], 'readonly');
    const acmsStore = transaction.objectStore(STORES.acms);
    
    // Use the conversationUrl index to directly query by URL
    const urlIndex = acmsStore.index('conversationUrl');
    
    return new Promise((resolve, reject) => {
      const request = urlIndex.get(url);
      
      request.onsuccess = () => {
        const conversation = request.result;
        if (conversation) {
          console.log('Background: Found conversation with matching URL:', conversation.id);
          resolve(conversation);
        } else {
          console.log('Background: No conversation found with URL:', url);
          resolve(null);
        }
      };
      
      request.onerror = event => {
        console.error('Background: Error retrieving conversation by URL:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Background: Error in findConversationByUrl:', error);
    
    // Fallback to the original method if the index lookup fails
    console.log('Background: Falling back to full scan method');
    
    try {
      const db = await openDatabase();
      const transaction = db.transaction([STORES.acms], 'readonly');
      const acmsStore = transaction.objectStore(STORES.acms);
      
      // Get all ACMs and find the one with the matching URL
      return new Promise((resolve, reject) => {
        const acmsRequest = acmsStore.getAll();
        
        acmsRequest.onsuccess = () => {
          const acms = acmsRequest.result;
          const matchingAcm = acms.find(acm => acm.conversationUrl === url);
          
          if (matchingAcm) {
            console.log('Background: Found conversation with matching URL (fallback):', matchingAcm.id);
            resolve(matchingAcm);
          } else {
            console.log('Background: No conversation found with URL (fallback):', url);
            resolve(null);
          }
        };
        
        acmsRequest.onerror = event => {
          console.error('Background: Error retrieving ACMs (fallback):', event.target.error);
          reject(event.target.error);
        };
      });
    } catch (fallbackError) {
      console.error('Background: Error in findConversationByUrl fallback:', fallbackError);
      throw fallbackError;
    }
  }
}

// Function to suppress connector errors that might be logged to the console
function suppressConnectorErrors() {
  // Store the original console.error function
  const originalConsoleError = console.error;
  
  // Override console.error to filter out specific error messages
  console.error = function(...args) {
    // Check if this is a connector error we want to suppress
    if (args.length > 0 && typeof args[0] === 'string') {
      if (args[0].includes('Error fetching connectors') ||
          args[0].includes('Error fetching connector connections')) {
        // Ignore these specific errors
        return;
      }
    }
    
    // For all other errors, use the original console.error
    originalConsoleError.apply(console, args);
  };
} 