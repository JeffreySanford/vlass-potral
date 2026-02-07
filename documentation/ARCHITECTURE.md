# Architecture: VLASS Sky Portal

## System Overview

A public, citizen-friendly VLASS explorer built on:

- **Angular 19 SSR** (fast first paint, module-based components only)
- **NestJS BFF** (auth, RBAC, rate limits, audit, proxy/cache policy, community)
- **Go microservice** (tile manifest, preview compositor, cache engine)
- **RxJS hot streams** (Observable-first async model)
- **WebSockets** (real-time logs, ops, jobs, moderation)
- **SQLite/PostgreSQL** (user accounts, audit retention, community)

## Core Design Principles

1. **Module-based Angular** — `standalone: false` required; all components declared in NgModules.
2. **RxJS hot observables** — no `async/await` in surface code; controllers return `Observable<T>`.
3. **Public-only data** — VLASS/NRAO public endpoints only; no proprietary source access.
4. **Bounded proxy caching** — performance cache, not a dataset mirror; aggressive eviction + size caps.
5. **Audit-first** — every action emits structured events; 90-day retention; correlation IDs throughout.
6. **SSR for UX** — landing page + location-based background fast-painted; client hydrates for interactivity.

## Apps & Libraries (Nx Monorepo Structure)

### Apps

#### `apps/vlass-web` — Angular SSR Application

**Purpose:** User-facing frontend with fast SSR first paint.

**Key features:**

- SSR landing page (generic VLASS background)
- Module-based components (no standalone)
- RxJS hot observables for state management
- WebSocket consumer for real-time events
- Material 3 UI

**Modules:**

- `AuthModule` — login/register/verify
- `LandingModule` — hero + location selector
- `ViewerModule` — viewer switcher + Mode A/B
- `SearchModule` — name resolve + cone search
- `CommunityModule` — feed + post + editor
- `OpsModule` — admin/mod dashboards

#### `apps/vlass-api` — NestJS Backend-for-Frontend (BFF)

**Purpose:** Policy choke point; orchestrates upstream, enforces guardrails, streams audit/ops events.

**Key responsibilities:**

- Email/password auth + JWT
- Rate limiting (per-IP + per-user + per-role)
- RBAC guards (User/Power/Moderator/Admin)
- Audit event emission (90-day retention)
- Proxy/cache policy enforcement
- Community CRUD + moderation
- WebSocket multiplexing (audit, ops, jobs, mod topics)

**Modules:**

- `AuthModule` — registration, login, verification
- `RateLimitModule` — token bucket, tier enforcement
- `RbacModule` — role guards, permission matrix
- `AuditModule` — event logging, retention
- `ProxyModule` — allowlist, caching, crawler defense
- `CommunityModule` — posts, revisions, comments, moderation
- `WsModule` — WebSocket gateway + topic routing

#### `apps/vlass-go` — Go Microservice (Heavy Lifting)

**Purpose:** Fast, concurrent operations for sky math, tile manifest, preview compositing, caching.

**Responsibilities:**

- `manifest`: given RA/Dec + zoom, compute needed tile list
- `preview`: stitch PNG tiles into small preview image (SSR use)
- `proxy`: fetch + cache tiles with deterministic naming + bounds
- `coordinator`: job runner (snapshot generation as async streams, not "async/await")

**Later expansion:**

- Spatial indexing (crossmatch, region queries)
- WCS refinement (accurate projection math)

### Shared Libraries (Angular)

#### `libs/shared/models`

**Purpose:** Single source of truth for all DTOs. Strictly typed, versioned contracts.

**Exports:**

- `ViewerState` (center, fov, epoch, mode, overlays)
- `TileRef` (proxied tile URLs + placement)
- `ManifestResponse` / `PreviewResponse`
- `AuditEvent`, `Envelope<T>` (WebSocket messages)
- `SessionInfo`, `UserPublic`
- `Post`, `PostRevision`, `Comment` (community)
- `ViewerBlock` (Markdown-embedded sky view)
- `Tag`, `TagProposal`

#### `libs/shared/rx-transport`

**Purpose:** WebSocket message envelope, topic routing, correlation ID propagation.

**Exports:**

- `Envelope<T>` (universal message shape)
- Topic types: `'audit' | 'ops' | 'jobs' | 'mod' | 'viewer'`
- `WebSocketError`, `UnsubscribeMessage`

#### `libs/data-access/*`

**Purpose:** Angular services returning hot Observables.

**Examples:**

- `ViewerStateService` — manages viewer interaction state
- `AuthService` — login/logout/session management
- `CommunityService` — post fetch/publish
- `AuditStreamService` — WS consumer for audit logs

#### `libs/ui/*`

**Purpose:** Module-based UI components (no standalone).

**Organization:**

- `libs/ui/shell` — app layout, navigation
- `libs/ui/auth` — login/register forms
- `libs/ui/viewer` — switcher, Mode A/B containers
- `libs/ui/search` — name resolve, cone search inputs
- `libs/ui/community` — feed, post detail, editor

#### `libs/policy/*`

**Purpose:** Shared policy constants, validators, redaction rules.

**Examples:**

- Upstream allowlist
- Rate limit tier definitions
- Audit event redaction patterns
- Cache guardrail constants

### Shared Libraries (NestJS/Backend)

#### `libs/server/auth`

Email/password, JWT, email verification token generation.

#### `libs/server/rbac`

Role decorators, permission guards, RBAC matrix.

#### `libs/server/audit`

Structured audit event logging, correlation ID tracking, 90-day retention job.

#### `libs/server/rate-limit`

Token bucket, tier enforcement, burst limits.

#### `libs/server/proxy-cache`

Allowlist enforcement, upstream request normalization, bounded cache, anti-crawl heuristics.

#### `libs/server/community`

Post CRUD, revision management, comment threading, moderation actions.

#### `libs/server/ws`

WebSocket gateway, topic multiplexing, subscription management.

## Data Flow: "60 Seconds to Sky Map"

### User Journey: Anonymous → Landing → Regional Background → Viewer

```text
1. User visits /

   SSR checks for signed coarse-location cookie.

   If no cookie:
     → Render generic VLASS background + "Use my location / Enter city" prompt

   If cookie exists:
     → Call preview API
     → Return SSR with region-specific PNG background

2. Browser hydrates client-side viewer shell

   ViewerState$ (BehaviorSubject) is initialized with:
   - center from location/overhead computation
   - epoch = "MedianStack" (default)
   - mode = "ALADIN" (default)

3. Viewer switcher is interactive

   User can toggle: [Aladin Lite] [Native Canvas]

   Both use same ViewerState, so switching is seamless.

4. Mode A (Aladin Lite): tiles fetched directly from NRAO HiPS

   Aladin Lite loads https://vlass-dl.nrao.edu/vlass/HiPS/MedianStack/...

   Client can export PNG via getViewDataURL()

5. Mode B (Canvas): tiles fetched via API

   Angular polls /api/view/manifest?ra=&dec=&fov=&zoom=
   Go service returns tile list
   Angular streams tiles and paints to <canvas>
```

### SSR Preview Generation

```text
GET /view/preview?ra=&dec=&fov=&epoch=MedianStack&maxWidthPx=400

→ Nest gateway validates (allowlist, rate limit)

→ Forward to Go service: /preview

Go service:
  • Compute HiPS tile list for region
  • Fetch tiles from vlass-dl (cached locally)
  • Stitch into single PNG (deterministic, bounded size)
  • Return stream

Nest:
  • Cache response (with TTL)
  • Return to client

Frontend SSR:
  • Embed preview PNG as background-image
  • Serve fast first paint
```

## Viewer Modes

### Mode A: Aladin Lite (HiPS-Native)

**Provider:** CDS Aladin Lite JavaScript library.

**Strengths:**

- Instant "works" HiPS support
- Proven track record in astronomy community
- Pan/zoom/overlays mature
- Can export snapshot PNG via API

**Integration pattern:**

- Load Aladin Lite in Angular component (module-based)
- Point it at VLASS HiPS base URL (from config)
- Bind ViewerState changes to Aladin's center/fov
- Bind Aladin view changes back to ViewerState$

**Default policy:**

- Fetch tiles direct-to-NRAO (no proxy, respecting mirroring guardrails)
- CORS handled by Aladin's built-in proxying if needed

### Mode B: Native Canvas Viewer (Good-Enough First)

**Day-1 goal:** "Good enough" tile placement + pan/zoom.

**Bones laid for later:**

- WCS accuracy refinement
- Custom projection matching Aladin
- Rich overlays (compass, scale, horizon mask)

**Integration pattern:**

- Angular component hosts `<canvas>`
- Service calls `/api/view/manifest` (Observable stream)
- Manifest returns tile URLs (proxied) + bounding boxes
- Canvas renders tiles; user pans/zooms
- Panning triggers new manifest request

**Go service computation:**

- HEALPix math (tile order selection)
- Coordinate mapping (RA/Dec ↔ canvas pixels)
- Overlay geometry (grid, horizon)

## Proxy & Caching Guardrails

### "Not a Mirror" Policy

Your cache is a **bounded performance cache**, not a dataset copy.

Rules:

- **On-demand only:** fetch when a user view requested it
- **TTL:** 12 hours default; respect upstream headers
- **Size cap:** 1.5 GB hard limit; eviction policy (LRU)
- **Concurrency:** max 6 concurrent upstream requests
- **User-agent:** identify your app + include contact email
- **Allowlist:** only `vlass-dl.nrao.edu`, `data-query.nrao.edu`, `data.nrao.edu`
- **Anti-crawl:** if a client requests tiles in sequential patterns (obvious scan), rate-limit and block

### Cache Decision Tree

```text
User requests tile at RA/Dec/zoom/epoch

→ Check allowlist (reject if not)

→ Check cache (hit? return + streamed to client)

→ Not cached:
   • Normalize RA/Dec to HiPS tile ID
   • Construct upstream URL
   • Fetch with backoff/timeout/circuit-breaker
   • Store locally (with metadata: etag, content-length, ts)
   • Stream to client
   • Emit audit event

→ Cache growing? Run eviction:
   • LRU + age
   • Stop when under 80% capacity
   • Log evictions (admin visibility)
```

## SSR vs. Client Hydration

### Server-Side Rendering (SSR)

SSR renders:

- Landing page shell (fast)
- Hero background image (if location cookie exists)
- Initial viewer state metadata (center, epoch, mode)

Goal: **First meaningful paint < 2 seconds**.

### Client Hydration

On hydration, Angular:

- Initializes viewer (loads Aladin Lite or canvas)
- Connects WebSocket for audit/ops/job streams
- Makes interactive (user can pan, zoom, search, publish)

## Hot Observables & RxJS Patterns

### ViewerState$ (Core State)

```typescript
@Injectable({ providedIn: 'root' })
export class ViewerStateStore {
  private state$ = new BehaviorSubject<ViewerState>({ ... });

  state$: Observable<ViewerState> = this.state$.asObservable()
    .pipe(
      distinctUntilChanged(stable),
      shareReplay({ bufferSize: 1, refCount: true })
    );

  patch(partial: Partial<ViewerState>) {
    this.state$.next({ ...this.state$.value, ...partial });
  }
}
```

Every view change is:

- Emitted as a hot observable (not re-fetched on subscribe)
- Audited on the backend
- Propagated to other users via WS if collaboration enabled later

### RateLimitState$ (Server-Pushed)

```typescript
rateLimitState$: Observable<RateLimitStatus> = webSocket(/* /ws topic='ops' */)
  .pipe(filter((msg) => msg.type === 'RATE_LIMIT_UPDATE'))
  .pipe(map((msg) => msg.payload))
  .pipe(shareReplay(1));

// UI subscribes: rateLimitState$ | async
```

### AuditStream (Admin View)

```typescript
auditEvents$: Observable<AuditEvent> = webSocket(/* /ws topic='audit' */)
  .pipe(filter((msg) => msg.topic === 'audit'))
  .pipe(map((msg) => msg.payload));
```

## WebSocket Multiplexing

Single endpoint: `WS /ws`

Topics (subscribed selectively):

- `audit` — all structured events (role-gated; admin + mods see subset)
- `ops` — cache stats, rate-limit events, upstream health
- `jobs` — snapshot/cutout generation progress
- `mod` — moderation queue updates

Message envelope (all topics):

```typescript
Envelope<T> {
  tsUtc: string;
  corrId: string;          // trace ID across HTTP + WS
  topic: 'audit' | 'ops' | 'jobs' | 'mod';
  type: string;            // e.g. 'AUDIT_EVENT', 'JOB_PROGRESS'
  payload: T;
}
```

## Community Integration

### Post Model

A post ties Markdown, images, embedded sky views, and curated tags.

```typescript
Post {
  id: string;
  author: UserPublic;
  status: 'VISIBLE' | 'HIDDEN' | 'LOCKED' | 'REMOVED';
  latestRevision: PostRevision;
}

PostRevision {
  markdown: string;              // Markdown with blocks
  viewerBlocks: ViewerBlock[];    // embedded sky views
  tags: string[];                // curated only
  snapshotArtifactId?: string;   // auto-generated PNG
}

ViewerBlock {
  title?: string;
  state: ViewerState;            // reproducible sky view
}
```

### Revision History

Posts are append-only for revisions:

- Edit → new revision (rev_no++)
- All revisions immutable
- History shows diffs optionally
- Every revision audited

### Auto-Snapshot on Publish

On POST /community/posts:

- System resolves primary ViewerBlock
- Renders PNG snapshot via Go preview service
- Stores artifact (path, sha256, provenance)
- Returns post with snapshotArtifactId

Public can see snapshot in post preview; full viewer available for interaction.

---

**Last Updated:** 2026-02-06

**Key files to review next:**

- RBAC-ROLES.md (permissions matrix)
- API-ROUTES.md (endpoint specs)
- DATABASE-SCHEMA.md (table structure)
