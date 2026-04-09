# Contributing

Contributions are welcome. Please follow the workflow below to avoid overlapping work.

## Claim / Lock Workflow

Before starting work on an issue:

1. Add labels: `claimed`, `in-progress`
2. Assign yourself
3. Comment with:

```text
/claim
owner: <your-username>
issue: #<number>
branch: <your-username>/<issue>-<slug>
started: <ISO-8601 timestamp>
```

If an issue is already claimed or has an open PR, do not start new work on it.

When blocked: switch label to `blocked` and leave a short status comment.
When done: remove `claimed`/`in-progress` labels, link the PR in the claim comment, and close it.

## Workflow

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Test locally: `docker compose up` and verify at `http://localhost:3000`
4. Open a pull request against `main`

## What to Contribute

- UI improvements and new features
- UniFi firmware compatibility fixes
- Bug fixes and security hardening
- Documentation improvements

## Code Style

- Plain Node.js / CommonJS — no build step
- Keep `server.js` and `unifi-client.js` self-contained; avoid new dependencies unless necessary
- Vanilla HTML/CSS/JS in `public/` — no frontend frameworks or build tools

## Versioning

This project uses [SemVer](https://semver.org/). Version bumps are handled by maintainers at release time.
