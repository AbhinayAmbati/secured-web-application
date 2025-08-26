import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { database } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { logRequest, suspiciousActivityCheck, validateFingerprint } from '../middleware/security.js';

const router = express.Router();

// Apply authentication and security middleware to all routes
router.use(authenticateToken);
router.use(validateFingerprint);
router.use(suspiciousActivityCheck);

// Get all posts for the authenticated user
router.get('/posts', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isLength({ max: 100 }).trim().escape()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await logRequest(req, req.user.id, 400);
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    // The validation middleware already converts these to integers
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    console.log('Query params:', { page, limit, search, offset, pageType: typeof page, limitType: typeof limit });

    let whereClause = 'WHERE user_id = ?';
    let params = [req.user.id];

    if (search) {
      whereClause += ' AND (title LIKE ? OR content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM posts ${whereClause}`;
    const countResult = await database.get(countQuery, params);
    const total = countResult.total;

    // Try a simpler approach - build the query with string interpolation for LIMIT/OFFSET
    // This avoids parameter binding issues with LIMIT/OFFSET
    const finalQuery = `SELECT id, title, content, created_at, updated_at FROM posts ${whereClause} ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

    console.log('Posts query:', {
      finalQuery,
      params,
      paramsTypes: params.map(p => typeof p)
    });

    const posts = await database.all(finalQuery, params);

    await logRequest(req, req.user.id, 200);

    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    await logRequest(req, req.user.id, 500);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get a specific post
router.get('/posts/:id', [
  param('id').isInt({ min: 1 }).toInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await logRequest(req, req.user.id, 400);
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { id } = req.params;

    const post = await database.get(`
      SELECT id, title, content, created_at, updated_at
      FROM posts 
      WHERE id = ? AND user_id = ?
    `, [id, req.user.id]);

    if (!post) {
      await logRequest(req, req.user.id, 404);
      return res.status(404).json({ error: 'Post not found' });
    }

    await logRequest(req, req.user.id, 200);
    res.json({ post });
  } catch (error) {
    console.error('Get post error:', error);
    await logRequest(req, req.user.id, 500);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Create a new post
router.post('/posts', [
  body('title').isLength({ min: 1, max: 255 }).trim().escape(),
  body('content').optional().isLength({ max: 10000 }).trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await logRequest(req, req.user.id, 400);
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { title, content } = req.body;

    const result = await database.run(`
      INSERT INTO posts (user_id, title, content)
      VALUES (?, ?, ?)
    `, [req.user.id, title, content || '']);

    const post = await database.get(`
      SELECT id, title, content, created_at, updated_at
      FROM posts 
      WHERE id = ?
    `, [result.id]);

    await logRequest(req, req.user.id, 201);

    res.status(201).json({
      message: 'Post created successfully',
      post
    });
  } catch (error) {
    console.error('Create post error:', error);
    await logRequest(req, req.user.id, 500);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Update a post
router.put('/posts/:id', [
  param('id').isInt({ min: 1 }).toInt(),
  body('title').isLength({ min: 1, max: 255 }).trim().escape(),
  body('content').optional().isLength({ max: 10000 }).trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await logRequest(req, req.user.id, 400);
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { id } = req.params;
    const { title, content } = req.body;

    // Check if post exists and belongs to user
    const existingPost = await database.get(`
      SELECT id FROM posts WHERE id = ? AND user_id = ?
    `, [id, req.user.id]);

    if (!existingPost) {
      await logRequest(req, req.user.id, 404);
      return res.status(404).json({ error: 'Post not found' });
    }

    // Update post (MySQL will automatically update updated_at due to ON UPDATE CURRENT_TIMESTAMP)
    await database.run(`
      UPDATE posts
      SET title = ?, content = ?
      WHERE id = ? AND user_id = ?
    `, [title, content || '', id, req.user.id]);

    // Get updated post
    const post = await database.get(`
      SELECT id, title, content, created_at, updated_at
      FROM posts 
      WHERE id = ?
    `, [id]);

    await logRequest(req, req.user.id, 200);

    res.json({
      message: 'Post updated successfully',
      post
    });
  } catch (error) {
    console.error('Update post error:', error);
    await logRequest(req, req.user.id, 500);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete a post
router.delete('/posts/:id', [
  param('id').isInt({ min: 1 }).toInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await logRequest(req, req.user.id, 400);
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { id } = req.params;

    const result = await database.run(`
      DELETE FROM posts 
      WHERE id = ? AND user_id = ?
    `, [id, req.user.id]);

    if (result.changes === 0) {
      await logRequest(req, req.user.id, 404);
      return res.status(404).json({ error: 'Post not found' });
    }

    await logRequest(req, req.user.id, 200);
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    await logRequest(req, req.user.id, 500);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Get user statistics
router.get('/stats', async (req, res) => {
  try {
    // Get basic stats with fallback for empty table
    let stats;
    try {
      stats = await database.get(`
        SELECT
          COUNT(*) as total_posts,
          SUM(CASE WHEN created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as posts_this_week,
          SUM(CASE WHEN created_at > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as posts_this_month
        FROM posts
        WHERE user_id = ?
      `, [req.user.id]);
    } catch (error) {
      console.warn('Stats query failed, using fallback:', error.message);
      // Fallback stats if query fails
      stats = {
        total_posts: 0,
        posts_this_week: 0,
        posts_this_month: 0
      };
    }

    let deviceKeysCount;
    try {
      deviceKeysCount = await database.get(`
        SELECT COUNT(*) as count
        FROM device_keys
        WHERE user_id = ? AND is_active = 1
      `, [req.user.id]);
    } catch (error) {
      console.warn('Device keys query failed, using fallback:', error.message);
      deviceKeysCount = { count: 0 };
    }

    await logRequest(req, req.user.id, 200);

    res.json({
      stats: {
        totalPosts: stats.total_posts || 0,
        postsThisWeek: stats.posts_this_week || 0,
        postsThisMonth: stats.posts_this_month || 0,
        activeDeviceKeys: deviceKeysCount.count || 0
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    await logRequest(req, req.user.id, 500);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
