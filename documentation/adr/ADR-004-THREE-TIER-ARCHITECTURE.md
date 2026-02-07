# ADR-004: Three-Tier Architecture (Angular + NestJS + Rust)

## Date

2026-02-06

## Status

ACCEPTED

## Context

VLASS Portal is being designed as a multi-language, multi-tier system. Options:

### A) Monolith (all NestJS + Angular)

- Simplest deployment
- Bad for: compute-heavy HEALPix/WCS (NestJS CPU-bound)
- Risk: scale one component → scale everything

### B) Microservices (5+ containers per function)

- Hyperscale patterns, but massive operational overhead for MVP
- Overkill for a project with ~3 engineers

### C) Three tiers (Angular SSR + NestJS BFF + Rust compute)

- Fault isolation at key boundaries
- Each tier has one clear responsibility (presentation, policy, compute)
- Operational complexity acceptable (~3 containers, 1 loadbalancer)

## Decision

**Adopt three-tier architecture:**

```text
┌─────────────────────────────────┐
│   Browser & Mobile Client       │
│   (Angular + Material 3)        │
└────────────┬────────────────────┘
             │ HTTP/REST
             ↓
┌─────────────────────────────────┐
│   NestJS Backend-for-Frontend   │
│  (Auth, RBAC, Rate Limit, Cache)│
│  (Community, WS, Moderation)    │
└────────────┬────────────────────┘
             │ HTTP/REST + gRPC*
             ├──────────┬──────────┐
             ↓          ↓          ↓
        [Postgres] [Redis]   [Rust Service]
                            ├─ HEALPix
                            ├─ WCS/Projection
                            ├─ PNG Preview Gen
                            └─ Tile Manifest
             │
             ↓
        Upstream (NRAO VLASS)
```

\*gRPC optional; HTTP REST sufficient for MVP.

### 1. Layer Responsibilities

#### Tier 1: Angular SSR (Presentation)

- **Renders:** HTML, CSS (Material 3), interactive components
- **Runs:** Browser-first (hydration), plus Node for SSR
- **Handles:** UI state, form validation, real-time WS subscriptions
- **Never:** calls upstream APIs directly (always via NestJS)

#### Tier 2: NestJS BFF (Policy & Orchestration)

- **Enforces:** Authentication, RBAC, rate limits, audit logging
- **Owns:** Database (Postgres), cache (Redis), sessions
- **Handles:** community posts, comments, moderation, user management
- **Delegates compute:** to Rust service (tile manifests, WCS, previews)
- **Proxies FITS:** controlled pass-through to NRAO (with quotas)
- **Manages:** WebSocket streams (audit, ops, jobs topics)

#### Tier 3: Rust Service (Compute & Algorithms)

- **Computes:** HEALPix indexing, WCS reprojection, tile manifests
- **Generates:** preview PNGs (tile composition + colormapping)
- **Validates:** FITS headers, WCS correctness
- **Persists:** local disk cache only (no shared state)
- **Stateless:** each replica independent; could scale 1 → N without coordination

### 2. Communication Contracts

**Angular → NestJS:**

```text
HTTPS (always)
Headers: Authorization: Bearer {JWT}
Rate limit headers: X-RateLimit-Remaining, X-RateLimit-Reset
WebSocket for streams: audit, ops, jobs
```

**NestJS → Rust:**

```text
HTTP POST to http://rust-service:8081/v1/{endpoint}
Timeout: 5s default (circuit breaker if exceeded)
Retry: 1x on 5xx (with exponential backoff)
Request ID: forward X-Correlation-ID from client
Response: JSON + Cache-Control headers
```

**NestJS → Postgres:**

- Prisma ORM
- Connection pooling (10-20 connections depending on load)
- Max query time: 30s (abort with error)

**NestJS → Redis:**

- ioredis client
- Sentinel for high availability (HA mode, optional)
- TTL-based eviction (application-managed)

### 3. Scaling Model (MVP → Growth)

| Scale                          | Deployment                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MVP (100 concurrent users)** | Single pod each: nginx, NestJS, Rust. Single Postgres instance (RDS nano). Single Redis (ElastiCache small).                                                |
| **Growth (1K concurrent)**     | NestJS: 2-3 replicas behind LB. Rust: auto-scale 1-3 based on tile generation load. Postgres: read replicas for analytics. Redis: Sentinel HA.              |
| **Scale (10K concurrent)**     | Full Kubernetes cluster. NestJS and Rust autoscale independently. Postgres: managed database service (RDS Aurora). Distributed cache layer (Redis Cluster). |

### 4. Failure Modes & Graceful Degradation

| Component Down | User Impact                              | Fallback                                            |
| -------------- | ---------------------------------------- | --------------------------------------------------- |
| Rust service   | Tiles not generated; previews fail (503) | Client still sees HiPS directly (if Mode A enabled) |
| Postgres       | Authentication fails (503)               | Return "Service temporarily unavailable"            |
| Redis          | Caching disabled (users get fresh data)  | Slight performance degradation, still functional    |
| Upstream NRAO  | FITS unavailable; tile fetches slow      | Return cached tiles; suggest offline mode           |
| NestJS         | Complete outage (503)                    | No fallback (this tier is critical)                 |

### 5. Operational Responsibilities

| Layer   | Monitoring                                                      | Scaling                             | Deployment                 |
| ------- | --------------------------------------------------------------- | ----------------------------------- | -------------------------- |
| Angular | SSR first-paint (Lighthouse), Sentry errors                     | N/A (static)                        | CDN + versioning via nginx |
| NestJS  | CPU/mem/DB query time, rate limit counters, WS connection count | CPU+mem thresholds (HPA)            | Helm + rollout strategy    |
| Rust    | Tile latency, cache hit rate, upstream fetch time, disk space   | Tile queue depth (HPA)              | Helm + separate chart      |
| Data    | Query counts, replication lag, connection pool utilization      | Add read replicas, upgrade instance | Managed database tools     |

### 6. Development Workflow

```text
Frontend dev writes Angular feature
  ↓ (calls NestJS API)

Backend dev extends NestJS controller
  ↓ (calls Rust service if compute needed)

Systems/Rust dev implements Rust endpoint
  ↓ (returns JSON response)

Backend dev mocks Rust response in test
  ↓ (unblocks frontend while Rust is in progress)

All tiers tested end-to-end in Docker Compose
  ↓
Deploy to staging (replica of prod, 3 tiers)
  ↓
Production rollout (blue-green or canary)
```

## Rationale

**Why three tiers, not monolith?**

- Monolith would require NestJS to do HEALPix math (slow, blocks other requests)
- Three tiers isolate fault domains: auth tier can't be brought down by slow tile generation

**Why Rust separate (not WASM in NestJS)?**

- WASM tiles generation is slower (no GPU)
- Rust as microservice is battle-tested; WASM + shared memory is experimental
- Easier to test, scale, and update independently

**Why NestJS for policy (not bare Express)?**

- Nest brings: DI, decorators, guards, pipes, interceptors—all reduce boilerplate for auth/RBAC/rate-limiting
- Matches your team's TypeScript expertise

**Why PostgreSQL + Redis, not NoSQL?**

- Posts/comments/audit need ACID transactions (PostgreSQL)
- Redis for cache + session store (appropriate scope)
- Not over-engineered for v1

## Consequences

### Positive

- ✅ Clear separation of concerns (each tier has one job)
- ✅ Independent scaling (tile spike doesn't block authentication)
- ✅ Resilient (Rust failure doesn't crash NestJS)
- ✅ Team-friendly (frontend devs don't touch Rust; backend doesn't need HEALPix expertise)

### Negative

- ⚠️ Network latency between tiers (NestJS → Rust adds ~5-50ms per request)
- ⚠️ Operational complexity (three configs, three deployments, three monitoring dashboards)
- ⚠️ Debugging is harder (cascade failures cross-tier)

### Mitigation

- **Latency:** Cache Rust responses aggressively (Redis); most tile requests are repeats
- **Ops:** Automated deployment via Helm; IaC everything; log aggregation (ELK/Loki)
- **Debugging:** Correlation IDs flow through all tiers; distributed tracing (Jaeger) optional but recommended

## Related Decisions

- ADR-003 (Rust compute tier)
- ADR-001, ADR-002 (explain data flow for retention + FITS)

## Implementation Order

1. **Phase 1 (Feb-Mar):** Scaffold all three tiers; implement basic contracts
2. **Phase 2 (Apr-May):** Fill out Rust endpoints; NestJS orchestration
3. **Phase 3 (Jun-Jul):** Performance tuning, caching, scaling tests
4. **Phase 4 (Jul+):** Autoscaling in staging, then production rollout

---

**Owner:** Architecture + Tech Lead  
**Review Date:** 2026-08-06 (revisit after 6 months of live operation)
