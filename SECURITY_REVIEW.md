# Security Review

Last reviewed: 2026-04-09

## Scope

Express API server proxying requests to a local UniFi controller's content-filtering API. No database, no user accounts, no persistent state.

## Findings

### ✅ Passed

| Area | Detail |
|---|---|
| **XSS** | No user-controlled values are rendered as HTML. API responses are JSON only. Frontend is static files served via Express `static()`. |
| **Injection** | No shell execution, no database queries, no dynamic `eval`. Domain input is validated against a strict regex before use. |
| **Path traversal** | Static assets served from `/public` via Express `static()`. No dynamic file reads from user input. |
| **Dependencies** | Three runtime dependencies: `express`, `helmet`, `express-rate-limit`. No auth libraries, no database drivers, no templating engines. |
| **Container** | Runs as non-root (UID 1000). Multi-stage build; only production deps in final image. Read-only filesystem with all capabilities dropped. |
| **Network** | Binds to `0.0.0.0` on a single port. Outbound connections only to the configured UniFi controller. |
| **Secrets** | No secrets in image or code. All credentials passed via environment variables. |
| **Rate limiting** | API endpoints rate-limited to 30 requests/minute via `express-rate-limit`. |
| **Security headers** | `helmet` middleware sets CSP, X-Content-Type-Options, X-Frame-Options, and other hardening headers. |

### ⚠️ Notes

| Area | Detail |
|---|---|
| **Self-signed TLS** | `NODE_TLS_REJECT_UNAUTHORIZED=0` is set globally in `unifi-client.js` to allow connections to UniFi controllers with self-signed certificates. This is standard for local UDM deployments but disables TLS verification for all outbound HTTPS from the process. |
| **No authentication** | The Greenlight UI itself has no login — by design, so family members can use it without credentials. It should only be exposed on a trusted local network. |
| **Session tokens** | When using username/password auth, session cookies and CSRF tokens are held in memory. They are not persisted and are cleared on restart. |

## Recommendations

- [ ] Scope TLS override to UniFi connections only instead of setting it globally via `NODE_TLS_REJECT_UNAUTHORIZED`
- [ ] Pin base image to a specific digest in `Dockerfile` for supply-chain integrity
- [ ] Consider optional basic auth or IP allowlisting for the UI in untrusted network environments
