# User Verification & Authentication (MVP)

Status date: 2026-02-07
Canonical scope: `documentation/PRODUCT-CHARTER.md` + `SCOPE-LOCK.md`.

## Current Auth States
- Anonymous: read-only access
- Authenticated: JWT-backed API access with session-compatible routes

## MVP Unlocks
- Credential registration and login (`/api/auth/register`, `/api/auth/login`)
- Token issuance (`Bearer`) and authenticated write-path protection
- Session-compatible GitHub OAuth endpoints retained

## Deferred Unlocks
- Email verification workflow (deferred; route not implemented)
- Comments/replies (v1.1)
- FITS proxy access paths (v2)

## Route Surface
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/auth/login`
- `GET /api/auth/github/callback`

All auth DTOs should align to contracts in `libs/shared/models`.
