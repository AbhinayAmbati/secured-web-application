// Device key management and DPoP utilities for the frontend

// Generate a new ECDSA P-256 key pair for device binding
export const generateDeviceKeyPair = async () => {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256"
      },
      true, // extractable
      ["sign", "verify"]
    );

    // Export public key as JWK
    const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    
    // Store private key in IndexedDB
    const keyId = crypto.randomUUID();
    await storePrivateKey(keyId, keyPair.privateKey);

    return {
      keyId,
      publicKeyJwk,
      privateKey: keyPair.privateKey
    };
  } catch (error) {
    console.error('Failed to generate device key pair:', error);
    throw new Error('Device key generation failed');
  }
};

// Store private key in IndexedDB
const storePrivateKey = async (keyId, privateKey) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DeviceKeys', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys', { keyPath: 'keyId' });
      }
    };
    
    request.onsuccess = async (event) => {
      const db = event.target.result;
      
      try {
        // Export private key for storage
        const keyData = await crypto.subtle.exportKey('jwk', privateKey);
        
        const transaction = db.transaction(['keys'], 'readwrite');
        const store = transaction.objectStore('keys');
        
        store.put({
          keyId,
          keyData,
          createdAt: new Date().toISOString()
        });
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (error) {
        reject(error);
      }
    };
  });
};

// Security alert dispatcher
const dispatchSecurityAlert = (type, details = {}) => {
  window.dispatchEvent(new CustomEvent('security-alert', {
    detail: { type, details, timestamp: Date.now() }
  }));
};

// Test function to manually trigger security alerts (for development/testing)
export const testSecurityAlert = (type = 'indexeddb_tampering') => {
  console.log(`🧪 Testing security alert: ${type}`);
  dispatchSecurityAlert(type, { test: true, keyId: 'test-key-id' });
};

// Retrieve private key from IndexedDB
export const getPrivateKey = async (keyId) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DeviceKeys', 1);

    request.onerror = () => {
      console.error('IndexedDB access failed - potential tampering detected');
      dispatchSecurityAlert('indexeddb_access_failed', { keyId });
      reject(request.error);
    };

    request.onsuccess = async (event) => {
      const db = event.target.result;

      try {
        // Check if the object store exists
        if (!db.objectStoreNames.contains('keys')) {
          console.error('Object store missing - database tampering detected');
          dispatchSecurityAlert('indexeddb_tampering', {
            keyId,
            availableStores: Array.from(db.objectStoreNames)
          });
          reject(new Error('Database structure compromised'));
          return;
        }

        const transaction = db.transaction(['keys'], 'readonly');
        const store = transaction.objectStore('keys');
        const getRequest = store.get(keyId);

        transaction.onerror = () => {
          console.error('Transaction failed - potential database corruption');
          dispatchSecurityAlert('transaction_failed', { keyId });
          reject(new Error('Database transaction failed'));
        };
      
        getRequest.onsuccess = async () => {
          const result = getRequest.result;
          if (!result) {
            console.warn('Private key not found - potential key theft attempt');
            dispatchSecurityAlert('private_key_missing', { keyId });
            reject(new Error('Private key not found'));
            return;
          }

          try {
            // Import private key from stored data
            const privateKey = await crypto.subtle.importKey(
              'jwk',
              result.keyData,
              {
                name: 'ECDSA',
                namedCurve: 'P-256'
              },
              false,
              ['sign']
            );

            resolve(privateKey);
          } catch (error) {
            console.error('Private key import failed:', error);
            dispatchSecurityAlert('key_import_failed', { keyId, error: error.message });
            reject(error);
          }
        };

        getRequest.onerror = () => {
          console.error('Private key retrieval failed');
          dispatchSecurityAlert('key_retrieval_failed', { keyId });
          reject(new Error('Failed to retrieve private key'));
        };

      } catch (error) {
        console.error('IndexedDB operation failed:', error);
        dispatchSecurityAlert('indexeddb_operation_failed', { keyId, error: error.message });
        reject(new Error('Database operation failed'));
      }
    };
  });
};

// Generate DPoP proof for API requests
export const generateDPoPProof = async (url, method, privateKey) => {
  try {
    const header = {
      alg: "ES256",
      typ: "dpop+jwt"
    };

    const payload = {
      htu: url,
      htm: method.toUpperCase(),
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID()
    };

    // Create JWT manually
    const encoder = new TextEncoder();
    
    // Encode header and payload
    const headerB64 = btoa(JSON.stringify(header))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    const payloadB64 = btoa(JSON.stringify(payload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Create signature input
    const signatureInput = `${headerB64}.${payloadB64}`;
    const signatureInputBytes = encoder.encode(signatureInput);

    // Sign with private key
    const signature = await crypto.subtle.sign(
      {
        name: "ECDSA",
        hash: "SHA-256"
      },
      privateKey,
      signatureInputBytes
    );

    // Convert signature to base64url
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return `${headerB64}.${payloadB64}.${signatureB64}`;
  } catch (error) {
    console.error('DPoP proof generation failed:', error);
    throw new Error('Failed to generate DPoP proof');
  }
};

// Clean up old device keys from IndexedDB
export const cleanupOldKeys = async (maxAge = 30 * 24 * 60 * 60 * 1000) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DeviceKeys', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['keys'], 'readwrite');
      const store = transaction.objectStore('keys');
      
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        const keys = getAllRequest.result;
        const cutoffDate = new Date(Date.now() - maxAge);
        
        keys.forEach(key => {
          const createdAt = new Date(key.createdAt);
          if (createdAt < cutoffDate) {
            store.delete(key.keyId);
          }
        });
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
      
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
  });
};

// Delete a specific device key
export const deleteDeviceKey = async (keyId) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DeviceKeys', 1);

    request.onerror = () => {
      console.error('IndexedDB access failed during key deletion');
      dispatchSecurityAlert('indexeddb_delete_failed', { keyId });
      reject(request.error);
    };

    request.onsuccess = (event) => {
      try {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('keys')) {
          console.error('Object store missing during key deletion');
          dispatchSecurityAlert('store_missing_on_delete', { keyId });
          reject(new Error('Database structure compromised'));
          return;
        }

        const transaction = db.transaction(['keys'], 'readwrite');
        const store = transaction.objectStore('keys');

        const deleteRequest = store.delete(keyId);

        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => {
          console.error('Key deletion failed');
          dispatchSecurityAlert('key_delete_failed', { keyId });
          reject(deleteRequest.error);
        };

        transaction.onerror = () => {
          console.error('Delete transaction failed');
          dispatchSecurityAlert('delete_transaction_failed', { keyId });
          reject(new Error('Delete transaction failed'));
        };

      } catch (error) {
        console.error('Key deletion operation failed:', error);
        dispatchSecurityAlert('key_deletion_operation_failed', { keyId, error: error.message });
        reject(error);
      }
    };
  });
};

// List all stored device keys
export const listDeviceKeys = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DeviceKeys', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['keys'], 'readonly');
      const store = transaction.objectStore('keys');
      
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        const keys = getAllRequest.result.map(key => ({
          keyId: key.keyId,
          createdAt: key.createdAt
        }));
        resolve(keys);
      };
      
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
  });
};
