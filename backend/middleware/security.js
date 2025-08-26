import { database } from '../config/database.js';
import {
  generateFingerprintHash,
  compareFingerprintSimilarity,
  validateFingerprintData,
  detectSuspiciousFingerprint
} from '../utils/fingerprint.js';

// Security middleware for logging requests and basic fingerprint validation
export const securityMiddleware = async (req, res, next) => {
  try {
    // Extract basic request information
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    const fingerprint = req.get('X-Fingerprint') || '';
    
    // Add security headers
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    });

    // Store request info for potential logging
    req.securityContext = {
      ip,
      userAgent,
      fingerprint,
      timestamp: new Date(),
      endpoint: req.path,
      method: req.method
    };

    next();
  } catch (error) {
    console.error('Security middleware error:', error);
    next();
  }
};

// Log request for monitoring and analysis
export const logRequest = async (req, userId = null, statusCode = 200, dpopJti = null) => {
  try {
    const { ip, userAgent, fingerprint, endpoint, method } = req.securityContext || {};

    // Generate hash from fingerprint data if available
    let fingerprintHash = null;
    if (fingerprint) {
      try {
        const fingerprintData = JSON.parse(fingerprint);
        fingerprintHash = generateFingerprintHash(fingerprintData);
      } catch (error) {
        console.warn('Failed to parse fingerprint for logging:', error.message);
        // Truncate raw fingerprint if it's too long
        fingerprintHash = fingerprint.length > 255 ? fingerprint.substring(0, 255) : fingerprint;
      }
    }

    await database.run(`
      INSERT INTO request_logs (
        user_id, ip_address, user_agent, endpoint, method,
        status_code, fingerprint_hash, dpop_jti
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId, ip, userAgent, endpoint, method, statusCode, fingerprintHash, dpopJti]);
  } catch (error) {
    console.error('Failed to log request:', error);
  }
};

// Fingerprint comparison utility (updated to use new fingerprint utilities)
export const compareFingerprints = (storedHash, currentFingerprintJson, tolerance = 0.7) => {
  if (!storedHash || !currentFingerprintJson) return false;

  try {
    // Parse the current fingerprint JSON
    const currentFingerprintData = typeof currentFingerprintJson === 'string'
      ? JSON.parse(currentFingerprintJson)
      : currentFingerprintJson;

    // Generate hash from current fingerprint data
    const currentHash = generateFingerprintHash(currentFingerprintData);

    // Compare hashes directly (exact match for now)
    // In the future, you could implement fuzzy matching for hashes
    const match = storedHash === currentHash;

    console.log('Fingerprint comparison:', {
      storedHash: storedHash?.substring(0, 8) + '...',
      currentHash: currentHash?.substring(0, 8) + '...',
      match
    });

    return match;
  } catch (error) {
    console.error('Fingerprint comparison error:', error);
    return false;
  }
};

// Generate fingerprint hash for storage (updated to use new utilities)
export const hashFingerprint = (fingerprintData) => {
  if (!fingerprintData) return null;
  return generateFingerprintHash(fingerprintData);
};

// Enhanced fingerprint validation middleware
export const validateFingerprint = (req, res, next) => {
  const fingerprintHeader = req.get('X-Fingerprint');

  if (fingerprintHeader) {
    try {
      const fingerprintData = JSON.parse(fingerprintHeader);

      // Validate fingerprint data structure
      if (!validateFingerprintData(fingerprintData)) {
        console.warn('Invalid fingerprint data received', {
          ip: req.securityContext?.ip,
          userAgent: req.securityContext?.userAgent
        });
        return res.status(400).json({ error: 'Invalid fingerprint data' });
      }

      // Check for suspicious patterns
      const suspiciousResult = detectSuspiciousFingerprint(fingerprintData);
      if (suspiciousResult.suspicious) {
        console.warn('Suspicious fingerprint detected', {
          ip: req.securityContext?.ip,
          patterns: suspiciousResult.patterns,
          score: suspiciousResult.score
        });

        // Store suspicious activity flag
        req.suspiciousFingerprint = suspiciousResult;

        // In production, you might want to:
        // - Require CAPTCHA
        // - Apply stricter rate limits
        // - Require additional verification
        // For now, we'll continue but log the activity
      }

      // Store validated fingerprint data
      req.fingerprintData = fingerprintData;
      req.fingerprintHash = generateFingerprintHash(fingerprintData);
    } catch (error) {
      console.warn('Failed to parse fingerprint header', {
        error: error.message,
        ip: req.securityContext?.ip
      });
      return res.status(400).json({ error: 'Invalid fingerprint format' });
    }
  }

  next();
};

// Check for suspicious activity patterns
export const detectSuspiciousActivity = async (userId, ip) => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Check request frequency from this IP
    const ipRequests = await database.all(`
      SELECT COUNT(*) as count 
      FROM request_logs 
      WHERE ip_address = ? AND created_at > ?
    `, [ip, oneHourAgo.toISOString()]);
    
    // Disable IP frequency check in development
    if (process.env.NODE_ENV !== 'development' && ipRequests[0]?.count > 200) {
      return { suspicious: true, reason: 'High request frequency from IP' };
    }
    
    if (userId) {
      // Check if user is making requests from multiple IPs simultaneously
      const userIPs = await database.all(`
        SELECT DISTINCT ip_address 
        FROM request_logs 
        WHERE user_id = ? AND created_at > ?
      `, [userId, oneHourAgo.toISOString()]);
      
      // Disable multiple IP check in development
      if (process.env.NODE_ENV !== 'development' && userIPs.length > 5) {
        return { suspicious: true, reason: 'Multiple IPs for single user' };
      }
    }
    
    return { suspicious: false };
  } catch (error) {
    console.error('Suspicious activity detection error:', error);
    return { suspicious: false };
  }
};

// Middleware to check for suspicious activity
export const suspiciousActivityCheck = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const ip = req.securityContext?.ip;
    
    const result = await detectSuspiciousActivity(userId, ip);
    
    if (result.suspicious) {
      console.warn(`Suspicious activity detected: ${result.reason}`, {
        userId,
        ip,
        userAgent: req.securityContext?.userAgent
      });
      
      // You could implement additional measures here:
      // - Require CAPTCHA
      // - Temporary rate limit increase
      // - Email notification
      // - Account temporary lock
      
      // For now, we'll just log and continue
      req.suspiciousActivity = result;
    }
    
    next();
  } catch (error) {
    console.error('Suspicious activity check error:', error);
    next();
  }
};
