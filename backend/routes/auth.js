import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { database } from '../config/database.js';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken,
  hashRefreshToken,
  generateKeyThumbprint,
  validateJWK
} from '../utils/crypto.js';
import { hashFingerprint, logRequest } from '../middleware/security.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Register new user
router.post('/register', [
  body('username').isLength({ min: 3, max: 50 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 128 }),
  body('publicKeyJwk').custom((value) => {
    if (!validateJWK(value)) {
      throw new Error('Invalid public key format');
    }
    return true;
  }),
  body('fingerprint').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await logRequest(req, null, 400);
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { username, email, password, publicKeyJwk, fingerprint } = req.body;

    // Check if user already exists
    const existingUser = await database.get(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUser) {
      await logRequest(req, null, 409);
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const userResult = await database.run(`
      INSERT INTO users (username, email, password_hash)
      VALUES (?, ?, ?)
    `, [username, email, passwordHash]);

    const userId = userResult.id;

    // Generate key ID and thumbprint
    const keyId = uuidv4();
    const keyThumbprint = generateKeyThumbprint(publicKeyJwk);
    const fingerprintHash = fingerprint ? hashFingerprint(fingerprint) : null;

    // Store device key
    const deviceKeyResult = await database.run(`
      INSERT INTO device_keys (user_id, key_id, public_key_jwk, fingerprint_hash)
      VALUES (?, ?, ?, ?)
    `, [userId, keyId, JSON.stringify(publicKeyJwk), fingerprintHash]);

    const deviceKeyId = deviceKeyResult.id;

    // Generate tokens
    const accessToken = generateAccessToken(userId, keyThumbprint, deviceKeyId);
    const refreshToken = generateRefreshToken(userId, deviceKeyId);

    // Store refresh token hash
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await database.run(`
      INSERT INTO refresh_tokens (user_id, token_hash, device_key_id, expires_at)
      VALUES (?, ?, ?, ?)
    `, [userId, refreshTokenHash, deviceKeyId, expiresAt]);

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    await logRequest(req, userId, 201);

    res.status(201).json({
      message: 'User registered successfully',
      accessToken,
      user: {
        id: userId,
        username,
        email
      },
      deviceKeyId: keyId
    });
  } catch (error) {
    console.error('Registration error:', error);
    await logRequest(req, null, 500);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1, max: 128 }),
  body('publicKeyJwk').custom((value) => {
    if (!validateJWK(value)) {
      throw new Error('Invalid public key format');
    }
    return true;
  }),
  body('fingerprint').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await logRequest(req, null, 400);
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { email, password, publicKeyJwk, fingerprint } = req.body;

    // Get user
    const user = await database.get(`
      SELECT id, username, email, password_hash, login_attempts, locked_until, is_active
      FROM users WHERE email = ?
    `, [email]);

    if (!user || !user.is_active) {
      await logRequest(req, null, 401);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await logRequest(req, user.id, 423);
      return res.status(423).json({ error: 'Account temporarily locked' });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      // Increment login attempts
      const attempts = (user.login_attempts || 0) + 1;
      const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
      
      let lockedUntil = null;
      if (attempts >= maxAttempts) {
        const lockoutTime = parseInt(process.env.LOCKOUT_TIME) || 15 * 60 * 1000; // 15 minutes
        lockedUntil = new Date(Date.now() + lockoutTime);
      }

      await database.run(`
        UPDATE users 
        SET login_attempts = ?, locked_until = ?
        WHERE id = ?
      `, [attempts, lockedUntil, user.id]);

      await logRequest(req, user.id, 401);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset login attempts on successful login
    await database.run(`
      UPDATE users 
      SET login_attempts = 0, locked_until = NULL
      WHERE id = ?
    `, [user.id]);

    // Generate key ID and thumbprint
    const keyId = uuidv4();
    const keyThumbprint = generateKeyThumbprint(publicKeyJwk);
    const fingerprintHash = fingerprint ? hashFingerprint(fingerprint) : null;

    // Store device key
    const deviceKeyResult = await database.run(`
      INSERT INTO device_keys (user_id, key_id, public_key_jwk, fingerprint_hash)
      VALUES (?, ?, ?, ?)
    `, [user.id, keyId, JSON.stringify(publicKeyJwk), fingerprintHash]);

    const deviceKeyId = deviceKeyResult.id;

    // Generate tokens
    const accessToken = generateAccessToken(user.id, keyThumbprint, deviceKeyId);
    const refreshToken = generateRefreshToken(user.id, deviceKeyId);

    // Store refresh token hash
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await database.run(`
      INSERT INTO refresh_tokens (user_id, token_hash, device_key_id, expires_at)
      VALUES (?, ?, ?, ?)
    `, [user.id, refreshTokenHash, deviceKeyId, expiresAt]);

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    await logRequest(req, user.id, 200);

    res.json({
      message: 'Login successful',
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      deviceKeyId: keyId
    });
  } catch (error) {
    console.error('Login error:', error);
    await logRequest(req, null, 500);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    // Verify refresh token
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const userId = parseInt(payload.sub);
    const deviceKeyId = payload.device_key_id;

    // Check if refresh token exists in database
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const storedToken = await database.get(`
      SELECT rt.*, dk.public_key_jwk, u.username, u.email, u.is_active
      FROM refresh_tokens rt
      JOIN device_keys dk ON rt.device_key_id = dk.id
      JOIN users u ON rt.user_id = u.id
      WHERE rt.token_hash = ? AND rt.user_id = ? AND rt.device_key_id = ?
        AND rt.is_revoked = FALSE AND rt.expires_at > NOW()
        AND dk.is_active = TRUE AND u.is_active = TRUE
    `, [refreshTokenHash, userId, deviceKeyId]);

    if (!storedToken) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ error: 'Refresh token not found or expired' });
    }

    // Generate new access token
    const publicKeyJwk = JSON.parse(storedToken.public_key_jwk);
    const keyThumbprint = generateKeyThumbprint(publicKeyJwk);
    const accessToken = generateAccessToken(userId, keyThumbprint, deviceKeyId);

    await logRequest(req, userId, 200);

    res.json({
      accessToken,
      user: {
        id: userId,
        username: storedToken.username,
        email: storedToken.email
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    await logRequest(req, null, 500);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout (revoke refresh token)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      const refreshTokenHash = hashRefreshToken(refreshToken);
      await database.run(`
        UPDATE refresh_tokens
        SET is_revoked = 1
        WHERE token_hash = ? AND user_id = ?
      `, [refreshTokenHash, req.user.id]);
    }

    res.clearCookie('refreshToken');
    await logRequest(req, req.user.id, 200);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    await logRequest(req, req.user?.id, 500);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await database.get(`
      SELECT id, username, email, created_at
      FROM users WHERE id = ? AND is_active = TRUE
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get device keys count
    const deviceKeysCount = await database.get(`
      SELECT COUNT(*) as count
      FROM device_keys WHERE user_id = ? AND is_active = TRUE
    `, [req.user.id]);

    await logRequest(req, req.user.id, 200);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
        deviceKeysCount: deviceKeysCount.count
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    await logRequest(req, req.user?.id, 500);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Revoke device key
router.delete('/device/:keyId', authenticateToken, async (req, res) => {
  try {
    const { keyId } = req.params;

    const result = await database.run(`
      UPDATE device_keys
      SET is_active = 0
      WHERE key_id = ? AND user_id = ?
    `, [keyId, req.user.id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Device key not found' });
    }

    // Revoke associated refresh tokens
    await database.run(`
      UPDATE refresh_tokens
      SET is_revoked = 1
      WHERE device_key_id = (
        SELECT id FROM device_keys WHERE key_id = ? AND user_id = ?
      )
    `, [keyId, req.user.id]);

    await logRequest(req, req.user.id, 200);
    res.json({ message: 'Device key revoked successfully' });
  } catch (error) {
    console.error('Device key revocation error:', error);
    await logRequest(req, req.user?.id, 500);
    res.status(500).json({ error: 'Failed to revoke device key' });
  }
});

export default router;
