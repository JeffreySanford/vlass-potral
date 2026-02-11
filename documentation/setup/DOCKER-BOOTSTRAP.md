# Docker Bootstrap (MVP)

Status date: 2026-02-07

## MVP Services

- postgres

- redis

Application services (`cosmic-horizons-web`, `cosmic-horizons-api`) are started via Nx after infra
is healthy:

```bash
pnpm start:all

```

Or manually:

```bash
pnpm start:infra
pnpm start:web
pnpm start:api

```

## Deferred Services

- Go microservice containers

- Mode B-specific workers

## Notes

If a future v1.1 or v2 feature introduces new services, update

## `PRODUCT-CHARTER.md` and `SCOPE-LOCK.md` first

---

*Cosmic Horizon Development - (c) 2026 Jeffrey Sanford. All rights reserved.*
