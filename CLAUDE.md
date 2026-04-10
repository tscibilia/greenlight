# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Greenlight is a lightweight web UI for managing domain allowlists on UniFi content filters. It talks to UniFi's undocumented v2 content-filtering API and runs as a hardened Docker container.

## Commands

```bash
# Development (auto-restarts on changes)
npm run dev

# Production
npm start

# Build Docker image
docker build -t greenlight .

# Run via Docker Compose
docker compose up -d
```

There is no linter, formatter, or unit test suite configured. CI runs E2E tests by building the Docker image, starting the container, and hitting endpoints with curl (see `.github/workflows/test.yaml`).

## Architecture

**Backend** — `src/server.js`: Express server with four API routes:
- `GET /api/filters` — list content filters (optionally restricted by `FILTER_ID` env var)
- `GET /api/filters/:id` — get a single filter
- `POST /api/filters/:id/allowlist` — add domain to allowlist
- `DELETE /api/filters/:id/allowlist` — remove domain from allowlist

**UniFi client** — `src/unifi-client.js`: Zero-dependency HTTPS client for UniFi controllers. Key behaviors:
- Supports both API key auth (`X-API-Key` header) and session-based username/password auth (cookie + CSRF token)
- `updateContentFilter()` auto-negotiates the correct HTTP method/path across firmware versions (tries PUT with ID → PUT without → PATCH)
- `_findAllowlistKey()` auto-detects the allowlist field name since UniFi uses different key names across versions
- TLS verification is disabled globally (`NODE_TLS_REJECT_UNAUTHORIZED=0`) because UDM controllers use self-signed certs

**Frontend** — `public/`: Vanilla HTML/CSS/JS single-page app served as static files. No build step.

## Configuration

All config is via environment variables (see `.env.example`). Required: `UNIFI_HOST` plus either `UNIFI_API_KEY` or both `UNIFI_USERNAME`/`UNIFI_PASSWORD`.

## Docker

The container runs as non-root (UID/GID 1000 by default, configurable via `APP_UID`/`APP_GID` build args), with a read-only filesystem, all capabilities dropped, and no privilege escalation.

## Potential Pitfalls

- **Auth failure:** Ensure `UNIFI_API_KEY` or both username/password are set
- **Self-signed cert:** The HTTPS client has `rejectUnauthorized: false` — don't remove it
- **Domain validation:** Regex in `unifi-client.js` rejects invalid formats; normalize first
- **Filter ID mismatch:** Some UniFi versions use `_id`, others use `id`; check both
- **Session expiry:** API key auth doesn't need re-login; password auth auto-retries on 401