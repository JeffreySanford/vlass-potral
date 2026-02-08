# Roadmap

Status date: 2026-02-08

Canonical scope: `documentation/PRODUCT-CHARTER.md` and `SCOPE-LOCK.md`.

Tracking rule:
- `ROADMAP.md` is forward-looking (what is next).
- Completed implementation history is journaled in `TODO.md` ("Archived Completed Items") and release notes.

## MVP (v1.0)
1. Pillar 1: SSR first paint
- Landing SSR preview
- Performance tuning for FCP/LCP targets
- Status: complete (SSR regional preview on auth/landing, client-only telemetry overlay, gated perf tests)

2. Pillar 2: Viewer + permalink + snapshots
- Aladin integration (Mode A only)
- Viewer state encoding/decoding
- Persistent permalink resolution
- PNG snapshot workflow
- Labeling centered targets in viewer state
- FITS science cutout download path
- Status: complete (Mode A + state/permalink/snapshot/cutout + reliability hardening + telemetry dashboarding)

3. Pillar 3: Community notebooks
- Post create/edit/read
- Revision history and diff
- Moderation controls for posts
- Tag workflow
- Status: complete (post create/edit/publish + revisions + hide/lock moderation flow are implemented and tested)

4. Foundations
- Auth + verification gates
- Audit logging
- Rate limiting
- CI baseline test gate

## v1.0 Completion
- MVP pillars are implemented in local environment.
- Remaining work before public deployment is operational hardening (performance tuning, CI trend baselines, release packaging).

## v1.1 (Quick wins)
- Comments/replies
- Profile polish
- Feed enhancements

## v2
- Mode B canvas viewer
- FITS proxy/caching and advanced download controls
- Optional Rust render tier for heavy compute paths

## Out of Scope for MVP
- Go microservice
- Mode B implementation
- Comments/replies
- Full FITS proxy/caching tier (simple cutout passthrough is now available)
