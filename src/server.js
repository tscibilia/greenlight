const crypto = require('node:crypto');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const UniFiClient = require('./unifi-client');

const app = express();

// --- Config from environment ---
const {
  UNIFI_HOST,
  UNIFI_USERNAME,
  UNIFI_PASSWORD,
  UNIFI_API_KEY,
  UNIFI_SITE = 'default',
  FILTER_ID = '',
  PORT = '3000',
} = process.env;

if (!UNIFI_HOST) {
  console.error('Missing required env var: UNIFI_HOST');
  process.exit(1);
}

if (!UNIFI_API_KEY && (!UNIFI_USERNAME || !UNIFI_PASSWORD)) {
  console.error(
    'Auth required: set UNIFI_API_KEY, or both UNIFI_USERNAME and UNIFI_PASSWORD'
  );
  process.exit(1);
}

const client = new UniFiClient({
  host: UNIFI_HOST,
  username: UNIFI_USERNAME,
  password: UNIFI_PASSWORD,
  apiKey: UNIFI_API_KEY,
  site: UNIFI_SITE,
});

if (UNIFI_API_KEY) {
  console.log('[server] Using API key authentication');
} else {
  console.log('[server] Using username/password authentication');
}

// --- Middleware ---

// Generate a per-request nonce so scripts load even behind reverse proxies
// (e.g. Authentik forward auth) where 'self' can be blocked.
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
        imgSrc: ["'self'", 'data:'],
      },
    },
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'), {
  index: false, // Don't serve index.html as static — we inject a nonce below
}));

// Rate limit API calls — prevent accidental spam from the UI
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute' },
});
app.use('/api', apiLimiter);

// --- API Routes ---

// List all content filters (or the one specified by FILTER_ID)
app.get('/api/filters', async (req, res) => {
  try {
    const filters = await client.getContentFilters();

    // If FILTER_ID is set, only return that one
    if (FILTER_ID) {
      const match = Array.isArray(filters)
        ? filters.find((f) => f._id === FILTER_ID || f.id === FILTER_ID)
        : filters;
      return res.json(match ? [match] : []);
    }

    res.json(Array.isArray(filters) ? filters : [filters]);
  } catch (err) {
    console.error('[api] GET /filters error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Get a specific filter's details
app.get('/api/filters/:id', async (req, res) => {
  try {
    const filter = await client.getContentFilter(req.params.id);
    res.json(filter);
  } catch (err) {
    console.error('[api] GET /filters/:id error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Add a domain to a filter's allowlist
app.post('/api/filters/:id/allowlist', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ error: 'domain is required' });
    }

    const result = await client.addToAllowlist(req.params.id, domain);
    res.json(result);
  } catch (err) {
    console.error('[api] POST allowlist error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Remove a domain from a filter's allowlist
app.delete('/api/filters/:id/allowlist', async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ error: 'domain is required' });
    }

    const result = await client.removeFromAllowlist(req.params.id, domain);
    res.json(result);
  } catch (err) {
    console.error('[api] DELETE allowlist error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// --- SPA fallback (injects CSP nonce into index.html) ---
const indexPath = path.join(__dirname, '..', 'public', 'index.html');
const indexTemplate = fs.readFileSync(indexPath, 'utf8');

app.get('/{*splat}', (req, res) => {
  const html = indexTemplate.replace(
    '<script src="app.js"></script>',
    `<script nonce="${res.locals.cspNonce}" src="app.js"></script>`
  );
  res.type('html').send(html);
});

// --- Start ---
app.listen(parseInt(PORT, 10), '0.0.0.0', () => {
  console.log(`[server] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[server] UniFi host: ${UNIFI_HOST}, site: ${UNIFI_SITE}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[server] SIGTERM received, logging out...');
  await client.logout();
  process.exit(0);
});
