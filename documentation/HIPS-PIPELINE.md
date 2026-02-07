# HiPS/WCS/FITS Data Pipeline Specification

## Overview

This document specifies how VLASS Portal ingests, caches, and serves astronomical data to the browser viewer.

**Scope:** Public VLASS HiPS layers, WCS validation for Mode B, controlled FITS pass-through.

**Architecture:**

```text
NRAO Upstream (HiPS + FITS repos)
    ↓ (on-demand fetch + cache)
NestJS (rate limit + auth) → Rust (compute: manifest + preview)
    ↓ (HTTP response)
Browser (Aladin Mode A + Mode B canvas fallback)
```

---

## Part 1: HiPS Basics

### What is HiPS?

HiPS (Hierarchical Progressive Surveys, IVOA standard) organizes sky tiles as a quadtree:

- **Root:** 12 base tiles (HEALPix scheme with Nside=4, 30°×30° each)
- **Deeper levels:** Nside doubles at each level (8, 16, 32, 64, 128, 256, ...)
- **Mapping:** (RA, Dec) → HEALPix tile ID deterministically
- **Formats:** PNG, JPEG, FITS (each level can have different images)

### VLASS HiPS Inventory

```text
https://archive.nrao.org/vlass/
├── data/
│   ├── ql_rms/          # Quick Look median-stack + RMS
│   ├── epoch_01/        # Epoch 1 (2017)
│   ├── epoch_02/        # Epoch 2 (2018)
│   └── epoch_03/        # Epoch 3+ (ongoing)
└── metadata/
    └── hips.properties  # HiPS metadata (IVOA-standard)
```

**Key metadata (from hips.properties):**

```text
HiPS-Version        = 1.4
HiPS-Release        = 2023-01-15
HiPS-Frame          = equatorial (J2000)
HiPS-Order          = 11               # Max HEALPix order (Nside = 2^11 = 2048)
HiPS-Tile-Format    = png jpeg fits
HiPS-Tile-Width     = 512
HiPS-Tile-URL       = {HiPS}/Norder{order}/Dir{dir}/Npix{npix}.{fmt}
```

---

## Part 2: Data Flow: Browser → Server → Upstream

### Use Case A: User Views Sky (Mode A: Aladin Lite)

```text
Browser:
  aladin.gotoRaDec(206.3, 35.87)
  ↓ (Aladin internally):
  - Determines visible tiles for current zoom level
  - For each tile: makes GET /api/tile/{epoch}/{hpx_id}.png

Request→NestJS:
  GET /api/v1/hips/tile/{epoch}/{hpx_order}/{hpx_id}.png
  Headers: { Authorization: Bearer {JWT}, Accept: image/png }
  ↓
  [Rate limit check] quota remaining? (FITS count increments, image count doesn't)
  ↓ Allowed
  ✓ [Cache lookup] Is this tile in Redis?
      Hit → stream from Redis (70ms typical)
      Miss → continue
  ↓
  Rust service (NestJS calls via HTTP):
    POST /v1/tile-manifest
    Body: { epoch, order, id }
    ↓
    [Upstream fetch] GET https://archive.nrao.org/vlass/data/{epoch}/Norder{o}/...
    ↓
    [Optional: downsample if zoom level needs smaller] (not typically needed)
    ↓
    Return PNG bytes (streaming)
  ↓
  [Store in Redis] TTL=7 days, size-cap 50GB LRU
  ↓
  [Audit] log: action=TILE_FETCHED, actor={user}, epoch={epoch}, bytes={size}
  ↓
Browser receives PNG, renders with Aladin
```

### Use Case B: User Generates Preview (Snapshot Feature)

```text
Browser (community posting):
  User selects "Capture snapshot" at current view
  → calls POST /api/v1/snapshot
  Body: { epoch, centerRa, centerDec, fovDeg, width, height, format }
  ↓
  [Rate limit] Snapshot quota check
  ↓
  NestJS queues async job
  → sends WS message: { type: "SNAPSHOT_QUEUED", jobId }
  ↓
  Rust service (async in background via Bull queue):
    POST /v1/preview
    Body: { epoch, ra, dec, fov, width, height, colormap }
    ↓
    [Compute tiles needed] HEALPix footprint for region
    ↓
    [Fetch tiles] Parallel GET from NRAO (coalesce to avoid thundering herd)
    ↓
    [Composite] Stack tiles, apply colormap, downsample to width×height
    ↓
    [Encode to PNG/JPEG] Return artifact
  ↓
  [Store artifact] S3 bucket, signed URL, 30-day TTL
  ↓
  [Update post] post.snapshotArtifactId = artifact_key
  ↓
  [Emit WS] { type: "SNAPSHOT_COMPLETE", snapshotUrl }
  ↓
Browser shows preview in post
```

### Use Case C: User Requests FITS (Pass-Through)

```text
Browser:
  User clicks "Download FITS" in viewer
  → calls POST /api/v1/fits/download
  Body: { epoch, ra, dec, fov }
  ↓
NestJS:
  [Rate limit] FITS quota check (daily GB limit)
  ↓ Allowed
  [Lookup upstream endpoint]
    Epoch + (ra, dec) → FITS tile ID
    → NRAO URL: https://archive.nrao.org/vlass/data/{epoch}/Norder{o}/Npix{p}.fits
  ↓
  [Check cache] Is FITS in Redis? (only cache <1GB files)
      Hit → stream with Content-Length header
      Miss → upstream proxy
  ↓
  Rust service (if cache miss):
    POST /v1/fits-proxy
    Body: { url, timeout: 120 }
    ↓
    [Fetch from NRAO] GET with streaming
    ↓
    [Validate FITS header] Basic sanity checks
    ↓
    Return stream
  ↓
  [Store in cache] If <1GB, TTL=7d
  ↓
  [Decrement quota] Log bytes downloaded
  ↓
  [Audit] action=FITS_DOWNLOADED, actor, epoch, bytes
  ↓
Browser streams FITS download
```

---

## Part 3: Rust Service Contracts

All endpoints are on the Rust service (`http://rust-service:8081`) and accept JSON.

### Endpoint 1: `/v1/tile-manifest`

**Purpose:** List HiPS tile URLs needed to cover a sky region.

```typescript
POST /v1/tile-manifest
Content-Type: application/json

// Request
{
  "epoch": "ql_rms" | "epoch_01" | "epoch_02",
  "centerRa": 206.3,           // degrees J2000
  "centerDec": 35.87,          // degrees J2000
  "fovDeg": 1.0,               // field of view (degrees)
  "maxOrder": 11,              // HEALPix order (max=11 for VLASS)
  "format": "png" | "jpeg",
  "priority": "speed" | "quality"  // speed: lower order, quality: higher
}

// Response (200 OK)
{
  "region": {
    "centerRa": 206.3,
    "centerDec": 35.87,
    "fovDeg": 1.0,
    "minOrder": 1,
    "maxOrder": 10
  },
  "tiles": [
    {
      "order": 1,
      "npix": 42,
      "url": "https://archive.nrao.org/vlass/data/ql_rms/Norder1/Dir0/Npix42.png",
      "size": 102400,
      "estimatedLoadTimeMs": 150
    },
    { ... }  // more tiles
  ],
  "coverage": {
    "totalTiles": 47,
    "totalSizeBytes": 4820000,
    "estimatedTotalTimeMs": 5000
  }
}

// Error (400 Bad Request)
{ "error": "Invalid epoch" }

// Error (503 Service Unavailable)
{ "error": "Upstream service unreachable", "retryAfter": 60 }
```

**Rust Implementation Notes:**

- Use `healpix` crate for HEALPix indexing
- Check NRAO `hips.properties` to determine available orders per epoch
- Coalesce: if multiple tiles at same level, fetch only once
- Timeout on upstream check: 5s (circuit breaker)

### Endpoint 2: `/v1/preview`

**Purpose:** Generate a composite PNG from HiPS tiles.

```typescript
POST /v1/preview
Content-Type: application/json

// Request
{
  "epoch": "ql_rms",
  "centerRa": 206.3,
  "centerDec": 35.87,
  "fovDeg": 0.5,
  "width": 512,           // pixels
  "height": 512,
  "format": "png",
  "colormap": "viridis" | "gray" | "hot",
  "scale": "linear" | "log" | "sqrt",
  "vmin": 0.001,          // optional: lower clip
  "vmax": 0.5             // optional: upper clip
}

// Response (200 OK)
Content-Type: image/png
Content-Length: 256000
(PNG bytes following)

// Async response (202 Accepted with Job ID)
{
  "jobId": "preview_abc123",
  "statusUrl": "/v1/jobs/preview_abc123",
  "pollIntervalMs": 1000
}
```

**Rust Implementation:**

- Fetch tile manifest first
- Download tiles in parallel (max 5 concurrent to NRAO)
- Stack tiles using `ndarray` or similar (numpy-like operations in Rust)
- Apply colormap using `palette` crate
- Downsample to requested width×height using `image` crate
- Encode to PNG and stream

**Performance targets:** <2s for 512×512 at Nside=256 (median case)

### Endpoint 3: `/v1/wcs-validate`

**Purpose:** Parse FITS header and validate WCS.

```typescript
POST /v1/wcs-validate
Content-Type: application/json

// Request
{
  "fitsHeader": {
    "SIMPLE": true,
    "BITPIX": -32,
    "NAXIS": 2,
    "NAXIS1": 1024,
    "NAXIS2": 1024,
    "CTYPE1": "RA---TAN",
    "CTYPE2": "DEC--TAN",
    "CRVAL1": 206.3,
    "CRVAL2": 35.87,
    "CDELT1": -1.5,
    "CDELT2": 1.5,
    "CRPIX1": 512,
    "CRPIX2": 512
    // ... other standard keywords
  },
  "reprojectionTarget": {
    "centerRa": 206.3,
    "centerDec": 35.87,
    "fovDeg": 0.5,
    "width": 512,
    "height": 512
  }
}

// Response (200 OK)
{
  "valid": true,
  "reprojected": {
    "centerRa": 206.3,
    "centerDec": 35.87,
    "pixScale": 1.5,           // arcsec/pix
    "rotation": 0.5,           // degrees
    "crval": [206.3, 35.87],
    "crpix": [512, 512],
    "cd": [[...], [...]]       // transformation matrix
  }
}

// Error
{
  "valid": false,
  "reason": "Missing required CTYPE1 keyword",
  "suggestion": "FITS header appears corrupted or non-standard"
}
```

**Rust Implementation:**

- Parse header using `fitsio` or `fits-rs` crate
- Validate required WCS keywords (CTYPE, CRVAL, CRPIX, CD or CDELT)
- Apply CD matrix math for reprojection
- Return transformation parameters (for Mode B to use)

### Endpoint 4: `/healthz`

**Purpose:** Liveness check.

```text
GET /healthz

// Response
{
  "status": "healthy" | "degraded" | "unavailable",
  "uptime": 86400,
  "cacheSize": 1234567890,          // bytes
  "cacheHitRate": 0.65,              // last 1000 requests
  "upstreamStatus": "ok" | "slow",
  "diskSpaceAvailableGB": 450
}
```

---

## Part 4: NestJS Cache & Rate Limit Strategy

### Cache Behavior

| Data           | Storage | TTL     | Size Cap             | Eviction  |
| -------------- | ------- | ------- | -------------------- | --------- |
| PNG tiles      | Redis   | 7 days  | 50 GB                | LRU       |
| FITS files     | Redis   | 7 days  | 10 GB (separate bin) | LRU       |
| Tile manifests | Redis   | 1 day   | 1 GB                 | LRU       |
| Preview PNGs   | S3      | 30 days | unbounded            | age-based |

### Rate Limiting (see RATE-LIMITING.md for details)

```typescript
// Decorator on tile endpoint
@UseGuards(IpThrottleGuard, UserThrottleGuard, EndpointThrottleGuard)
@Get("tiles/:epoch/:order/:id")
async getTile(...): Promise<StreamableFile> { ... }

// Limits
IP throttle: 1000/min (global)
User throttle: 5000/min (authenticated)
Tile endpoint: 2000/min (specific)
FITS endpoint: 100/min (specific), also daily GB quota
```

### Audit Trail

```typescript
// Every tile fetch (except cache hits) is logged
await audit.log({
  action: 'TILE_FETCHED',
  actor_id: user.id,
  resource: { epoch, order, npix },
  bytes: 102400,
  cacheHit: false,
  latencyMs: 345,
  timestamp: new Date(),
});

// FITS downloads always logged (higher signal)
await audit.log({
  action: 'FITS_DOWNLOADED',
  actor_id: user.id,
  resource: { epoch, fitsUrl },
  bytes: 50000000, // 50 MB
  timestamp: new Date(),
});
```

---

## Part 5: Frontend Integration (Angular)

### Mode A: Aladin Lite (HiPS-Native)

```typescript
// apps/vlass-web/src/app/tap-viewer/aladin-viewer.component.ts

export class AladinViewerComponent implements OnInit {
  ngOnInit(): void {
    const aladin = A.aladin('#aladin-container', {
      survey: 'P/DSS2/color', // Default fallback
      fov: 10,
      showReticle: true,
    });

    // Override tile server to use our API
    aladin.setImageLayer('VLASS-QL', {
      url: (order, npix) => {
        // Construct VLASS tile URL via NestJS
        return `/api/v1/hips/tile/ql_rms/${order}/${npix}.png`;
      },
      maxOrder: 11,
    });

    // Listen to viewport changes and log telemetry
    aladin.on('positionchanged', (ra, dec) => {
      this.analytics.track('viewer.pan', { ra, dec });
    });
  }
}
```

### Mode B: Canvas Fallback Viewer

```typescript
// apps/vlass-web/src/app/tap-viewer/canvas-viewer.component.ts

// NOT implemented in MVP; placeholder for v1.1
// Mode B is fallback if Aladin fails to load or user disables JavaScript

// Minimal mode: renders static PNG snapshot (with disclaimer)
// "This is a static preview. Enable JavaScript for interactive viewer."
```

---

## Part 6: Preview/Snapshot Artifact Lifecycle

### When User Publishes a Post with Embedded Viewer Block

````typescript
// User's markdown:
```viewer
{
  "center": {"ra": 206.3, "dec": 35.87},
  "fov": 0.5,
  "epoch": "ql_rms"
}
````

// NestJS creates async job:
{
type: "SNAPSHOT_REQUEST",
postId: "post_123",
viewerBlock: { ... },
userId: "user_1",
timestamp: new Date(),
}

// Job runs on queue (Bull + Redis):

- Calls Rust: POST /v1/preview
- Waits for response (up to 30s timeout)
- Stores PNG artifact to S3
- Updates post: post.snapshotArtifactId = s3_key
- Emits WS: { type: "SNAPSHOT_COMPLETE", jobId, snapshotUrl }

// Artifact lifecycle:

- 30-day TTL on S3
- After 30 days: deleted (not kept forever)
- If post is hidden/deleted: artifact deleted immediately

````text

**Cleanup Job (runs daily):**
```typescript
@Cron("0 3 * * *")
async deleteExpiredSnapshotArtifacts() {
  // Find all snapshots older than 30 days
  const expired = await db.post.findMany({
    where: {
      snapshotArtifactId: { not: null },
      createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  for (const post of expired) {
    await s3.delete(post.snapshotArtifactId);
    await db.post.update({
      where: { id: post.id },
      data: { snapshotArtifactId: null },
    });
  }
}
````

---

## Part 7: FITS Policy (see ADR-002)

**TL;DR:**

- User clicks "Download FITS"
- NestJS checks FITS quota (daily GB limit)
- If allowed: proxy from NRAO (cache <1GB for 7 days)
- If denied: return 429 "FITS quota exceeded; try again tomorrow"

**Endpoint:**

```text
GET /api/v1/fits/download?epoch={epoch}&ra={ra}&dec={dec}&format=fits
```

**No FITS generation in v1.** Link-out to NRAO for reproducibility.

---

## Part 8: Testing

```typescript
// apps/vlass-api-e2e/src/hips-pipeline.spec.ts

describe('HiPS Pipeline', () => {
  it('should fetch tile manifest for valid epoch/region', async () => {
    const res = await request.post('/api/v1/tile-manifest').send({
      epoch: 'ql_rms',
      centerRa: 206.3,
      centerDec: 35.87,
      fovDeg: 1.0,
    });

    expect(res.status).toBe(200);
    expect(res.body.tiles).toBeDefined();
    expect(res.body.tiles.length).toBeGreaterThan(0);
  });

  it('should generate preview PNG under 2s', async () => {
    const startTime = Date.now();

    const res = await request.post('/api/v1/preview').send({
      epoch: 'ql_rms',
      width: 512,
      height: 512,
      // ... other fields
    });

    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(2000);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('should respect FITS quota', async () => {
    const userToken = generateToken({ verified: true });

    // Make 11 requests (1GB each), quota is 10GB/day
    for (let i = 0; i < 10; i++) {
      const res = await request
        .get('/api/v1/fits/download')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200); // or 206 if streaming
    }

    // 11th request should fail
    const res = await request
      .get('/api/v1/fits/download')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(429); // Too Many Requests
    expect(res.body.error).toContain('FITS quota');
  });
});
```

---

**Last Updated:** 2026-02-06  
**Status:** DRAFT (pending Rust service implementation)  
**Related:** ADR-002 (FITS policy), ADR-003 (Rust service), RATE-LIMITING.md
