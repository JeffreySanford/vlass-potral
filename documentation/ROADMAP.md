# Development Roadmap & Implementation Checklist

This file tracks what has been **designed**, what needs to be **implemented**, and suggested **priority order**.

---

## Phase 1: Foundation (Weeks 1-2)

**Goal:** Get the NX monorepo skeleton running with basic scaffolding.

### Phase 1A: Workspace Setup

- [ ] Initialize NX monorepo structure
  - [ ] Create `apps/vlass-web/` with NX Angular preset
  - [ ] Create `apps/vlass-api/` with NestJS preset
  - [ ] Create `apps/vlass-go/` with Go basic HTTP server
  - [ ] Create `libs/shared/models/` for shared DTOs
  - [ ] Wire up `tsconfig.base.json` path aliases
  - [ ] Configure ESLint across all projects

- [ ] Setup CI/CD stub
  - [ ] Create `.github/workflows/ci.yml` (placeholder)
  - [ ] Wire in policy tests hook
  - [ ] Add code coverage reporting

- [ ] Documentation validation
  - [ ] All `.md` files in `/docs` are readable ✅ (Already created)
  - [ ] Links in markdown all resolve
  - [ ] Code examples are syntactically valid

**Deliverable:** `pnpm install && pnpm nx serve vlass-web && pnpm nx serve vlass-api` work.

---

### Phase 1B: Shared DTO Layer

- [ ] Implement `libs/shared/models/src/lib/`
  - [ ] `viewer.ts`: `ViewerState`, `ViewerMode`, `SkyPoint`, `TileRef`
  - [ ] `auth.ts`: `SessionInfo`, `LoginRequest`, `RegisterRequest`, `VerifyEmailRequest`
  - [ ] `community.ts`: `Post`, `PostRevision`, `Comment`, `Tag`, `Like`
  - [ ] `audit.ts`: `AuditEvent`, `Envelope<T>`
  - [ ] `config.ts`: `ConfigPublic`, `RateLimitInfo`
  - [ ] `manifest.ts`: `ManifestResponse`, `PreviewResponse`

- [ ] Add validation
  - [ ] Use `class-validator` + decorators
  - [ ] Add unit tests for DTO shape validation

- [ ] Create barrel export `index.ts`

**Deliverable:** `pnpm nx test libs/shared/models` passes. TypeScript paths work in all apps.

---

## Phase 2: Authentication & Data Access (Weeks 2-3)

**Goal:** Users can register, verify email, and login. App stores session.

### Phase 2A: NestJS Auth Module

- [ ] Generate `apps/vlass-api/src/app/auth/` module
  - [ ] `auth.controller.ts`: POST `/auth/register`, `/auth/login`, `/auth/verify-email`
  - [ ] `auth.service.ts`: password hashing, JWT generation, email token lifecycle
  - [ ] `auth.guard.ts`: `@UseGuards(AuthGuard)` for protected routes
  - [ ] `jwt.strategy.ts`: Passport JWT strategy

- [ ] Database migrations
  - [ ] Create `users` table, `email_verification_tokens` table
  - [ ] Run TypeORM migrations
  - [ ] Seed test users (optional)

- [ ] Email service stub
  - [ ] Dev mode: log tokens to console
  - [ ] Prod mode: send via SMTP (wire later)

- [ ] API tests
  - [ ] `POST /auth/register` → 201 with email token
  - [ ] `POST /auth/verify-email` → 200 updates user
  - [ ] `POST /auth/login` → 200 with JWT
  - [ ] Unauthorized endpoints → 401

**Deliverable:** `pnpm nx e2e vlass-api-e2e -- --testNamePattern="Auth"` passes.

---

### Phase 2B: Angular Auth Module

- [ ] Generate `apps/vlass-web/src/app/auth/` module
  - [ ] Route: `/auth/login`
  - [ ] Route: `/auth/register`
  - [ ] Route: `/auth/verify-email`
  - [ ] `auth.service.ts`: `Observable<SessionInfo>` store
  - [ ] Components: `LoginComponent`, `RegisterComponent`, `VerifyComponent`

- [ ] State management
  - [ ] `AuthStoreService` with `BehaviorSubject<SessionInfo | null>`
  - [ ] Methods: `login()`, `register()`, `verify()`, `logout()`
  - [ ] Persist token to `localStorage` (JSON Web Token)

- [ ] HTTP Interceptor
  - [ ] Add `Authorization: Bearer {token}` to all requests
  - [ ] Handle 401 → prompt re-login

- [ ] Tests
  - [ ] Mock `HttpClientTestingModule`
  - [ ] Test login flow, token storage, logout

**Deliverable:** Navigate to `/auth/login`, register, verify, login. Token stored in localStorage.

---

## Phase 3: Viewer Architecture (Weeks 3-4)

**Goal:** Display VLASS sky survey using Aladin Lite (Mode A). No data fetching yet.

### Phase 3A: ViewerStateStore (Core)

- [ ] Create `libs/shared/ui/data-access/viewer-state.store.ts`
  - [ ] `BehaviorSubject<ViewerState>` with defaults
  - [ ] Methods: `updateCenter()`, `updateZoom()`, `updateMode()`, `updateEpoch()`
  - [ ] Stream: `state$: Observable<ViewerState>`
  - [ ] No side effects; pure state management

- [ ] Integration with `vlass-api`
  - [ ] `ViewerService` in Nest wraps viewer API calls
  - [ ] Returns `Observable<ViewerResponse>` with manifests, previews

- [ ] Tests
  - [ ] State updates are immutable
  - [ ] Multiple subscribers don't interfere
  - [ ] Default state is valid

**Deliverable:** `ViewerStateStore` injectable, working in component tests.

---

### Phase 3B: Aladin Lite Integration (Mode A)

- [ ] Install Aladin Lite library
  - [ ] `npm install aladin-lite`
  - [ ] Add to Angular `index.html` via `<script>` (if not npm package)

- [ ] Create `AladinViewerComponent` (module-based, `standalone: false`)
  - [ ] Wraps Aladin JavaScript API
  - [ ] `@Input() viewerState: Observable<ViewerState>`
  - [ ] Listens to state changes, updates Aladin pan/zoom/layer
  - [ ] Emits pan/zoom events back to store

- [ ] Routing
  - [ ] Route: `/viewer?epoch=VLASS2.1&mode=ALADIN`
  - [ ] Query params → store initialization
  - [ ] Browser back/forward updates viewer

- [ ] Tests (golden images)
  - [ ] Screenshot at default center (MedianStack)
  - [ ] Screenshot after pan
  - [ ] Screenshot after zoom

**Deliverable:** Navigate to `/viewer?epoch=MedianStack&mode=ALADIN`. See sky map. Click+drag to pan (mocked).

---

### Phase 3C: Canvas Viewer Skeleton (Mode B)

- [ ] Create `CanvasViewerComponent` (module-based)
  - [ ] Renders empty canvas
  - [ ] Hooks up state listeners (no-op for now)

- [ ] Route: `/viewer?mode=CANVAS`

- [ ] Tests (golden image with placeholder)

**Deliverable:** `/viewer?mode=CANVAS` renders; not functional yet.

---

## Phase 4: Rate Limiting & Audit (Weeks 4-5)

**Goal:** Enforce rate limits and log all actions.

### Phase 4A: Rate Limiting Module

- [ ] Create `apps/vlass-api/src/app/rate-limit/`
  - [ ] `rate-limit.guard.ts`: Nest Guard that checks token bucket
  - [ ] `rate-limit.service.ts`: In-memory token bucket per (IP, user, role)
  - [ ] `@RateLimit({ limit: 20 })` decorator
  - [ ] Return 429 Too Many Requests if exceeded

- [ ] Database
  - [ ] (Optional) Persist bucket state to Redis for cluster support
  - [ ] For MVP, use in-memory Map

- [ ] Tests
  - [ ] 20 requests per minute for anon users
  - [ ] 300 per minute for verified users
  - [ ] 21st request returns 429

**Deliverable:** Hammer `/config/public` endpoint 21 times; 21st returns 429.

---

### Phase 4B: Audit Logging

- [ ] Create `apps/vlass-api/src/app/audit/`
  - [ ] `audit.interceptor.ts`: Logs all HTTP requests + responses
  - [ ] `audit.service.ts`: Writes to `audit_events` table
  - [ ] Generates `correlation_id` UUID header per request
  - [ ] Extracts actor, action, status, latency_ms

- [ ] Database
  - [ ] Create `audit_events` table (see DATABASE-SCHEMA.md)
  - [ ] Add cleanup job (delete events older than 90 days)

- [ ] Tests
  - [ ] Every successful action logged
  - [ ] Rate-limited requests logged as RATE_LIMITED status
  - [ ] Correlation ID passed through to response header

**Deliverable:** `SELECT * FROM audit_events` shows all API calls with correlation IDs.

---

## Phase 5: Proxy & Manifest (Weeks 5-6)

**Goal:** Fetch tile manifests from VLASS and serve to frontend (bounded cache).

### Phase 5A: Proxy Module (Nest)

- [ ] Create `apps/vlass-api/src/app/proxy/`
  - [ ] `proxy.service.ts`: Wraps HTTP calls to NRAO/VLASS upstreams
  - [ ] `UPSTREAM_ALLOWLIST` enforced (no arbitrary URLs)
  - [ ] In-memory cache with TTL (12h default)
  - [ ] Cache size cap (1.5 GB)
  - [ ] Bounded concurrency (6 concurrent upstream requests)
  - [ ] Anti-crawl detection (reject if same user > X requests/sec)

- [ ] Tests
  - [ ] Mock NRAO responses with fixtures
  - [ ] Verify allowlist blocks unknown hosts
  - [ ] Verify cache hit reduces latency
  - [ ] Verify anti-crawl kicks in

**Deliverable:** `ProxyService.get('https://vlass-dl.nrao.edu/...')` works; unknown hosts rejected.

---

### Phase 5B: Go Manifest Service

- [ ] Create `apps/vlass-go/manifest/manifest.go`
  - [ ] Computes HEALPix tile list for (RA, Dec, FOV)
  - [ ] Returns `ManifestResponse` JSON
  - [ ] Endpoint: `GET /manifest?ra=40.5&dec=-75.5&fov=1.0&layer=MedianStack`

- [ ] HTTP server
  - [ ] Route: `GET /manifest`, `GET /preview`, `GET /proxy`
  - [ ] CORS headers (allow vlass-web origin)
  - [ ] Graceful shutdown

- [ ] Tests
  - [ ] Contract test: Manifest shape matches DTO
  - [ ] Valid coordinates → tiles
  - [ ] Invalid coordinates → 400 error

**Deliverable:** `curl 'http://localhost:9090/manifest?...'` returns tile list.

---

### Phase 5C: Viewer Manifest Integration

- [ ] Nest controller: `GET /view/manifest`
  - [ ] Accepts `ra`, `dec`, `fov`, `epoch`
  - [ ] Calls Go `/manifest` endpoint
  - [ ] Returns `ManifestResponse`

- [ ] Angular service: `ViewerService.getManifest()`
  - [ ] Returns `Observable<ManifestResponse>`
  - [ ] Calls `GET /view/manifest`

- [ ] Viewer component
  - [ ] On state change (pan/zoom), fetch new manifest
  - [ ] Pass tile URLs to Aladin (or canvas renderer)

**Deliverable:** Pan/zoom in viewer → tiles update.

---

## Phase 6: Community Platform (Weeks 6-7)

**Goal:** Users can write posts with Markdown + viewer snapshots. Moderators approve.

### Phase 6A: Community Module (Nest)

- [ ] Create `apps/vlass-api/src/app/community/`
  - [ ] `POST /community/posts`: Create post
  - [ ] `GET /community/posts`: List published posts
  - [ ] `GET /community/posts/:id`: Fetch one post
  - [ ] `POST /community/posts/:id/revisions`: Propose revision
  - [ ] `POST /community/posts/:id/comments`: Add comment
  - [ ] `POST /community/posts/:id/like`: Like/vote

- [ ] Database
  - [ ] Create `posts`, `post_revisions`, `comments`, `post_likes` tables
  - [ ] Add indexes for query performance

- [ ] Business logic
  - [ ] Posts not published until moderator approves
  - [ ] Revisions stored; older versions preserved
  - [ ] Tags curated (POWER users propose, MOD approves)

- [ ] Tests
  - [ ] Create post as verified user
  - [ ] Anon user cannot create post
  - [ ] Post not visible until approved
  - [ ] Comment adds to comment_count

**Deliverable:** Verified user can create post; moderator can approve/flag in admin panel.

---

### Phase 6B: Community UI (Angular)

- [ ] Create `apps/vlass-web/src/app/community/` module
  - [ ] `PostEditorComponent`: Markdown editor with viewer snapshot button
  - [ ] `PostListComponent`: Feed of approved posts
  - [ ] `PostDetailComponent`: Full post + comments
  - [ ] `CommentInputComponent`: Add comment

- [ ] Routes
  - [ ] `/community`: List posts
  - [ ] `/community/:id`: View post + comments
  - [ ] `/community/new`: Create post

- [ ] State
  - [ ] `CommunityService`: returns `Observable<Post[]>`, `Observable<Post>`
  - [ ] In-memory cache of published posts

- [ ] Tests
  - [ ] Unverified user sees "post requires verification" message
  - [ ] Verified user can submit post
  - [ ] Editor captures viewer snapshot on button click

**Deliverable:** Navigate to `/community`, see published posts. Click one, view comments.

---

## Phase 7: Search & Object Resolution (Weeks 7-8)

**Goal:** Users can type object names (e.g., "M87") and viewer centers on it.

### Phase 7A: CDS Sesame Integration

- [ ] Nest service: `SearchService`
  - [ ] `resolve(objectName: string): Observable<SkyPoint>`
  - [ ] Calls CDS Sesame API (upstream allowlist)
  - [ ] Returns RA/Dec or error if not found

- [ ] Tests
  - [ ] "M87" → correct RA/Dec
  - [ ] "invalid-object-name" → 404
  - [ ] Responses cached (1 hour)

**Deliverable:** `curl 'http://localhost:3333/search/resolve?object=M87'` returns RA/Dec.

---

### Phase 7B: Search UI

- [ ] Create `SearchBoxComponent` (module-based)
  - [ ] Input field with autocomplete (debounced)
  - [ ] On Enter key, resolve object name
  - [ ] Update viewer center via `ViewerStateStore`

- [ ] Tests (golden image)
  - [ ] Type "M87", press Enter
  - [ ] Viewer pans to M87 coordinates

**Deliverable:** Search box at top of viewer. Type object, hit Enter, viewer pans.

---

## Phase 8: Admin & Moderation (Week 8)

**Goal:** Admins and moderators have dashboards. Can ban users, approve posts, manage tags.

### Phase 8A: Admin Module (Nest)

- [ ] Create `apps/vlass-api/src/app/admin/`
  - [ ] `GET /admin/users`: List users with roles
  - [ ] `POST /admin/users/:id/ban`: Ban user
  - [ ] `GET /admin/audit`: Query audit log
  - [ ] `GET /admin/posts/pending`: Posts awaiting approval
  - [ ] `POST /admin/posts/:id/approve`: Approve post
  - [ ] `POST /admin/posts/:id/flag`: Flag for review
  - [ ] `GET /admin/tags`: List tag proposals
  - [ ] `POST /admin/tags/:id/approve`: Approve tag

- [ ] Guards
  - [ ] `@UseGuards(RbacGuard)` with `@RequireRole('MODERATOR')`
  - [ ] Selective endpoints for ADMIN only

- [ ] Tests
  - [ ] MOD user cannot ban (requires ADMIN)
  - [ ] ADMIN can approve posts
  - [ ] POWER user can propose tags

**Deliverable:** Moderator can toggle `/admin` dashboard.

---

### Phase 8B: Admin UI (Angular)

- [ ] Create `apps/vlass-web/src/app/ops/` module (ops = operations)
  - [ ] `/ops/dashboard`: Admin landing
  - [ ] `/ops/users`: User list, ban button
  - [ ] `/ops/posts/pending`: Posts to review
  - [ ] `/ops/tags`: Tag proposals
  - [ ] `/ops/audit`: Audit log search

- [ ] Components
  - [ ] `UserListComponent`: Table with ban/role change
  - [ ] `PostQueueComponent`: Cards of flagged/pending posts
  - [ ] `TagProposalComponent`: Approve/deny tag suggestions
  - [ ] `AuditSearchComponent`: Filter audit events by date, action, actor

- [ ] Tests
  - [ ] Non-admin cannot access `/ops`
  - [ ] Admin can click "Ban" button
  - [ ] Request hits `POST /admin/users/:id/ban`

**Deliverable:** Moderator at `/ops/posts/pending` sees list of posts to review.

---

## Phase 9: Polish & Deployment (Weeks 9-10)

### Phase 9A: Error Handling & Edge Cases

- [ ] Global error interceptors (Nest + Angular)
  - [ ] Network errors → retry logic
  - [ ] 401 Unauthorized → redirect to login
  - [ ] 403 Forbidden → "Not authorized" message
  - [ ] 429 Rate Limited → "Try again in X seconds"

- [ ] Loading states
  - [ ] Show spinner while fetching
  - [ ] Disable buttons while pending

- [ ] Toast/notification system
  - [ ] Success: "Post created!"
  - [ ] Error: "Failed to load posts. Try again."

**Deliverable:** Error states are user-friendly. No 500 errors in UI.

---

### Phase 9B: Testing & CI

- [ ] Complete test coverage
  - [ ] Unit tests: 80% of services
  - [ ] Integration tests: All API routes
  - [ ] E2E tests: Key user workflows
  - [ ] Contract tests: Nest ↔ Go
  - [ ] Golden images: Viewer modes

- [ ] Policy tests
  - [ ] CI runs `pnpm nx run tools-policy-tests:test`
  - [ ] Build fails if `standalone: true` found

- [ ] Coverage reports
  - [ ] Generate HTML reports
  - [ ] Post to PR comments (optional)

**Deliverable:** `pnpm nx test && pnpm nx e2e && pnpm nx run tools-policy-tests:test` all pass.

---

### Phase 9C: Build & Deployment

- [ ] Production builds
  - [ ] `pnpm nx build vlass-web` → optimized SPA
  - [ ] `pnpm nx build vlass-api` → optimized Node.js
  - [ ] `cd apps/vlass-go && go build -o vlass-go main.go` → optimized binary

- [ ] Docker containers
  - [ ] `Dockerfile` for vlass-web (nginx serving SPA)
  - [ ] `Dockerfile` for vlass-api (Node.js runtime)
  - [ ] `Dockerfile` for vlass-go (Go binary)
  - [ ] `docker-compose.yml` for local full-stack

- [ ] Environment secrets
  - [ ] `.env.prod` with prod values (stored securely)
  - [ ] No secrets in code

- [ ] Database migrations
  - [ ] Run TypeORM migrations on startup

**Deliverable:** `docker-compose up` → full stack running. Deployed to staging/prod.

---

## Phase 10: Advanced Features (Post-MVP)

These are **not** in the MVP but documented for future roadmap:

- [ ] **NRAO TAP Integration:** Advanced object search with ADQL queries
- [ ] **Canvas Viewer Accuracy:** Accurate WCS projection, zoom, reproject
- [ ] **S3 Artifact Storage:** Move from filesystem to cloud (artifact driver pattern)
- [ ] **Redis Cluster:** Distributed rate limiting and caching
- [ ] **GraphQL API:** Supplement REST with GraphQL for complex queries
- [ ] **Image Analysis Tools:** Photometry, astrometry, flux extraction
- [ ] **Collaborative Annotations:** Real-time drawing tools on viewer
- [ ] **Publication Export:** Citation, BibTeX, FITS metadata extraction
- [ ] **Mobile App:** React Native version of vlass-web

---

## Priority Legend

| Symbol | Meaning              |
| ------ | -------------------- |
| ✅     | Completed / Designed |
| ⏳     | In Progress          |
| ⬜     | Not Started          |
| 🚫     | Blocked / Waiting    |

---

## Dependency Graph

```text
Phase 1 (Foundation)
  ↓
Phase 2 (Auth) ← Phase 1
  ↓
Phase 3 (Viewer) ← Phase 1, 2
  ↓
Phase 4 (Rate Limit + Audit) ← Phase 2, 3
  ↓
Phase 5 (Proxy + Manifest) ← Phase 3, 4
  ↓
Phase 6 (Community) ← Phase 2, 4, 5
  ↓
Phase 7 (Search) ← Phase 3, 5
  ↓
Phase 8 (Admin) ← Phase 2, 6
  ↓
Phase 9 (Polish) ← All phases
  ↓
Phase 10 (Advanced)
```

---

## Estimated Timeline

- **Phase 1-2:** 2 weeks → Workspace + Auth ✅ Foundation
- **Phase 3-4:** 2 weeks → Viewer + Rate Limit ✅ Core
- **Phase 5-6:** 2 weeks → Proxy + Community ✅ Data + Social
- **Phase 7-8:** 2 weeks → Search + Admin ✅ Features
- **Phase 9:** 2 weeks → Polish + Deploy ✅ Release

**Total:** ~10 weeks for MVP with 2-4 developers.

---

## Definition of Done (MVP)

A feature is "Done" when:

1. ✅ Code written + tests passing
2. ✅ Code reviewed + merged to `main`
3. ✅ Manual QA in staging environment
4. ✅ Documentation updated
5. ✅ Deployed to production

---

## Blockers & Risks

| Risk                         | Mitigation                                                  |
| ---------------------------- | ----------------------------------------------------------- |
| VLASS endpoint downtime      | Use recorded fixtures; mock upstreams in tests              |
| JWT secret leaked            | Use env vars; rotate in prod; no hardcoding                 |
| Database locks               | Use SQLite for dev; PostgreSQL for prod with proper indexes |
| Rate limiter too aggressive  | Tune thresholds in `.env`; add whitelist for internal tools |
| Aladin Lite API incompatible | Use canvas fallback; test with current version              |
| Go/Node version mismatch     | Lock versions in package.json + go.mod                      |

---

**Last Updated:** 2026-02-06

**Questions?** See respective phase documentation in `/docs/` folder, or ask in team discussions.
