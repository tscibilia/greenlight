const https = require('node:https');
const { URL } = require('node:url');

class UniFiClient {
  constructor({ host, username, password, apiKey, site = 'default' }) {
    this.host = host.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
    this.apiKey = apiKey;
    this.site = site;
    this.cookies = [];
    this.csrfToken = null;
  }

  async _request(method, path, body = null) {
    const url = new URL(path, this.host);

    const headers = {
      'Content-Type': 'application/json',
    };

    // API key auth — skip cookies/CSRF entirely
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    if (this.cookies.length) {
      headers['Cookie'] = this.cookies.join('; ');
    }
    if (this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }

    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers,
      rejectUnauthorized: false,
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString();

          // Capture set-cookie headers
          if (res.headers['set-cookie']) {
            this.cookies = res.headers['set-cookie'].map(
              (c) => c.split(';')[0]
            );
          }

          // Capture CSRF token
          if (res.headers['x-csrf-token']) {
            this.csrfToken = res.headers['x-csrf-token'];
          }

          let parsed;
          try {
            parsed = JSON.parse(rawBody);
          } catch {
            parsed = rawBody;
          }

          if (res.statusCode >= 400) {
            const err = new Error(
              `UniFi API ${res.statusCode}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`
            );
            err.statusCode = res.statusCode;
            err.body = parsed;
            return reject(err);
          }

          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      });

      req.on('error', reject);

      // Allow self-signed certs on UDM
      req.socket?.setKeepAlive(true);

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async login() {
    const res = await this._request('POST', '/api/auth/login', {
      username: this.username,
      password: this.password,
      remember: true,
    });
    console.log('[unifi] Logged in successfully');
    return res;
  }

  async ensureLoggedIn() {
    // API key auth doesn't need a session
    if (this.apiKey) return;

    try {
      await this._request('GET', '/proxy/network/api/s/default/self');
    } catch {
      await this.login();
    }
  }

  async getContentFilters() {
    await this.ensureLoggedIn();
    const res = await this._request(
      'GET',
      `/proxy/network/v2/api/site/${this.site}/content-filtering`
    );
    return res.data;
  }

  async getContentFilter(filterId) {
    await this.ensureLoggedIn();

    // Try with ID first, fall back to base endpoint (single-object API)
    try {
      const res = await this._request(
        'GET',
        `/proxy/network/v2/api/site/${this.site}/content-filtering/${filterId}`
      );
      return res.data;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 405) {
        // Single-object API — GET base returns everything
        const res = await this._request(
          'GET',
          `/proxy/network/v2/api/site/${this.site}/content-filtering`
        );
        const data = res.data;
        // If it's an array, find by ID; otherwise return the whole object
        if (Array.isArray(data)) {
          return data.find((f) => f._id === filterId || f.id === filterId) || data[0];
        }
        return data;
      }
      throw err;
    }
  }

  async updateContentFilter(filterId, payload) {
    await this.ensureLoggedIn();
    const basePath = `/proxy/network/v2/api/site/${this.site}/content-filtering`;

    // Try PUT with ID, then PUT without ID, then PATCH without ID
    const attempts = [
      { method: 'PUT', path: `${basePath}/${filterId}` },
      { method: 'PUT', path: basePath },
      { method: 'PATCH', path: basePath },
    ];

    let lastErr;
    for (const { method, path } of attempts) {
      try {
        const res = await this._request(method, path, payload);
        console.log(`[unifi] Update succeeded: ${method} ${path}`);
        return res.data;
      } catch (err) {
        lastErr = err;
        if (err.statusCode === 405 || err.statusCode === 404) {
          console.log(`[unifi] ${method} ${path} returned ${err.statusCode}, trying next...`);
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async addToAllowlist(filterId, domain) {
    // Normalize: strip protocol, www, trailing slash, whitespace
    domain = domain
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .toLowerCase();

    if (!domain || !/^[a-z0-9]([a-z0-9-]*\.)+[a-z]{2,}$/.test(domain)) {
      throw new Error(`Invalid domain: "${domain}"`);
    }

    const filter = await this.getContentFilter(filterId);

    const allowlistKey = this._findAllowlistKey(filter);
    const currentList = filter[allowlistKey] || [];

    if (currentList.includes(domain)) {
      return { message: `"${domain}" is already in the allowlist`, filter };
    }

    const updatedList = [...currentList, domain];
    const updatedFilter = { ...filter, [allowlistKey]: updatedList };

    const result = await this.updateContentFilter(filterId, updatedFilter);
    return { message: `Added "${domain}" to allowlist`, filter: result };
  }

  async removeFromAllowlist(filterId, domain) {
    domain = domain.trim().toLowerCase();

    const filter = await this.getContentFilter(filterId);
    const allowlistKey = this._findAllowlistKey(filter);
    const currentList = filter[allowlistKey] || [];

    const updatedList = currentList.filter((d) => d !== domain);
    if (updatedList.length === currentList.length) {
      return { message: `"${domain}" was not in the allowlist`, filter };
    }

    const updatedFilter = { ...filter, [allowlistKey]: updatedList };
    const result = await this.updateContentFilter(filterId, updatedFilter);
    return { message: `Removed "${domain}" from allowlist`, filter: result };
  }

  _findAllowlistKey(filter) {
    // Try known field names for the allowlist in content filtering
    const candidates = [
      'allowedUrls',
      'allowed_urls',
      'allowlist',
      'allowed',
      'whitelistedUrls',
      'whitelisted_urls',
      'whitelist',
      'excludedUrls',
      'excluded_urls',
    ];

    for (const key of candidates) {
      if (Array.isArray(filter[key])) {
        return key;
      }
    }

    // If none found, check all array-valued keys
    for (const [key, value] of Object.entries(filter)) {
      if (Array.isArray(value) && key.toLowerCase().includes('allow')) {
        return key;
      }
    }

    // Default — the API will tell us if this is wrong on first use
    console.warn(
      '[unifi] Could not auto-detect allowlist field. Available keys:',
      Object.keys(filter)
    );
    return 'allowedUrls';
  }

  async logout() {
    try {
      await this._request('POST', '/api/auth/logout');
      console.log('[unifi] Logged out');
    } catch {
      // ignore logout errors
    }
  }
}

// Disable TLS rejection for self-signed UDM certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

module.exports = UniFiClient;
