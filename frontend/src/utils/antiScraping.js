// Advanced Anti-Web Scraping Protection System
// This module implements multiple layers of protection against automated scraping

class AntiScrapingProtection {
  constructor() {
    this.isBot = false;
    this.challenges = [];
    this.protectionLevel = 'low'; // Changed to low for better UX
    this.isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';

    if (this.isDevelopment) {
      console.log('🛡️ Anti-scraping protection running in development mode (reduced sensitivity)');
    }

    this.init();
  }

  init() {
    // Check if anti-scraping is disabled
    if (localStorage.getItem('disable-anti-scraping') === 'true') {
      console.log('🛡️ Anti-scraping protection disabled by user preference');
      return;
    }

    this.detectBots();
    // Temporarily disable aggressive features for better user experience
    // this.obfuscateContent();
    // this.addMouseTracker();
    // this.addKeyboardTracker();
    // this.addScrollTracker();
    this.addTimingAnalysis();
    this.addCanvasFingerprinting();
    // this.addDynamicChallenges();
    // this.protectDevTools();
  }

  // 1. Advanced Bot Detection
  detectBots() {
    const botIndicators = [
      // Check for headless browser indicators
      () => !window.navigator.webdriver === undefined,
      () => window.navigator.webdriver === true,
      () => window.callPhantom !== undefined,
      () => window._phantom !== undefined,
      () => window.Buffer !== undefined,
      () => window.emit !== undefined,
      () => window.spawn !== undefined,
      
      // Check for automation frameworks
      () => window.selenium !== undefined,
      () => window.webdriver !== undefined,
      () => window.driver !== undefined,
      () => window.chrome && window.chrome.runtime && window.chrome.runtime.onConnect === undefined,
      
      // Check for missing human-like properties
      () => navigator.plugins.length === 0,
      () => navigator.languages.length === 0,
      () => screen.width === 0 || screen.height === 0,
      
      // Check for suspicious user agent
      () => /headless|phantom|selenium|webdriver|bot|crawler|spider/i.test(navigator.userAgent),
      
      // Check for missing window properties
      () => !window.outerHeight || !window.outerWidth,
      () => window.outerHeight === window.innerHeight && window.outerWidth === window.innerWidth,
    ];

    const botScore = botIndicators.reduce((score, check) => {
      try {
        return score + (check() ? 1 : 0);
      } catch {
        return score + 0.5; // Reduce penalty for errors
      }
    }, 0);

    // Much higher threshold to avoid false positives
    // In development, be even more lenient
    const threshold = this.isDevelopment ? 15 : 8;
    this.isBot = botScore > threshold;

    if (this.isBot && !this.isDevelopment) {
      this.triggerBotProtection();
    } else if (this.isBot && this.isDevelopment) {
      console.warn('🤖 Bot-like behavior detected but ignored in development mode');
    }
  }

  // 2. Content Obfuscation
  obfuscateContent() {
    // Encrypt sensitive text content
    document.addEventListener('DOMContentLoaded', () => {
      const sensitiveElements = document.querySelectorAll('[data-sensitive]');
      sensitiveElements.forEach(element => {
        const originalText = element.textContent;
        element.textContent = this.encryptText(originalText);
        element.setAttribute('data-encrypted', 'true');
        
        // Decrypt on user interaction
        element.addEventListener('mouseenter', () => {
          if (element.getAttribute('data-encrypted') === 'true') {
            element.textContent = originalText;
            element.setAttribute('data-encrypted', 'false');
          }
        });
      });
    });

    // Add fake content for bots
    if (this.isBot) {
      this.injectFakeContent();
    }
  }

  // 3. Human Interaction Tracking
  addMouseTracker() {
    let mouseMovements = 0;
    let lastMouseTime = Date.now();
    
    document.addEventListener('mousemove', (e) => {
      mouseMovements++;
      const currentTime = Date.now();
      const timeDiff = currentTime - lastMouseTime;
      
      // Human-like mouse movement validation
      if (timeDiff < 10 || (e.movementX === 0 && e.movementY === 0)) {
        this.addSuspiciousActivity('robotic_mouse');
      }
      
      lastMouseTime = currentTime;
    });

    // Check for mouse movements after 10 seconds (more lenient)
    setTimeout(() => {
      if (mouseMovements < 2) {
        this.addSuspiciousActivity('no_mouse_movement');
      }
    }, 10000);
  }

  addKeyboardTracker() {
    let keyPresses = 0;
    let keyTimings = [];
    
    document.addEventListener('keydown', (e) => {
      keyPresses++;
      keyTimings.push(Date.now());
      
      // Detect rapid, uniform key presses (bot behavior)
      if (keyTimings.length > 5) {
        const intervals = keyTimings.slice(-5).map((time, i, arr) => 
          i > 0 ? time - arr[i-1] : 0
        ).slice(1);
        
        const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
        const variance = intervals.reduce((sum, interval) => 
          sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
        
        // Low variance indicates robotic typing
        if (variance < 100) {
          this.addSuspiciousActivity('robotic_typing');
        }
      }
    });
  }

  addScrollTracker() {
    let scrollEvents = 0;
    let scrollSpeeds = [];
    
    document.addEventListener('scroll', () => {
      scrollEvents++;
      scrollSpeeds.push(window.scrollY);
      
      // Detect unnatural scroll patterns
      if (scrollSpeeds.length > 10) {
        const recentSpeeds = scrollSpeeds.slice(-10);
        const isUniform = recentSpeeds.every((speed, i) => 
          i === 0 || Math.abs(speed - recentSpeeds[i-1]) < 5
        );
        
        if (isUniform) {
          this.addSuspiciousActivity('robotic_scrolling');
        }
      }
    });
  }

  // 4. Timing Analysis
  addTimingAnalysis() {
    const startTime = performance.now();
    
    // Check page load speed (bots often load faster) - more lenient
    window.addEventListener('load', () => {
      const loadTime = performance.now() - startTime;
      if (loadTime < 50) { // Very fast loads only
        this.addSuspiciousActivity('too_fast_load');
      }
    });

    // Check for immediate actions (bots don't wait)
    let hasUserInteracted = false;
    ['click', 'scroll', 'keydown', 'mousemove'].forEach(event => {
      document.addEventListener(event, () => {
        hasUserInteracted = true;
      }, { once: true });
    });

    setTimeout(() => {
      if (!hasUserInteracted) {
        this.addSuspiciousActivity('no_interaction');
      }
    }, 2000);
  }

  // 5. Canvas Fingerprinting for Bot Detection
  addCanvasFingerprinting() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Draw complex pattern
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Anti-scraping protection 🛡️', 2, 2);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillRect(100, 5, 80, 20);
      
      const fingerprint = canvas.toDataURL();
      
      // Bots often have identical canvas fingerprints
      if (fingerprint === 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==') {
        this.addSuspiciousActivity('generic_canvas');
      }
      
      // Store fingerprint for validation
      sessionStorage.setItem('canvas_fp', fingerprint);
    } catch (e) {
      this.addSuspiciousActivity('canvas_blocked');
    }
  }

  // 6. Dynamic Challenges
  addDynamicChallenges() {
    // Math challenge
    const mathChallenge = () => {
      const a = Math.floor(Math.random() * 10) + 1;
      const b = Math.floor(Math.random() * 10) + 1;
      const answer = prompt(`Security Check: What is ${a} + ${b}?`);
      return parseInt(answer) === (a + b);
    };

    // Visual challenge
    const visualChallenge = () => {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.innerHTML = `
          <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                      background: rgba(0,0,0,0.8); z-index: 10000; display: flex; 
                      justify-content: center; align-items: center;">
            <div style="background: white; padding: 2rem; border-radius: 8px; text-align: center;">
              <h3>Security Verification</h3>
              <p>Click the button to continue</p>
              <button id="verify-btn" style="padding: 1rem 2rem; background: #007bff; 
                                           color: white; border: none; border-radius: 4px; cursor: pointer;">
                I'm Human
              </button>
            </div>
          </div>
        `;
        
        document.body.appendChild(overlay);
        
        document.getElementById('verify-btn').addEventListener('click', () => {
          overlay.remove();
          resolve(true);
        });
        
        // Auto-fail after 30 seconds
        setTimeout(() => {
          if (overlay.parentElement) {
            overlay.remove();
            resolve(false);
          }
        }, 30000);
      });
    };

    // Trigger challenges based on suspicion level - much higher threshold
    if (this.challenges.length > 10) {
      visualChallenge().then(passed => {
        if (!passed) {
          this.triggerBotProtection();
        }
      });
    }
  }

  // 7. Developer Tools Protection
  protectDevTools() {
    // Detect DevTools opening
    let devtools = { open: false };
    
    setInterval(() => {
      if (window.outerHeight - window.innerHeight > 200 || 
          window.outerWidth - window.innerWidth > 200) {
        if (!devtools.open) {
          devtools.open = true;
          this.addSuspiciousActivity('devtools_opened');
        }
      } else {
        devtools.open = false;
      }
    }, 500);

    // Disable right-click context menu
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.addSuspiciousActivity('right_click_attempt');
    });

    // Disable common keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
      if (e.key === 'F12' || 
          (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
          (e.ctrlKey && e.key === 'u')) {
        e.preventDefault();
        this.addSuspiciousActivity('devtools_shortcut');
      }
    });
  }

  // Utility Methods
  encryptText(text) {
    return text.split('').map(char => 
      String.fromCharCode(char.charCodeAt(0) + 1)
    ).join('');
  }

  injectFakeContent() {
    const fakeData = [
      'Fake sensitive information for bots',
      'This is honeypot data - not real',
      'Bot detected - logging attempt'
    ];
    
    fakeData.forEach(data => {
      const fakeElement = document.createElement('div');
      fakeElement.textContent = data;
      fakeElement.style.display = 'none';
      fakeElement.setAttribute('data-fake', 'true');
      document.body.appendChild(fakeElement);
    });
  }

  addSuspiciousActivity(type) {
    this.challenges.push({
      type,
      timestamp: Date.now(),
      userAgent: navigator.userAgent
    });

    // Send to backend for logging - much higher threshold
    if (this.challenges.length > 15) {
      this.triggerBotProtection();
    }
  }

  triggerBotProtection() {
    // Clear page content
    document.body.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; 
                  height: 100vh; font-family: Arial, sans-serif; text-align: center;">
        <div>
          <h1>🛡️ Access Restricted</h1>
          <p>Automated access detected. Please use a regular web browser.</p>
          <p>If you believe this is an error, please contact support.</p>
        </div>
      </div>
    `;

    // Send bot detection report to backend
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    fetch(`${API_BASE_URL}/security/bot-detected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenges: this.challenges,
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      })
    }).catch(() => {}); // Ignore errors
  }

  // Public method to check if user is verified - much more lenient
  isVerifiedHuman() {
    // Always return true in development mode
    if (this.isDevelopment) {
      return true;
    }
    return !this.isBot && this.challenges.length < 10;
  }
}

// Initialize protection
const antiScraping = new AntiScrapingProtection();

export default antiScraping;
