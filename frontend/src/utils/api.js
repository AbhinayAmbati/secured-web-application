import axios from 'axios';
import { generateDPoPProof, getPrivateKey } from './crypto.js';
import { generateFingerprint, validateFingerprint } from './fingerprint.js';

// API base configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Include cookies for refresh tokens
  timeout: 10000,
});

// Token storage
let accessToken = null;
let currentDeviceKeyId = null;
let refreshPromise = null; // Track ongoing refresh attempts

// Set access token
export const setAccessToken = (token) => {
  accessToken = token;
};

// Set device key ID
export const setDeviceKeyId = (keyId) => {
  currentDeviceKeyId = keyId;
};

// Get current access token
export const getAccessToken = () => accessToken;

// Get current device key ID
export const getDeviceKeyId = () => currentDeviceKeyId;

// Clear authentication data
export const clearAuth = () => {
  accessToken = null;
  currentDeviceKeyId = null;
};

// Request interceptor to add authentication headers
apiClient.interceptors.request.use(
  async (config) => {
    try {
      // Add fingerprint header
      const fingerprint = await generateFingerprint();
      if (validateFingerprint(fingerprint)) {
        config.headers['X-Fingerprint'] = JSON.stringify(fingerprint);
      }

      // Add authentication headers if we have a token and device key
      if (accessToken && currentDeviceKeyId) {
        // Get private key for DPoP proof
        const privateKey = await getPrivateKey(currentDeviceKeyId);

        // Generate full URL for DPoP including query parameters
        let fullUrl = `${config.baseURL}${config.url}`;

        // Add query parameters if they exist
        if (config.params) {
          const searchParams = new URLSearchParams(config.params);
          const queryString = searchParams.toString();
          if (queryString) {
            fullUrl += `?${queryString}`;
          }
        }

        const method = config.method.toUpperCase();



        // Generate DPoP proof
        const dpopProof = await generateDPoPProof(fullUrl, method, privateKey);

        // Add headers
        config.headers['Authorization'] = `Bearer ${accessToken}`;
        config.headers['DPoP'] = dpopProof;
      }

      return config;
    } catch (error) {
      console.error('Request interceptor error:', error);

      // Check for security-related errors (potential token theft)
      if (error.message?.includes('Private key not found') ||
          error.message?.includes('Device key not found')) {
        // Dispatch a custom event that the AuthContext can listen to
        window.dispatchEvent(new CustomEvent('security-alert', {
          detail: { type: 'token-theft-attempt', error: error.message }
        }));
      }

      return Promise.reject(error);
    }
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If we get a 401 and haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh the token
        const response = await apiClient.post('/auth/refresh');
        const { accessToken: newToken } = response.data;

        // Update stored token
        setAccessToken(newToken);

        // Retry the original request
        return apiClient(originalRequest);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);

        // Only dispatch auth-failed for actual authentication errors
        if (refreshError.response?.status === 401 || refreshError.response?.status === 403) {
          clearAuth();
          window.dispatchEvent(new CustomEvent('auth-failed'));
        }

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Authentication API calls
export const authAPI = {
  // Register new user
  register: async (userData) => {
    const response = await apiClient.post('/auth/register', userData);
    return response.data;
  },

  // Login user
  login: async (credentials) => {
    const response = await apiClient.post('/auth/login', credentials);
    return response.data;
  },

  // Refresh access token
  refresh: async () => {
    // If there's already a refresh in progress, wait for it
    if (refreshPromise) {
      return refreshPromise;
    }

    // Start new refresh
    refreshPromise = apiClient.post('/auth/refresh').then(response => {
      refreshPromise = null; // Clear the promise when done
      return response.data;
    }).catch(error => {
      refreshPromise = null; // Clear the promise on error too
      throw error;
    });

    return refreshPromise;
  },

  // Logout user
  logout: async () => {
    const response = await apiClient.post('/auth/logout');
    clearAuth();
    return response.data;
  },

  // Get user profile
  getProfile: async () => {
    const response = await apiClient.get('/auth/profile');
    return response.data;
  },

  // Revoke device key
  revokeDevice: async (keyId) => {
    const response = await apiClient.delete(`/auth/device/${keyId}`);
    return response.data;
  }
};

// CRUD API calls
export const crudAPI = {
  // Get all posts
  getPosts: async (params = {}) => {
    const response = await apiClient.get('/crud/posts', { params });
    return response.data;
  },

  // Get specific post
  getPost: async (id) => {
    const response = await apiClient.get(`/crud/posts/${id}`);
    return response.data;
  },

  // Create new post
  createPost: async (postData) => {
    const response = await apiClient.post('/crud/posts', postData);
    return response.data;
  },

  // Update post
  updatePost: async (id, postData) => {
    const response = await apiClient.put(`/crud/posts/${id}`, postData);
    return response.data;
  },

  // Delete post
  deletePost: async (id) => {
    const response = await apiClient.delete(`/crud/posts/${id}`);
    return response.data;
  },

  // Get user statistics
  getStats: async () => {
    const response = await apiClient.get('/crud/stats');
    return response.data;
  }
};

// Utility functions
export const apiUtils = {
  // Check if user is authenticated
  isAuthenticated: () => {
    return !!(accessToken && currentDeviceKeyId);
  },

  // Initialize authentication from stored data
  initAuth: async () => {
    try {
      // Check if we have stored device key ID (indicates previous login)
      const storedDeviceKeyId = localStorage.getItem('deviceKeyId');

      if (!storedDeviceKeyId) {
        // No stored device key ID, user needs to login
        return false;
      }

      // Try to refresh token to check if we're still authenticated
      // This will use the httpOnly refresh token cookie
      const response = await authAPI.refresh();

      // Set the access token AND device key BEFORE making any other API calls
      setAccessToken(response.accessToken);
      setDeviceKeyId(storedDeviceKeyId);

      // Now we can safely get the profile (with auth headers)
      const profile = await authAPI.getProfile();

      return true;
    } catch (error) {
      console.error('Auth initialization failed:', error);
      clearAuth();
      return false;
    }
  },

  // Handle API errors
  handleError: (error) => {
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      
      switch (status) {
        case 400:
          return { message: data.error || 'Invalid request', type: 'validation' };
        case 401:
          return { message: 'Authentication required', type: 'auth' };
        case 403:
          return { message: 'Access denied', type: 'permission' };
        case 404:
          return { message: 'Resource not found', type: 'notfound' };
        case 409:
          return { message: data.error || 'Conflict', type: 'conflict' };
        case 429:
          return { message: 'Too many requests. Please try again later.', type: 'ratelimit' };
        case 500:
          return { message: 'Server error. Please try again later.', type: 'server' };
        default:
          return { message: data.error || 'An error occurred', type: 'unknown' };
      }
    } else if (error.request) {
      // Network error
      return { message: 'Network error. Please check your connection.', type: 'network' };
    } else {
      // Other error
      return { message: error.message || 'An unexpected error occurred', type: 'unknown' };
    }
  }
};

export default apiClient;
