# UniFi Greenlight

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/tscibilia/greenlight?style=for-the-badge&sort=semver)](https://github.com/tscibilia/greenlight/releases)&nbsp;&nbsp;
[![Build](https://img.shields.io/github/actions/workflow/status/tscibilia/greenlight/build.yaml?style=for-the-badge)](https://github.com/tscibilia/greenlight/actions/workflows/build.yaml)&nbsp;&nbsp;
[![License](https://img.shields.io/github/license/tscibilia/greenlight?style=for-the-badge)](https://github.com/tscibilia/greenlight/blob/main/LICENSE)&nbsp;&nbsp;

</div>

> A lightweight web UI for managing the allowlist on UniFi's ad-blocking content filter. Designed so family members on your local network can greenlight a website without needing access to the UniFi controller. Full disclosure, this is a vibe coded solution for personal use :robot:

## Features

- Add or remove domains from the content filter allowlist
- Simple, mobile-friendly dark UI — no login required
- Supports multiple content filter profiles (auto-detected)
- API key or username/password authentication to UniFi
- Hardened Docker container (non-root, read-only FS, no capabilities)

## Quick Start

### 1. Clone and configure

```bash
git clone <your-repo-url>
cd greenlight
cp .env.example .env
```

Edit `.env` with your UniFi controller details:

```env
UNIFI_HOST=https://192.168.1.1
UNIFI_SITE=default

# Option 1: API key (preferred)
UNIFI_API_KEY=your-key-here

# Option 2: username/password
UNIFI_USERNAME=admin
UNIFI_PASSWORD=changeme
```

### 2. Run with Docker Compose

```bash
docker compose up -d --build
```

Open `http://<your-server>:3000` in a browser.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UNIFI_HOST` | Yes | — | UniFi controller URL (e.g. `https://192.168.1.1`) |
| `UNIFI_API_KEY` | No* | — | API key (create in UniFi OS > Admins > API Keys) |
| `UNIFI_USERNAME` | No* | — | Admin username |
| `UNIFI_PASSWORD` | No* | — | Admin password |
| `UNIFI_SITE` | No | `default` | UniFi site name |
| `FILTER_ID` | No | — | Restrict UI to a specific filter ID |
| `PORT` | No | `3000` | App listen port |

\* Either `UNIFI_API_KEY` or both `UNIFI_USERNAME` and `UNIFI_PASSWORD` must be set.

## Authentication

Greenlight supports 2 styles of authentication:

- UniFi API Key
- Username & Password (Deprecated)

Click the below headers to view the instructions:

<details>
<summary>UniFi API Key — Network v9.0.0+</summary>
<br>

API key authentication is the recommended method. It avoids session management overhead, doesn't expire on idle, and works with UniFi Network v9.0.0 and later.

1. Log into your UniFi controller
2. Go to **Settings > Admins**
3. Select your admin account
4. Create an API key under **API Keys**
5. Set `UNIFI_API_KEY` in your `.env`

```env
UNIFI_API_KEY=your-key-here
```

</details>

<details>
<summary>Username & Password (Deprecated)</summary>
<br>

> [!WARNING]
> Username/password authentication is deprecated and may be removed in a future release. Migrate to API key authentication when possible.

Set `UNIFI_USERNAME` and `UNIFI_PASSWORD` in your `.env`. The app manages login sessions automatically and re-authenticates when the session expires.

```env
UNIFI_USERNAME=admin
UNIFI_PASSWORD=changeme
```

</details>

## Custom UID/GID

The container defaults to UID/GID `1000`. Override at build or runtime:

```bash
# Build-time
docker build --build-arg APP_UID=1500 --build-arg APP_GID=1500 -t greenlight .

# Docker Compose (via environment or .env)
APP_UID=1500 APP_GID=1500 docker compose up -d --build
```

For Kubernetes, use `securityContext`:

```yaml
securityContext:
  runAsUser: 1500
  runAsGroup: 1500
  runAsNonRoot: true
  allowPrivilegeEscalation: false
```

## Security

The Docker container follows least-privilege principles:

- **Non-root user** — configurable UID/GID
- **Read-only filesystem** — only `/tmp` is writable
- **All capabilities dropped** — `cap_drop: ALL`
- **No privilege escalation** — `security_opt: no-new-privileges`
- **Rate limiting** — 30 requests/minute on API endpoints
- **Helmet** — CSP headers, XSS protection
- **Self-signed TLS** — accepted for UDM connections (standard for local controllers)

## How It Works

The app uses UniFi's undocumented v2 content-filtering API:

1. **Authenticate** — `POST /api/auth/login` (or API key header)
2. **List filters** — `GET /proxy/network/v2/api/site/{site}/content-filtering`
3. **Update filter** — `PUT /proxy/network/v2/api/site/{site}/content-filtering`

The update endpoint auto-negotiates the correct method/path for your firmware version.

## Project Structure

```
greenlight/
├── src/
│   ├── server.js          Express server + API routes
│   └── unifi-client.js    UniFi API client
├── public/
│   ├── index.html         Single-page UI
│   ├── style.css          Dark theme styles
│   └── app.js             Frontend logic
├── Dockerfile             Multi-stage, non-root
├── docker-compose.yml     Production-ready config
├── .env.example           Configuration template
└── package.json
```

## License

MIT
