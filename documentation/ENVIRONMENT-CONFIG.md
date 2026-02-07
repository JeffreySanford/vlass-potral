# Environment Configuration (MVP)

Status date: 2026-02-07

## Principles
- Server-only secrets stay in API environment variables.
- Web client currently uses fixed local API base URL (`http://localhost:3001`) in dev.
- Public VLASS endpoints only; link-out for FITS.

## Required Core Variables
- `NODE_ENV`
- `API_PORT` (or `PORT`)
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `SESSION_SECRET`
- `FRONTEND_URL`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_SSL`
- `DB_LOGGING`

## Deferred Feature Flags
- Mode B toggles (v2)
- FITS proxy toggles (v2)
- Comment feature flags (v1.1)

If config docs conflict with runtime code, source of truth is active code + charter/scope lock.
