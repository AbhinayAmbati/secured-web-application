import { database } from '../config/database.js';
import { verifyAccessToken, verifyDPoP, generateKeyThumbprint } from '../utils/crypto.js';
import { logRequest, compareFingerprints } from './security.js';

// JTI replay protection cache (in production, use Redis)
const jtiCache = new Set();
const JTI_CACHE_SIZE = 10000;

// Clean JTI cache periodically
setInterval(() => {
  if (jtiCache.size > JTI_CACHE_SIZE) {
    jtiCache.clear();
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

export const authenticateToken = async (req, res, next) => {
  try {
    // Extract Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    
    // Extract DPoP header
    const dpopHeader = req.headers.dpop;
    if (!dpopHeader) {
      return res.status(401).json({ error: 'Missing DPoP header' });
    }

    // Verify JWT
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (error) {
      await logRequest(req, null, 401);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Extract user ID and key thumbprint
    const userId = parseInt(payload.sub);
    const keyThumbprint = payload.cnf?.jkt;
    const deviceKeyId = payload.device_key_id;

    if (!keyThumbprint || !deviceKeyId) {
      await logRequest(req, userId, 401);
      return res.status(401).json({ error: 'Token not properly bound to device' });
    }

    // Get device key from database
    const deviceKey = await database.get(`
      SELECT dk.*, u.username, u.email, u.is_active as user_active
      FROM device_keys dk
      JOIN users u ON dk.user_id = u.id
      WHERE dk.id = ? AND dk.user_id = ? AND dk.is_active = 1 AND u.is_active = 1
    `, [deviceKeyId, userId]);

    if (!deviceKey) {
      await logRequest(req, userId, 401);
      return res.status(401).json({ error: 'Device key not found or inactive' });
    }

    // Parse stored public key
    let publicKeyJwk;
    try {
      publicKeyJwk = JSON.parse(deviceKey.public_key_jwk);
    } catch (error) {
      console.error('Failed to parse stored public key:', error);
      await logRequest(req, userId, 500);
      return res.status(500).json({ error: 'Invalid stored device key' });
    }

    // Verify key thumbprint matches
    const storedThumbprint = generateKeyThumbprint(publicKeyJwk);
    if (storedThumbprint !== keyThumbprint) {
      await logRequest(req, userId, 401);
      return res.status(401).json({ error: 'Key thumbprint mismatch' });
    }

    // Construct full URL for DPoP verification
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.headers.host;
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;



    // Verify DPoP proof
    const dpopResult = await verifyDPoP(dpopHeader, req.method, fullUrl, publicKeyJwk);
    if (!dpopResult.valid) {
      await logRequest(req, userId, 401);
      return res.status(401).json({ error: 'Invalid DPoP proof', details: dpopResult.error });
    }

    // Check for JTI replay
    if (jtiCache.has(dpopResult.jti)) {
      await logRequest(req, userId, 401, dpopResult.jti);
      return res.status(401).json({ error: 'DPoP proof replay detected' });
    }

    // Add JTI to cache
    jtiCache.add(dpopResult.jti);

    // Enhanced security validations
    const currentFingerprint = req.headers['x-fingerprint'];
    const currentIP = req.securityContext?.ip;

    // Fingerprint validation
    if (deviceKey.fingerprint_hash && currentFingerprint) {
      const fingerprintMatch = compareFingerprints(
        deviceKey.fingerprint_hash,
        currentFingerprint,
        parseFloat(process.env.FINGERPRINT_TOLERANCE) || 0.7
      );

      if (!fingerprintMatch) {
        console.warn('Fingerprint mismatch detected', {
          userId,
          deviceKeyId,
          ip: currentIP,
          userAgent: req.securityContext?.userAgent
        });

        // In production: require re-authentication for security
        if (process.env.NODE_ENV === 'production') {
          await logRequest(req, userId, 401);
          return res.status(401).json({
            error: 'Device verification failed',
            requireReauth: true
          });
        }

        req.fingerprintMismatch = true;
      }
    }

    // IP address validation (optional - can be strict or lenient)
    if (deviceKey.last_ip && currentIP && process.env.STRICT_IP_VALIDATION === 'true') {
      if (deviceKey.last_ip !== currentIP) {
        console.warn('IP address changed', {
          userId,
          deviceKeyId,
          oldIP: deviceKey.last_ip,
          newIP: currentIP
        });

        // Update IP but flag for monitoring
        await database.run(`
          UPDATE device_keys
          SET last_ip = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [currentIP, deviceKeyId]);

        req.ipChanged = true;
      }
    }

    // Update last used timestamp for device key
    await database.run(`
      UPDATE device_keys 
      SET last_used = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [deviceKeyId]);

    // Attach user info to request
    req.user = {
      id: userId,
      username: deviceKey.username,
      email: deviceKey.email,
      deviceKeyId: deviceKeyId
    };

    // Log successful request
    await logRequest(req, userId, 200, dpopResult.jti);

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    await logRequest(req, null, 500);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Optional authentication (for endpoints that work with or without auth)
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const dpopHeader = req.headers.dpop;

  if (authHeader && dpopHeader) {
    // If both headers are present, require full authentication
    return authenticateToken(req, res, next);
  } else {
    // No authentication provided, continue without user context
    req.user = null;
    next();
  }
};
