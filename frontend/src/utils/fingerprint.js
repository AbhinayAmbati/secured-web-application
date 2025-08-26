// Browser fingerprinting utilities for device identification

// Generate a soft fingerprint from browser characteristics
export const generateFingerprint = async () => {
  try {
    const fingerprint = {
      // User agent
      ua: navigator.userAgent,
      
      // Languages
      lang: navigator.languages ? navigator.languages.join(',') : navigator.language,
      
      // Timezone
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      
      // Screen resolution and pixel ratio
      scr: `${screen.width}x${screen.height}@${window.devicePixelRatio}`,
      
      // Hardware concurrency
      hwc: navigator.hardwareConcurrency || 0,
      
      // Device memory (if available)
      mem: navigator.deviceMemory || 0,
      
      // Platform
      platform: navigator.platform,
    };

    // Add WebGL info if available (optional, privacy-sensitive)
    try {
      const webglInfo = getWebGLInfo();
      if (webglInfo) {
        fingerprint.webgl = webglInfo;
      }
    } catch (error) {
      // WebGL not available or blocked
      fingerprint.webgl = '';
    }

    return fingerprint;
  } catch (error) {
    console.error('Fingerprint generation failed:', error);
    throw new Error('Failed to generate fingerprint');
  }
};

// Get WebGL renderer information (privacy-sensitive)
const getWebGLInfo = () => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
      return null;
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) {
      return null;
    }

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    // Clean up
    canvas.remove();
    
    return `${vendor}|${renderer}`;
  } catch (error) {
    return null;
  }
};

// Validate fingerprint data before sending
export const validateFingerprint = (fingerprint) => {
  if (!fingerprint || typeof fingerprint !== 'object') {
    return false;
  }

  // Check required fields
  const requiredFields = ['ua', 'lang', 'tz', 'scr'];
  for (const field of requiredFields) {
    if (!(field in fingerprint) || typeof fingerprint[field] !== 'string') {
      return false;
    }
  }

  // Validate data ranges
  if (fingerprint.ua.length > 500) return false;
  if (fingerprint.lang.length > 100) return false;
  if (fingerprint.tz.length > 50) return false;
  if (fingerprint.scr.length > 20) return false;

  if (fingerprint.hwc !== undefined) {
    if (typeof fingerprint.hwc !== 'number' || fingerprint.hwc < 0 || fingerprint.hwc > 128) {
      return false;
    }
  }

  if (fingerprint.mem !== undefined) {
    if (typeof fingerprint.mem !== 'number' || fingerprint.mem < 0 || fingerprint.mem > 32) {
      return false;
    }
  }

  return true;
};

// Store fingerprint in localStorage for consistency
export const storeFingerprint = (fingerprint) => {
  try {
    localStorage.setItem('deviceFingerprint', JSON.stringify(fingerprint));
  } catch (error) {
    console.warn('Failed to store fingerprint:', error);
  }
};

// Retrieve stored fingerprint
export const getStoredFingerprint = () => {
  try {
    const stored = localStorage.getItem('deviceFingerprint');
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('Failed to retrieve stored fingerprint:', error);
    return null;
  }
};

// Compare current fingerprint with stored one
export const compareWithStored = async () => {
  try {
    const current = await generateFingerprint();
    const stored = getStoredFingerprint();
    
    if (!stored) {
      // First time, store current fingerprint
      storeFingerprint(current);
      return { isNew: true, current, stored: null, similar: false };
    }

    // Calculate similarity
    const similar = calculateSimilarity(stored, current);
    
    return {
      isNew: false,
      current,
      stored,
      similar: similar > 0.7 // 70% similarity threshold
    };
  } catch (error) {
    console.error('Fingerprint comparison failed:', error);
    return { isNew: false, current: null, stored: null, similar: false };
  }
};

// Calculate similarity between two fingerprints
const calculateSimilarity = (fp1, fp2) => {
  if (!fp1 || !fp2) return 0;

  let matches = 0;
  let total = 0;
  
  const weights = {
    ua: 0.3,      // User agent - important but can change
    lang: 0.1,    // Languages - stable
    tz: 0.1,      // Timezone - stable
    scr: 0.2,     // Screen - fairly stable
    hwc: 0.1,     // Hardware concurrency - stable
    mem: 0.1,     // Memory - stable
    platform: 0.05, // Platform - very stable
    webgl: 0.05   // WebGL - stable but optional
  };

  for (const [key, weight] of Object.entries(weights)) {
    if (key in fp1 && key in fp2) {
      total += weight;
      
      if (fp1[key] === fp2[key]) {
        matches += weight;
      } else if (key === 'ua') {
        // Special handling for user agent - allow minor version differences
        const similarity = calculateUserAgentSimilarity(fp1[key], fp2[key]);
        matches += weight * similarity;
      }
    }
  }

  return total > 0 ? matches / total : 0;
};

// Calculate user agent similarity
const calculateUserAgentSimilarity = (ua1, ua2) => {
  if (!ua1 || !ua2) return 0;
  if (ua1 === ua2) return 1;

  // Extract browser and major version
  const extractBrowser = (ua) => {
    const patterns = [
      /Chrome\/(\d+)/,
      /Firefox\/(\d+)/,
      /Safari\/(\d+)/,
      /Edge\/(\d+)/
    ];

    for (const pattern of patterns) {
      const match = ua.match(pattern);
      if (match) {
        return {
          browser: pattern.source.split('/')[0],
          version: parseInt(match[1])
        };
      }
    }
    return null;
  };

  const browser1 = extractBrowser(ua1);
  const browser2 = extractBrowser(ua2);

  if (!browser1 || !browser2) return 0;

  // Same browser type
  if (browser1.browser === browser2.browser) {
    const versionDiff = Math.abs(browser1.version - browser2.version);
    // Allow up to 5 version differences with decreasing similarity
    return Math.max(0, 1 - (versionDiff / 10));
  }

  return 0;
};

// Clear stored fingerprint
export const clearStoredFingerprint = () => {
  try {
    localStorage.removeItem('deviceFingerprint');
  } catch (error) {
    console.warn('Failed to clear stored fingerprint:', error);
  }
};
