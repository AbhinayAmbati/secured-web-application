// Advanced Anti-Scraping Middleware
import crypto from 'crypto';

class AntiScrapingMiddleware {
  constructor() {
    this.suspiciousPatterns = new Map();
    this.challengeTokens = new Map();
    this.requestPatterns = new Map();
  }

  // Main middleware function
  middleware() {
    return (req, res, next) => {
      const clientId = this.getClientId(req);
      
      // Skip for authenticated API calls (they have their own protection)
      if (req.path.startsWith('/api/') && req.headers.authorization) {
        return next();
      }

      // Analyze request patterns
      this.analyzeRequestPattern(req, clientId);
      
      // Check for bot indicators
      if (this.detectBot(req)) {
        return this.handleBotDetection(req, res);
      }

      // Check request frequency
      if (this.isRequestTooFrequent(clientId)) {
        return this.handleSuspiciousActivity(req, res, 'high_frequency');
      }

      // Validate browser headers
      if (!this.validateBrowserHeaders(req)) {
        return this.handleSuspiciousActivity(req, res, 'invalid_headers');
      }

      // Add security headers
      this.addSecurityHeaders(res);
      
      next();
    };
  }

  // Generate unique client ID based on multiple factors
  getClientId(req) {
    const factors = [
      req.headers['user-agent'] || '',
      req.headers['accept-language'] || '',
      req.headers['accept-encoding'] || '',
      req.connection.remoteAddress || req.ip || '',
    ].join('|');
    
    return crypto.createHash('sha256').update(factors).digest('hex').substring(0, 16);
  }

  // Analyze request patterns for bot behavior
  analyzeRequestPattern(req, clientId) {
    const now = Date.now();
    const pattern = this.requestPatterns.get(clientId) || {
      requests: [],
      paths: new Set(),
      userAgents: new Set(),
      suspicionScore: 0
    };

    // Add current request
    pattern.requests.push({
      timestamp: now,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent']
    });

    pattern.paths.add(req.path);
    pattern.userAgents.add(req.headers['user-agent']);

    // Keep only recent requests (last 10 minutes)
    pattern.requests = pattern.requests.filter(r => now - r.timestamp < 600000);

    // Calculate suspicion score
    pattern.suspicionScore = this.calculateSuspicionScore(pattern);

    this.requestPatterns.set(clientId, pattern);
  }

  // Calculate suspicion score based on behavior patterns
  calculateSuspicionScore(pattern) {
    let score = 0;
    const requests = pattern.requests;
    
    if (requests.length === 0) return 0;

    // 1. Request frequency analysis
    if (requests.length > 50) score += 30; // Too many requests
    else if (requests.length > 20) score += 15;

    // 2. Time interval analysis
    if (requests.length > 5) {
      const intervals = requests.slice(1).map((req, i) => 
        req.timestamp - requests[i].timestamp
      );
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, interval) => 
        sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
      
      // Very uniform intervals suggest automation
      if (variance < 1000 && avgInterval < 5000) score += 25;
    }

    // 3. Path diversity analysis
    const uniquePaths = pattern.paths.size;
    const totalRequests = requests.length;
    
    if (totalRequests > 10) {
      const diversity = uniquePaths / totalRequests;
      if (diversity > 0.8) score += 20; // Too diverse (scraping multiple pages)
      if (diversity < 0.1) score += 15; // Too focused (hammering one endpoint)
    }

    // 4. Sequential path access (common in scrapers)
    const pathArray = Array.from(pattern.paths);
    const hasSequentialPaths = pathArray.some(path => {
      const match = path.match(/\/(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        return pathArray.includes(`/${num + 1}`) || pathArray.includes(`/${num - 1}`);
      }
      return false;
    });
    
    if (hasSequentialPaths) score += 20;

    // 5. User agent consistency
    if (pattern.userAgents.size > 3) score += 15; // Changing user agents

    return Math.min(score, 100); // Cap at 100
  }

  // Detect bot based on headers and behavior
  detectBot(req) {
    const userAgent = req.headers['user-agent'] || '';
    const clientId = this.getClientId(req);
    const pattern = this.requestPatterns.get(clientId);

    // 1. User agent analysis
    const botUserAgents = [
      /bot|crawler|spider|scraper/i,
      /curl|wget|python|java|go-http/i,
      /headless|phantom|selenium|webdriver/i,
      /postman|insomnia|httpie/i
    ];

    if (botUserAgents.some(regex => regex.test(userAgent))) {
      return true;
    }

    // 2. Missing essential headers
    const essentialHeaders = ['accept', 'accept-language', 'accept-encoding'];
    const missingHeaders = essentialHeaders.filter(header => !req.headers[header]);
    
    if (missingHeaders.length > 1) {
      return true;
    }

    // 3. Suspicious header values
    const accept = req.headers.accept || '';
    if (accept === '*/*' || accept === '') {
      return true;
    }

    // 4. High suspicion score
    if (pattern && pattern.suspicionScore > 70) {
      return true;
    }

    // 5. No referrer on deep pages (bots often access directly)
    if (!req.headers.referer && req.path !== '/' && !req.path.startsWith('/api/')) {
      return true;
    }

    return false;
  }

  // Check if requests are too frequent
  isRequestTooFrequent(clientId) {
    const pattern = this.requestPatterns.get(clientId);
    if (!pattern) return false;

    const now = Date.now();
    const recentRequests = pattern.requests.filter(r => now - r.timestamp < 60000); // Last minute

    // More than 30 requests per minute
    return recentRequests.length > 30;
  }

  // Validate browser headers for authenticity
  validateBrowserHeaders(req) {
    const userAgent = req.headers['user-agent'] || '';
    const accept = req.headers.accept || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const acceptEncoding = req.headers['accept-encoding'] || '';

    // Check for browser-like accept header
    if (!accept.includes('text/html') && !req.path.startsWith('/api/')) {
      return false;
    }

    // Check for gzip support (all modern browsers support this)
    if (!acceptEncoding.includes('gzip')) {
      return false;
    }

    // Check for language header (browsers always send this)
    if (!acceptLanguage && !req.path.startsWith('/api/')) {
      return false;
    }

    // Check user agent format
    if (userAgent.length < 20 || !userAgent.includes('Mozilla')) {
      return false;
    }

    return true;
  }

  // Add security headers to response
  addSecurityHeaders(res) {
    // Prevent caching of sensitive content
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Content security policy
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    
    // Prevent embedding in frames
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Add custom anti-scraping header
    res.setHeader('X-Anti-Scraping', 'active');
  }

  // Handle bot detection
  handleBotDetection(req, res) {
    const clientId = this.getClientId(req);
    
    console.warn('Bot detected:', {
      clientId,
      userAgent: req.headers['user-agent'],
      path: req.path,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    // Log to database if available
    this.logBotAttempt(req, clientId);

    // Return bot-specific response
    res.status(403).json({
      error: 'Access denied',
      message: 'Automated access detected',
      code: 'BOT_DETECTED'
    });
  }

  // Handle suspicious activity
  handleSuspiciousActivity(req, res, reason) {
    const clientId = this.getClientId(req);
    
    console.warn('Suspicious activity detected:', {
      reason,
      clientId,
      userAgent: req.headers['user-agent'],
      path: req.path,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    // Implement progressive penalties
    const pattern = this.requestPatterns.get(clientId);
    if (pattern) {
      pattern.suspicionScore += 20;
    }

    // Return challenge or block
    if (reason === 'high_frequency') {
      res.status(429).json({
        error: 'Too many requests',
        message: 'Please slow down your requests',
        retryAfter: 60
      });
    } else {
      res.status(403).json({
        error: 'Suspicious activity detected',
        message: 'Please verify you are human',
        code: 'SUSPICIOUS_ACTIVITY'
      });
    }
  }

  // Log bot attempt to database
  async logBotAttempt(req, clientId) {
    try {
      // This would integrate with your database
      const logData = {
        client_id: clientId,
        user_agent: req.headers['user-agent'],
        path: req.path,
        method: req.method,
        ip: req.ip,
        headers: JSON.stringify(req.headers),
        timestamp: new Date(),
        type: 'bot_attempt'
      };
      
      // Log to your security_logs table
      console.log('Bot attempt logged:', logData);
    } catch (error) {
      console.error('Failed to log bot attempt:', error);
    }
  }

  // Clean up old data periodically
  cleanup() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [clientId, pattern] of this.requestPatterns.entries()) {
      pattern.requests = pattern.requests.filter(r => now - r.timestamp < maxAge);
      
      if (pattern.requests.length === 0) {
        this.requestPatterns.delete(clientId);
      }
    }
  }
}

// Create singleton instance
const antiScrapingMiddleware = new AntiScrapingMiddleware();

// Clean up every 10 minutes
setInterval(() => {
  antiScrapingMiddleware.cleanup();
}, 600000);

export default antiScrapingMiddleware;
