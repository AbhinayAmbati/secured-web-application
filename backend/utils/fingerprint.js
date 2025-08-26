// Fingerprint utilities for device identification and validation

// Generate a soft fingerprint hash from browser data
export const generateFingerprintHash = (fingerprintData) => {
  if (!fingerprintData || typeof fingerprintData !== 'object') {
    return null;
  }

  try {
    // Normalize the fingerprint data
    const normalized = {
      ua: fingerprintData.ua || '',
      lang: fingerprintData.lang || '',
      tz: fingerprintData.tz || '',
      scr: fingerprintData.scr || '',
      hwc: fingerprintData.hwc || 0,
      mem: fingerprintData.mem || 0,
      platform: fingerprintData.platform || '',
      webgl: fingerprintData.webgl || ''
    };

    // Create a stable string representation
    const str = JSON.stringify(normalized, Object.keys(normalized).sort());
    
    // Simple hash function (FNV-1a variant)
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    
    return (hash >>> 0).toString(16);
  } catch (error) {
    console.error('Fingerprint hashing error:', error);
    return null;
  }
};

// Compare two fingerprints and return a similarity score
export const compareFingerprintSimilarity = (stored, current) => {
  if (!stored || !current) {
    return 0;
  }

  try {
    const storedData = typeof stored === 'string' ? JSON.parse(stored) : stored;
    const currentData = typeof current === 'string' ? JSON.parse(current) : current;

    let matches = 0;
    let total = 0;
    const weights = {
      ua: 0.3,      // User agent - high weight but can change
      lang: 0.1,    // Languages - stable
      tz: 0.1,      // Timezone - stable
      scr: 0.2,     // Screen resolution - fairly stable
      hwc: 0.1,     // Hardware concurrency - stable
      mem: 0.1,     // Device memory - stable
      platform: 0.05, // Platform - very stable
      webgl: 0.05   // WebGL info - stable but privacy-sensitive
    };

    for (const [key, weight] of Object.entries(weights)) {
      total += weight;
      
      if (storedData[key] === currentData[key]) {
        matches += weight;
      } else if (key === 'ua') {
        // Special handling for user agent - partial matches
        const similarity = calculateUserAgentSimilarity(storedData[key], currentData[key]);
        matches += weight * similarity;
      }
    }

    return total > 0 ? matches / total : 0;
  } catch (error) {
    console.error('Fingerprint comparison error:', error);
    return 0;
  }
};

// Calculate user agent similarity (handles version updates)
const calculateUserAgentSimilarity = (stored, current) => {
  if (!stored || !current) return 0;
  if (stored === current) return 1;

  try {
    // Extract browser name and major version
    const extractBrowserInfo = (ua) => {
      const patterns = [
        /Chrome\/(\d+)/,
        /Firefox\/(\d+)/,
        /Safari\/(\d+)/,
        /Edge\/(\d+)/,
        /Opera\/(\d+)/
      ];

      for (const pattern of patterns) {
        const match = ua.match(pattern);
        if (match) {
          return {
            browser: pattern.source.split('/')[0],
            majorVersion: parseInt(match[1])
          };
        }
      }
      return null;
    };

    const storedInfo = extractBrowserInfo(stored);
    const currentInfo = extractBrowserInfo(current);

    if (!storedInfo || !currentInfo) {
      // Fallback to simple string similarity
      return calculateStringSimilarity(stored, current);
    }

    // Same browser
    if (storedInfo.browser === currentInfo.browser) {
      const versionDiff = Math.abs(storedInfo.majorVersion - currentInfo.majorVersion);
      // Allow up to 5 major version differences
      return Math.max(0, 1 - (versionDiff / 10));
    }

    return 0;
  } catch (error) {
    return 0;
  }
};

// Simple string similarity calculation
const calculateStringSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1;

  const editDistance = calculateLevenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
};

// Calculate Levenshtein distance
const calculateLevenshteinDistance = (str1, str2) => {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
};

// Validate fingerprint data structure
export const validateFingerprintData = (data) => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Check for required fields
  const requiredFields = ['ua', 'lang', 'tz', 'scr'];
  for (const field of requiredFields) {
    if (!(field in data)) {
      return false;
    }
  }

  // Validate data types and ranges
  if (typeof data.ua !== 'string' || data.ua.length > 500) return false;
  if (typeof data.lang !== 'string' || data.lang.length > 100) return false;
  if (typeof data.tz !== 'string' || data.tz.length > 50) return false;
  if (typeof data.scr !== 'string' || data.scr.length > 20) return false;

  if (data.hwc !== undefined && (typeof data.hwc !== 'number' || data.hwc < 0 || data.hwc > 128)) {
    return false;
  }

  if (data.mem !== undefined && (typeof data.mem !== 'number' || data.mem < 0 || data.mem > 32)) {
    return false;
  }

  return true;
};

// Detect potentially suspicious fingerprint patterns
export const detectSuspiciousFingerprint = (fingerprintData) => {
  if (!fingerprintData) return { suspicious: false };

  try {
    const data = typeof fingerprintData === 'string' ? JSON.parse(fingerprintData) : fingerprintData;
    const suspiciousPatterns = [];

    // Check for common headless browser patterns
    if (data.ua && (
      data.ua.includes('HeadlessChrome') ||
      data.ua.includes('PhantomJS') ||
      data.ua.includes('SlimerJS') ||
      data.ua.includes('Selenium')
    )) {
      suspiciousPatterns.push('headless_browser_ua');
    }

    // Check for unusual hardware configurations
    if (data.hwc === 0 || data.hwc > 64) {
      suspiciousPatterns.push('unusual_hardware_concurrency');
    }

    // Check for missing or unusual screen resolution
    if (!data.scr || data.scr === '0x0' || data.scr.includes('NaN')) {
      suspiciousPatterns.push('invalid_screen_resolution');
    }

    // Check for empty or suspicious timezone
    if (!data.tz || data.tz === 'UTC' || data.tz.length < 3) {
      suspiciousPatterns.push('suspicious_timezone');
    }

    // Check for empty languages
    if (!data.lang || data.lang.length < 2) {
      suspiciousPatterns.push('missing_languages');
    }

    return {
      suspicious: suspiciousPatterns.length > 0,
      patterns: suspiciousPatterns,
      score: suspiciousPatterns.length / 5 // Normalize to 0-1 scale
    };
  } catch (error) {
    return { suspicious: true, patterns: ['parsing_error'], score: 1 };
  }
};
