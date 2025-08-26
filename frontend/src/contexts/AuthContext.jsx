import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authAPI, setAccessToken, setDeviceKeyId, clearAuth, apiUtils } from '../utils/api.js';
import { generateDeviceKeyPair, deleteDeviceKey } from '../utils/crypto.js';
import { generateFingerprint, storeFingerprint } from '../utils/fingerprint.js';

// Auth context
const AuthContext = createContext();

// Auth states
const AUTH_STATES = {
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  ERROR: 'error'
};

// Initial state
const initialState = {
  status: AUTH_STATES.LOADING,
  user: null,
  error: null,
  deviceKeyId: null
};

// Auth reducer
const authReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        status: AUTH_STATES.LOADING,
        error: null
      };

    case 'SET_AUTHENTICATED':
      return {
        ...state,
        status: AUTH_STATES.AUTHENTICATED,
        user: action.payload.user,
        deviceKeyId: action.payload.deviceKeyId,
        error: null
      };

    case 'SET_UNAUTHENTICATED':
      return {
        ...state,
        status: AUTH_STATES.UNAUTHENTICATED,
        user: null,
        deviceKeyId: null,
        error: null
      };

    case 'SET_ERROR':
      return {
        ...state,
        status: AUTH_STATES.ERROR,
        error: action.payload
      };

    case 'UPDATE_USER':
      return {
        ...state,
        user: { ...state.user, ...action.payload }
      };

    default:
      return state;
  }
};

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize authentication on app start
  useEffect(() => {
    initializeAuth();
  }, []);

  // Security alert for unauthorized access attempts
  const showSecurityAlert = (alertType = 'general', details = {}) => {
    // Get alert-specific messages
    const getAlertInfo = (type) => {
      const alerts = {
        'token-theft-attempt': {
          title: 'Token Theft Attempt Detected',
          description: 'Invalid session credentials detected',
          technical: 'DPoP authentication validation failed'
        },
        'indexeddb_tampering': {
          title: 'Database Tampering Detected',
          description: 'Security database has been modified',
          technical: 'IndexedDB object store structure compromised'
        },
        'indexeddb_access_failed': {
          title: 'Database Access Blocked',
          description: 'Security database cannot be accessed',
          technical: 'IndexedDB access denied or corrupted'
        },
        'private_key_missing': {
          title: 'Security Key Missing',
          description: 'Device security key has been removed',
          technical: 'Private key not found in secure storage'
        },
        'transaction_failed': {
          title: 'Database Transaction Failed',
          description: 'Security database operation blocked',
          technical: 'IndexedDB transaction error detected'
        },
        'indexeddb_store_failed': {
          title: 'Security Key Storage Failed',
          description: 'Unable to store security credentials',
          technical: 'IndexedDB write operation blocked'
        },
        'key_delete_failed': {
          title: 'Key Deletion Blocked',
          description: 'Security key removal was prevented',
          technical: 'IndexedDB delete operation failed'
        },
        'general': {
          title: 'Security Alert',
          description: 'Unauthorized access attempt detected',
          technical: 'Multiple security violations detected'
        }
      };
      return alerts[type] || alerts['general'];
    };

    const alertInfo = getAlertInfo(alertType);

    // Professional console message for security logs
    console.warn(`
    SECURITY ALERT - ${alertInfo.title}

    Timestamp: ${new Date().toISOString()}
    Event: ${alertInfo.description}
    Action: Access denied, session terminated

    Technical Details:
    • ${alertInfo.technical}
    • Session tokens invalidated
    • User redirected to authentication

    Security Measures Activated:
    • Invalid session data cleared
    • Security incident logged
    • Enhanced monitoring activated
    `);

    // Create a professional security alert dialog
    const alertDiv = document.createElement('div');
    alertDiv.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.75);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      ">
        <div style="
          background: #ffffff;
          padding: 2.5rem;
          border-radius: 12px;
          text-align: left;
          color: #1f2937;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          max-width: 480px;
          width: 90%;
          animation: slideIn 0.3s ease-out;
          border: 1px solid #e5e7eb;
        ">
          <div style="display: flex; align-items: center; margin-bottom: 1.5rem;">
            <div style="
              width: 48px;
              height: 48px;
              background: #fef2f2;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-right: 1rem;
            ">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M12 8v4"/>
                <path d="M12 16h.01"/>
              </svg>
            </div>
            <div>
              <h2 style="margin: 0; font-size: 1.25rem; font-weight: 600; color: #111827;">
                ${alertInfo.title}
              </h2>
              <p style="margin: 0; font-size: 0.875rem; color: #6b7280;">
                ${alertInfo.description}
              </p>
            </div>
          </div>

          <div style="margin-bottom: 1.5rem;">
            <p style="margin: 0 0 1rem 0; font-size: 0.95rem; color: #374151; line-height: 1.5;">
              ${alertInfo.description}. This security incident has been logged and appropriate measures have been taken.
            </p>
            <div style="background: #f9fafb; padding: 1rem; border-radius: 8px; border-left: 4px solid #dc2626;">
              <p style="margin: 0; font-size: 0.875rem; color: #4b5563; font-weight: 500;">
                <strong>Security Measures Activated:</strong>
              </p>
              <ul style="margin: 0.5rem 0 0 0; padding-left: 1.25rem; font-size: 0.875rem; color: #6b7280;">
                <li>${alertInfo.technical}</li>
                <li>Session terminated and cleared</li>
                <li>Enhanced security monitoring activated</li>
                <li>Access attempt logged for review</li>
              </ul>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
            <button onclick="this.parentElement.parentElement.parentElement.parentElement.remove()" style="
              background: #dc2626;
              border: none;
              color: white;
              padding: 0.75rem 1.5rem;
              border-radius: 6px;
              font-size: 0.875rem;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s;
            " onmouseover="this.style.background='#b91c1c'" onmouseout="this.style.background='#dc2626'">
              Acknowledge
            </button>
          </div>
        </div>
      </div>
      <style>
        @keyframes slideIn {
          from { transform: translateY(-20px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      </style>
    `;

    document.body.appendChild(alertDiv);

    // Auto-remove after 15 seconds for professional UX
    setTimeout(() => {
      if (alertDiv.parentElement) {
        alertDiv.remove();
      }
    }, 15000);
  };

  const initializeAuth = async () => {
    try {
      dispatch({ type: 'SET_LOADING' });

      // Check if we have stored device key ID (indicates previous login)
      const storedDeviceKeyId = localStorage.getItem('deviceKeyId');

      if (!storedDeviceKeyId) {
        // No stored device key ID, user needs to login
        dispatch({ type: 'SET_UNAUTHENTICATED' });
        return;
      }

      // Try to refresh token to check if we're still authenticated
      const response = await authAPI.refresh();

      // Set the access token AND device key BEFORE making any other API calls
      setAccessToken(response.accessToken);
      setDeviceKeyId(storedDeviceKeyId);

      // Now we can safely get the profile (with auth headers)
      const profile = await authAPI.getProfile();

      dispatch({
        type: 'SET_AUTHENTICATED',
        payload: {
          user: profile.user,
          deviceKeyId: storedDeviceKeyId
        }
      });
    } catch (error) {
      console.error('Auth initialization failed:', error);

      // Check if this is a security-related error (token theft attempt)
      if (error.message?.includes('Private key not found') ||
          error.message?.includes('Device key not found')) {
        // Show security alert for potential token theft
        showSecurityAlert();
      }

      // Clear any invalid stored data
      localStorage.removeItem('deviceKeyId');
      clearAuth();
      dispatch({ type: 'SET_UNAUTHENTICATED' });
    }
  };

  // Listen for auth failures
  useEffect(() => {
    const handleAuthFailed = () => {
      dispatch({ type: 'SET_UNAUTHENTICATED' });
    };

    const handleSecurityAlert = (event) => {
      const alertType = event.detail?.type;

      // Handle different types of security alerts
      const securityAlertTypes = [
        'token-theft-attempt',
        'indexeddb_tampering',
        'indexeddb_access_failed',
        'private_key_missing',
        'transaction_failed',
        'indexeddb_operation_failed',
        'indexeddb_store_failed',
        'key_delete_failed',
        'store_missing_on_delete',
        'delete_transaction_failed',
        'key_deletion_operation_failed'
      ];

      if (securityAlertTypes.includes(alertType)) {
        showSecurityAlert(alertType, event.detail);
      }
    };

    window.addEventListener('auth-failed', handleAuthFailed);
    window.addEventListener('security-alert', handleSecurityAlert);

    return () => {
      window.removeEventListener('auth-failed', handleAuthFailed);
      window.removeEventListener('security-alert', handleSecurityAlert);
    };
  }, []);

  const login = async (credentials) => {
    try {
      dispatch({ type: 'SET_LOADING' });

      // Generate device key pair for this login session
      const { keyId, publicKeyJwk } = await generateDeviceKeyPair();

      // Generate fingerprint
      const fingerprint = await generateFingerprint();
      storeFingerprint(fingerprint);

      // Login with device key and fingerprint
      const response = await authAPI.login({
        ...credentials,
        publicKeyJwk,
        fingerprint
      });

      // Store authentication data
      setAccessToken(response.accessToken);
      setDeviceKeyId(keyId);
      localStorage.setItem('deviceKeyId', keyId);

      dispatch({
        type: 'SET_AUTHENTICATED',
        payload: {
          user: response.user,
          deviceKeyId: keyId
        }
      });

      return { success: true, data: response };
    } catch (error) {
      const errorInfo = apiUtils.handleError(error);
      dispatch({ type: 'SET_ERROR', payload: errorInfo.message });
      return { success: false, error: errorInfo };
    }
  };

  const register = async (userData) => {
    try {
      dispatch({ type: 'SET_LOADING' });

      // Generate device key pair for this registration
      const { keyId, publicKeyJwk } = await generateDeviceKeyPair();

      // Generate fingerprint
      const fingerprint = await generateFingerprint();
      storeFingerprint(fingerprint);

      // Register with device key and fingerprint
      const response = await authAPI.register({
        ...userData,
        publicKeyJwk,
        fingerprint
      });

      // Registration successful - don't auto-login, let user login manually
      // Clear any stored auth data from registration
      clearAuth();

      // Set back to unauthenticated state
      dispatch({ type: 'SET_UNAUTHENTICATED' });

      return { success: true, data: response };
    } catch (error) {
      const errorInfo = apiUtils.handleError(error);
      dispatch({ type: 'SET_ERROR', payload: errorInfo.message });
      return { success: false, error: errorInfo };
    }
  };

  const logout = async () => {
    try {
      // Try to logout from server
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local auth data regardless of server response
      clearAuth();
      dispatch({ type: 'SET_UNAUTHENTICATED' });
    }
  };

  const value = {
    // State
    ...state,
    isAuthenticated: state.status === AUTH_STATES.AUTHENTICATED,
    isLoading: state.status === AUTH_STATES.LOADING,

    // Actions
    register,
    login,
    logout,
    refreshProfile: async () => {},

    // Utilities
    clearError: () => dispatch({ type: 'SET_ERROR', payload: null })
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
