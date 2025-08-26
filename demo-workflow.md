# Anti-Scraping System Demo Workflow

This document demonstrates the complete workflow of the anti-scraping system and how to test its effectiveness.

## 🚀 Quick Start Demo

### 1. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend  
npm run dev
```

### 2. Access the Application

Open your browser and navigate to: http://localhost:5173

You should see the login page with a security notice about device-bound authentication.

### 3. Create an Account

1. Click "Sign up" to go to the registration page
2. Fill in the form:
   - Username: `testuser`
   - Email: `test@example.com`
   - Password: `password123`
3. Click "Create account"

**What happens behind the scenes:**
- Browser generates ECDSA P-256 key pair using Web Crypto API
- Private key is stored securely in IndexedDB
- Public key is sent to server with registration data
- Server creates device-bound access token
- Fingerprint is collected and stored

### 4. Explore the Dashboard

After successful registration, you'll be redirected to the dashboard showing:
- User statistics
- Security status indicators
- Quick action buttons

### 5. Test CRUD Operations

1. Click "Manage Posts" to go to the posts page
2. Create a new post by clicking "New Post"
3. Fill in title and content, then save
4. Try editing and deleting posts

**What happens behind the scenes:**
- Every API request is signed with your device's private key
- Server verifies the DPoP proof using your stored public key
- Requests without proper signatures are rejected

## 🔒 Testing Anti-Scraping Measures

### Test 1: Token Theft Simulation

1. **Open Developer Tools** (F12)
2. **Go to Application/Storage tab**
3. **Find the access token** in localStorage or check network requests
4. **Copy the token**
5. **Open a new incognito window**
6. **Try to make API requests** using the copied token

**Expected Result:** All requests should fail with 401 Unauthorized because the incognito window doesn't have the private key needed to sign requests.

### Test 2: Automated Testing

Run the automated test suite:
```bash
node test-anti-scraping.js
```

This will test:
- Unauthenticated access (should be blocked)
- Registration without device key (should be blocked)  
- Token usage without DPoP proof (should be blocked)
- Rate limiting (should trigger after many requests)
- Invalid data handling (should be rejected)
- Security headers (should be present)

### Test 3: Browser Fingerprint Changes

1. **Login normally**
2. **Change browser settings:**
   - Zoom level
   - Language preferences
   - Screen resolution (if possible)
3. **Make API requests**

**Expected Result:** Minor changes should be tolerated, but major changes might trigger additional security measures.

### Test 4: Rate Limiting

Make rapid requests to any endpoint:
```bash
for i in {1..50}; do curl http://localhost:3001/api/health; done
```

**Expected Result:** After ~15-20 requests, you should get 429 (Too Many Requests) responses.

## 🛡️ Security Features Demonstrated

### 1. Device-Bound Authentication
- ✅ Tokens are cryptographically bound to device keys
- ✅ Stolen tokens cannot be used without private keys
- ✅ Each request is individually signed and verified

### 2. Anti-Scraping Protection
- ✅ Automated bots cannot easily bypass authentication
- ✅ Rate limiting prevents abuse
- ✅ Fingerprinting detects suspicious changes
- ✅ Request logging enables monitoring

### 3. Privacy-Safe Implementation
- ✅ Fingerprinting uses only low-risk identifiers
- ✅ No cross-site tracking
- ✅ User consent and transparency
- ✅ Graceful degradation for privacy-conscious users

## 🔍 Monitoring and Debugging

### Check Request Logs

The backend logs all requests to the database. You can query them:

```sql
-- Connect to the SQLite database
sqlite3 backend/database.sqlite

-- View recent requests
SELECT 
  datetime(created_at) as time,
  ip_address,
  method,
  endpoint,
  status_code,
  user_id
FROM request_logs 
ORDER BY created_at DESC 
LIMIT 20;
```

### Monitor Device Keys

```sql
-- View active device keys
SELECT 
  u.username,
  dk.key_id,
  datetime(dk.created_at) as created,
  datetime(dk.last_used) as last_used,
  dk.is_active
FROM device_keys dk
JOIN users u ON dk.user_id = u.id
WHERE dk.is_active = 1;
```

### Check for Suspicious Activity

```sql
-- Find high-frequency requests from single IPs
SELECT 
  ip_address,
  COUNT(*) as request_count,
  MIN(datetime(created_at)) as first_request,
  MAX(datetime(created_at)) as last_request
FROM request_logs 
WHERE created_at > datetime('now', '-1 hour')
GROUP BY ip_address
HAVING request_count > 50
ORDER BY request_count DESC;
```

## 🎯 Attack Scenarios and Defenses

### Scenario 1: Credential Stuffing
**Attack:** Automated login attempts with stolen credentials
**Defense:** Rate limiting on auth endpoints + account lockout

### Scenario 2: Session Hijacking  
**Attack:** Stealing and reusing session tokens
**Defense:** Device-bound tokens that require private key signatures

### Scenario 3: API Scraping
**Attack:** Automated data extraction via API calls
**Defense:** DPoP proof requirement + behavioral analysis

### Scenario 4: Browser Automation
**Attack:** Using headless browsers to bypass protections
**Defense:** Fingerprint analysis + suspicious pattern detection

## 📊 Performance Impact

The security measures have minimal performance impact:

- **Key generation:** ~50-100ms (one-time per device)
- **DPoP signing:** ~1-5ms per request
- **Server verification:** ~2-10ms per request
- **Fingerprinting:** ~10-20ms (cached after first collection)

## 🔧 Customization Options

### Adjust Security Levels

Edit `backend/.env`:

```env
# Stricter fingerprint matching
FINGERPRINT_TOLERANCE=0.9

# More aggressive rate limiting  
RATE_LIMIT_MAX=50
AUTH_RATE_LIMIT_MAX=3

# Shorter token lifetime
JWT_EXPIRES_IN=5m
```

### Add Custom Security Rules

Extend `backend/middleware/security.js` to add:
- IP-based blocking
- Geolocation checks
- Time-based access controls
- Custom behavioral analysis

## 🎉 Success Indicators

Your anti-scraping system is working if:

1. ✅ Normal users can register and use the app seamlessly
2. ✅ Stolen tokens cannot be used from different devices/browsers
3. ✅ Automated requests without proper signatures are blocked
4. ✅ Rate limiting prevents abuse
5. ✅ Security headers are present in all responses
6. ✅ Request logs show proper monitoring data

## 🚨 Troubleshooting

### Common Issues

**"DPoP proof invalid"**
- Check that Web Crypto API is available
- Verify private key is stored correctly in IndexedDB
- Ensure system clock is synchronized

**"Fingerprint mismatch"**  
- Adjust `FINGERPRINT_TOLERANCE` setting
- Check for browser extensions affecting fingerprint
- Verify fingerprint data collection is working

**Rate limiting too aggressive**
- Increase `RATE_LIMIT_MAX` values
- Adjust time windows
- Implement user-specific limits

This completes the demonstration of a robust anti-scraping system that balances security with usability!
