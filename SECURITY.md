# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please open a [GitHub Security Advisory](../../security/advisories/new) rather than a public issue.

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

All reports will be acknowledged and addressed promptly.

## Security Best Practices

### Container Security

This container runs as a non-root user (UID/GID 1000) by default.

Recommended Kubernetes deployment:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
```

### Configuration

- Do not store secrets in plaintext — use env vars or a secrets manager for `UNIFI_API_KEY` and `UNIFI_PASSWORD`
- Restrict network exposure — Greenlight should only be accessible on your local network, not the public internet
- Use API key authentication over username/password when possible

### Image

- Based on `node:22-alpine` (minimal attack surface)
- No shell utilities or package managers in the final image layer
- Images are signed and built via GitHub Actions — verify with `cosign` if needed

## Supported Versions

| Version | Supported |
|---|---|
| latest | ✅ |
| < latest | ❌ |
