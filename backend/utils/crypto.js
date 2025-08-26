import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { importJWK, jwtVerify } from 'jose';

// Generate key thumbprint (JWK thumbprint)
export const generateKeyThumbprint = (jwk) => {
  try {
    // Create canonical JWK for thumbprint
    const canonicalJwk = {
      crv: jwk.crv,
      kty: jwk.kty,
      x: jwk.x,
      y: jwk.y
    };
    
    const jwkString = JSON.stringify(canonicalJwk);
    return crypto.createHash('sha256').update(jwkString).digest('base64url');
  } catch (error) {
    console.error('Error generating key thumbprint:', error);
    throw new Error('Failed to generate key thumbprint');
  }
};

// Verify DPoP proof
export const verifyDPoP = async (dpopHeader, method, url, publicKeyJwk) => {
  try {
    if (!dpopHeader) {
      throw new Error('Missing DPoP header');
    }

    // Parse DPoP JWT
    const [headerB64, payloadB64, signatureB64] = dpopHeader.split('.');
    
    if (!headerB64 || !payloadB64 || !signatureB64) {
      throw new Error('Invalid DPoP format');
    }

    // Decode header and payload
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Verify header
    if (header.alg !== 'ES256' || header.typ !== 'dpop+jwt') {
      throw new Error('Invalid DPoP header');
    }

    // Verify payload claims
    if (payload.htm !== method.toUpperCase()) {
      throw new Error('DPoP method mismatch');
    }

    if (payload.htu !== url) {
      throw new Error('DPoP URL mismatch');
    }

    // Check timestamp (allow 5 minute window)
    const now = Math.floor(Date.now() / 1000);
    if (!payload.iat || Math.abs(now - payload.iat) > 300) {
      throw new Error('DPoP timestamp invalid');
    }

    // Verify JTI exists (for replay protection)
    if (!payload.jti) {
      throw new Error('Missing DPoP JTI');
    }

    // Import public key and verify signature
    const publicKey = await importJWK(publicKeyJwk, 'ES256');
    
    // Verify signature using jose library
    const { payload: verifiedPayload } = await jwtVerify(dpopHeader, publicKey, {
      algorithms: ['ES256']
    });

    return {
      valid: true,
      jti: payload.jti,
      iat: payload.iat
    };
  } catch (error) {
    console.error('DPoP verification error:', error);
    return {
      valid: false,
      error: error.message
    };
  }
};

// Generate access token with key binding
export const generateAccessToken = (userId, keyThumbprint, deviceKeyId) => {
  const payload = {
    sub: userId.toString(),
    cnf: {
      jkt: keyThumbprint
    },
    device_key_id: deviceKeyId,
    type: 'access'
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    issuer: 'prevent-scraping-api',
    audience: 'prevent-scraping-client'
  });
};

// Generate refresh token
export const generateRefreshToken = (userId, deviceKeyId) => {
  const payload = {
    sub: userId.toString(),
    device_key_id: deviceKeyId,
    type: 'refresh'
  };

  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: 'prevent-scraping-api',
    audience: 'prevent-scraping-client'
  });
};

// Verify access token
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'prevent-scraping-api',
      audience: 'prevent-scraping-client'
    });
  } catch (error) {
    throw new Error('Invalid access token');
  }
};

// Verify refresh token
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      issuer: 'prevent-scraping-api',
      audience: 'prevent-scraping-client'
    });
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
};

// Hash refresh token for storage
export const hashRefreshToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Generate secure random string
export const generateSecureRandom = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Validate JWK format
export const validateJWK = (jwk) => {
  if (!jwk || typeof jwk !== 'object') {
    return false;
  }

  // Check for required ECDSA P-256 fields
  const requiredFields = ['kty', 'crv', 'x', 'y'];
  for (const field of requiredFields) {
    if (!jwk[field]) {
      return false;
    }
  }

  // Validate key type and curve
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
    return false;
  }

  // Validate coordinate lengths (P-256 coordinates are 32 bytes = 43 base64url chars)
  if (jwk.x.length !== 43 || jwk.y.length !== 43) {
    return false;
  }

  return true;
};
