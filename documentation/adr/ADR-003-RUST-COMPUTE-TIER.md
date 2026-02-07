# ADR-003: Rust for Preview + Snapshot Rendering (MVP)

## Date

2026-02-06 (Updated: 2026-02-07)

## Status

ACCEPTED

## Context

VLASS Portal MVP needs fast image rendering:

- **Preview PNGs:** Fetch HiPS tiles + compose to user-requested size + apply colormap
- **Snapshot PNGs:** Auto-render + store artifacts after user publishes a notebook post

Two options:

### A) Pure NestJS

- Zero deployment complexity
- But: Canvas/image compositing in Node.js is slow + memory-hungry
- Not worth the complexity if Rust is nearby

### B) Separate Rust service - MVP choice

- Fast image composition (Rust/WGPU handles pixel manipulation)
- Stateless (easy to scale)
- Can be deployed as sidecar or separate pod
- Scope: narrow (preview + snapshot only)

## Decision

**Use Rust as a lightweight rendering tier** for MVP.

**Key constraint:** Scope is **preview + snapshot rendering only**, NOT general WCS/HEALPix math.

HEALPix tile ID computation stays in NestJS (simpler, less computation).

---

## MVP Rust Service Scope

### What Rust Does (rendering only)

```typescript
// Preview endpoint (called by viewer)
POST /render/preview
{
  "tiles": ["url1", "url2", ...],
  "width": 1024,
  "height": 768,
  "colormap": "viridis",
  "scale": "sqrt"
}
→ PNG bytes (>1MB response)

// Snapshot endpoint (called by async job)
POST /render/snapshot
{
  "tiles": ["url1", "url2", ...],
  "width": 512,
  "height": 512,
  "colormap": "viridis"
}
→ PNG bytes (stored to S3 by job runner)
```

### What Rust Does NOT Do (MVP)

- ❌ HEALPix indexing (NestJS does this, pass tile URLs)
- ❌ WCS reprojection (Mode B deferred; not in MVP)
- ❌ FITS generation (link-out only; ADR-002)
- ❌ User auth / quotas (NestJS handles that)
- ❌ Caching (no persistent state)

---

## Technology Stack

| Component            | Library                | Why                             |
| -------------------- | ---------------------- | ------------------------------- |
| Image composition    | `image` crate + `wgpu` | Fast pixel manipulation         |
| Colormap application | `palette` crate        | Pure Rust, correct color spaces |
| Async runtime        | `tokio`                | Non-blocking, same as NestJS    |
| HTTP server          | `axum` + `tokio`       | Minimal, fast, standard         |
| Serialization        | `serde` + `serde_json` | Standard in Rust ecosystem      |
| Metrics              | `prometheus`           | Observability                   |

---

## Deployment (MVP)

**Simple sidecar deployment:**

```text
NestJS Pod
├── app (port 3333)
└── Rust container (port 8081, shared PVC for temp scratch)
```

**Or:** Separate pod if Kubernetes-native:

```yaml
Service: vlass-api (NestJS)
Service: vlass-render (Rust sidecar)
```

No autoscaling needed for MVP (single Rust replica).

---

## API Contract (NestJS → Rust)

```typescript
// NestJS calls Rust for preview
async renderPreview(tileUrls: string[], width: number, height: number): Promise<Buffer> {
  const res = await http.post("http://localhost:8081/render/preview", {
    tiles: tileUrls,
    width,
    height,
    colormap: "viridis",
    scale: "sqrt"
  });
  return res.data; // PNG bytes
}

// Async job runner calls Rust for snapshot
async renderSnapshot(tileUrls: string[]): Promise<Buffer> {
  const res = await http.post("http://localhost:8081/render/snapshot", {
    tiles: tileUrls,
    width: 512,
    height: 512,
    colormap: "viridis"
  });
  return res.data;
}
```

└── No state sharing with other replicas

```text

**Scale path (when needed):**
```

NestJS → [Load Balancer] → [Rust R1, R2, R3]
↓
[Shared Redis cache]
(optional; accept duplication first)

```text

### 4. Contract Between NestJS and Rust

**REST endpoints (no gRPC yet; KISS):**

```

POST /v1/tile-manifest
Input: { ra: number, dec: number, fovDeg: number, epoch: string }
Output: { tiles: [{id: string, url: string, healpixNside: number}] }
Latency: <500ms

POST /v1/preview
Input: { ra: number, dec: number, fovDeg: number, format: "png"|"jpeg", width: 512, height: 512, colormap: "viridis" }
Output: PNG bytes (via Content-Length, streaming OK)
Latency: <2s (including upstream fetch)

POST /v1/wcs-validate
Input: { fitsHeader: {...} }
Output: { valid: bool, reprojected: {...} }
Latency: <100ms

GET /healthz
Output: 200 OK or 503 if upstream unavailable

```text

**NestJS responsibilities:**
- Validate input (sanitize epoch, bounds)
- Rate limit (user quotas)
- Cache the response (HTTP ETags, Cache-Control)
- Timeout Rust calls (5s default; fail gracefully)
- Circuit breaker (if Rust is slow/down)

### 5. Failure Modes and Resilience

| Scenario | Behavior |
|----------|----------|
| Rust service down | NestJS returns 503 ("Service temporarily unavailable") |
| Rust timeout (>5s) | NestJS returns 504 ("Request timeout") |
| Upstream NRAO down | Rust returns 503; NestJS caches and returns last-known-good |
| Bad WCS header | Rust returns 400; NestJS passes through to client ("Invalid FITS") |
| Disk cache full | Rust evicts LRU; continues operating |

### 6. Observability

Rust service emits:
- **Logs:** (via `tracing` crate) tile fetch latencies, cache hits, WCS errors
- **Metrics:** (via `prometheus` crate) request counters, latency histograms, cache efficiency
- **Healthz:** reports disk space, uptime, upstream connectivity

NestJS scrapes metrics every 10s; sends to Prometheus.

## Rationale

**Why Rust over Go?**
- Go's astronomy libraries are sparse and immature
- Rust has `healpix`, `wcs`, `wgpu`—battle-tested in scientific compute
- Rust guarantees memory safety (compute tasks can run for hours without segfaults)
- Rust's compile-time optimizations beat Go's runtime GC for tile rendering

**Why separate microservice (not in-process)?**
- Fault isolation: compute spike doesn't starve auth/moderation tier (NestJS)
- Scaling: Rust can auto-scale independently when tile generation load spikes
- Team independence: backend team writes Rust; frontend team doesn't touch it

**Why three tiers (not cut to two)?**
- **Option: Cut to 2 (Angular + NestJS + Rust-as-lib/WASM)**
  - Simpler deployment
  - But: FFI to C/C++ libraries (WCS) adds complexity
  - But: WASM tile generation is slow (GPU not available in WASM yet)
- **Option: Three tiers**
  - Separate containers/pods
  - Cleaner contracts
  - Easier to observe, scale, upgrade independently
  - Worth the extra operational burden

## Consequences

### Positive
- ✅ HEALPix/WCS math is correct + fast
- ✅ No memory leaks in long-running compute (Rust safety guarantees)
- ✅ Clear separation: NestJS is policy/business logic, Rust is compute
- ✅ Easy to add GPU acceleration later (wgpu supports NVIDIA/AMD)

### Negative
- ⚠️ New language in stack (hiring, onboarding, maintenance)
- ⚠️ Rust compile times (10-30s, slower feedback loop than Python/Node)
- ⚠️ Three-tier deployment (more operational surface)

### Mitigation
- **Language:** Rust is increasingly mainstream in systems software; worth the investment
- **Compile times:** Cache dependencies aggressively; use incremental compilation
- **Ops:** Use Helm charts; abstract deployment complexity; single source of truth for all three services

## Related Decisions

- Supersedes original "Go microservice" thinking in OVERVIEW.md
- Informs DEPLOYMENT.md (now three containers: nginx, nestjs, rust)
- Informs RUST-SERVICE.md (normative spec for Rust layer)
- Informs HIPS-PIPELINE.md (describes data flow and compute boundaries)

## Implementation Roadmap

| Phase | Milestone |
|-------|-----------|
| **Feb 2026** | Rust service skeleton (axum + healpix, /healthz only) |
| **Mar 2026** | Implement `/tile-manifest` endpoint |
| **Apr 2026** | Implement `/preview` endpoint (PNG composition) |
| **May 2026** | Implement `/wcs-validate` (Mode B WCS support) |
| **Jun 2026** | Performance optimization + GPU rendering (if needed) |

---

**Owner:** Architecture + Backend Lead
**Action Items:**
- [ ] Set up Rust project scaffold in apps/vlass-rust or separate repo
- [ ] Define OpenAPI spec (will be source of truth for contracts)
- [ ] Implement healthz + basic tests
- [ ] Set up Helm chart for Rust deployment
- [ ] Train team on Rust patterns + error handling

**Review Date:** 2026-05-06 (revisit performance targets, scaling decisions)
```
