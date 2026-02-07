# Rust Service Specification

## Overview

The Rust service is a stateless compute tier responsible for:

- **HEALPix indexing:** map (RA, Dec) to tile IDs
- **Tile manifest generation:** list HiPS tiles needed for a sky region
- **Preview composition:** fetch tiles from upstream, composite into PNG
- **WCS validation & reprojection:** validate FITS headers, compute transformations

**Endpoints:** HTTP/REST on port 8081  
**Framework:** Axum + Tokio (Rust async runtime)  
**Deployment:** Kubernetes pod (separate from NestJS)

---

## Part 1: Responsibilities & Non-Responsibilities

### ✅ Will Do

| Task                                | Implementation                              |
| ----------------------------------- | ------------------------------------------- |
| HEALPix indexing (RA,Dec) → tile ID | `healpix` crate                             |
| Tile manifest generation            | Query NRAO hips.properties, return JSON     |
| Preview PNG composition             | Fetch tiles, stack with `ndarray`, colormap |
| WCS header validation               | `wcs` crate or FFI to astropy-c             |
| Reprojection math                   | CD matrix calculation                       |
| Health check                        | GET /healthz → JSON status                  |

### ❌ Will NOT Do

| Task                  | Why                                                   |
| --------------------- | ----------------------------------------------------- |
| Authentication / RBAC | NestJS gate; all requests already authorized          |
| Rate limiting         | NestJS enforces quotas                                |
| Caching               | NestJS (+ Redis) handle HTTP cache; Rust is stateless |
| Database writes       | No state; compute-only                                |
| FITS generation       | Not our job; only pass-through validation             |
| User management       | NestJS owns this                                      |

---

## Part 2: REST API Contract

All requests/responses are JSON over HTTP.

### Endpoint 1: POST /v1/tile-manifest

**Purpose:** List HiPS tile URLs needed to cover a sky region.

```http
POST /v1/tile-manifest HTTP/1.1
Host: rust-service:8081
Content-Type: application/json
X-Correlation-ID: c_abc123
X-Request-ID: req_xyz456

{
  "epoch": "ql_rms",
  "centerRa": 206.3,
  "centerDec": 35.87,
  "fovDeg": 1.0,
  "maxOrder": 11,
  "format": "png",
  "priority": "speed"
}

---

HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 4821
Cache-Control: public, max-age=3600
ETag: "abc123def"

{
  "region": {
    "centerRa": 206.3,
    "centerDec": 35.87,
    "fovDeg": 1.0,
    "minOrder": 1,
    "maxOrder": 10,
    "radiusDeg": 0.5
  },
  "epoch": "ql_rms",
  "tiles": [
    {
      "order": 2,
      "npix": 64,
      "hpx_id": "Norder2/Dir0/Npix64",
      "url": "https://archive.nrao.org/vlass/data/ql_rms/Norder2/Dir0/Npix64.png",
      "size": 102400,
      "estimatedLoadMs": 150
    },
    {
      "order": 3,
      "npix": 256,
      "hpx_id": "Norder3/Dir256/Npix768",
      "url": "https://archive.nrao.org/vlass/data/ql_rms/Norder3/Dir256/Npix768.png",
      "size": 51200,
      "estimatedLoadMs": 100
    }
  ],
  "coverage": {
    "totalTiles": 47,
    "totalSizeBytes": 4820000,
    "estimatedTotalMs": 5000,
    "estimatedCoveragePercent": 98.5
  },
  "metadata": {
    "hiPS_Version": "1.4",
    "hiPS_Release": "2023-01-15",
    "hiPS_Frame": "equatorial",
    "computed_at": "2026-02-06T20:15:00Z"
  }
}
```

**Errors:**

```http
HTTP/1.1 400 Bad Request

{
  "error": "Invalid epoch",
  "details": "epoch must be one of [ql_rms, epoch_01, epoch_02]",
  "request_id": "req_xyz456"
}

---

HTTP/1.1 503 Service Unavailable

{
  "error": "Upstream service unreachable",
  "service": "archive.nrao.org",
  "retryAfter": 60,
  "request_id": "req_xyz456"
}
```

**Latency SLA:** <500ms (p95)  
**Caching:** Responses cacheable (Cache-Control header); NestJS handles Redis

### Endpoint 2: POST /v1/preview

**Purpose:** Generate composite PNG from tiles.

```http
POST /v1/preview HTTP/1.1
Content-Type: application/json
X-Correlation-ID: c_abc123

{
  "epoch": "ql_rms",
  "centerRa": 206.3,
  "centerDec": 35.87,
  "fovDeg": 0.5,
  "width": 512,
  "height": 512,
  "format": "png",
  "colormap": "viridis",
  "scale": "linear",
  "vmin": 0.001,
  "vmax": 0.5
}

---

HTTP/1.1 200 OK
Content-Type: image/png
Content-Length: 256000
Cache-Control: public, max-age=10800
ETag: "sha256_abc..."

(PNG bytes)
```

### Alternative: Async Response (202 Accepted)

If the request takes too long to compute in-process:

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "jobId": "preview_abc123",
  "status": "PROCESSING",
  "statusUrl": "/v1/jobs/preview_abc123",
  "pollIntervalMs": 1000,
  "estimatedCompleteTimeMs": 3000
}
```

Client can then:

```http
GET /v1/jobs/preview_abc123

{
  "jobId": "preview_abc123",
  "status": "COMPLETE",
  "result": {
    "imageUrl": "...",
    "size": 256000,
    "generatedAt": "2026-02-06T20:15:30Z"
  }
}
```

**Errors:**

```http
HTTP/1.1 400 Bad Request

{
  "error": "Invalid colormap",
  "details": "colormap must be one of [viridis, gray, hot, cool]"
}

---

HTTP/1.1 504 Gateway Timeout

{
  "error": "Upstream fetch timeout",
  "timeout_ms": 120000,
  "request_id": "req_xyz456"
}
```

**Latency SLA:** <2000ms (p95) for 512x512 at Nside=256

### Endpoint 3: POST /v1/wcs-validate

**Purpose:** Validate FITS header WCS + optionally reproject.

```http
POST /v1/wcs-validate HTTP/1.1
Content-Type: application/json

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
    "CRPIX2": 512,
    "CD1_1": -0.0004167, "CD1_2": 0.0,
    "CD2_1": 0.0, "CD2_2": 0.0004167
  },
  "reprojectionTarget": {
    "centerRa": 206.3,
    "centerDec": 35.87,
    "fovDeg": 0.5,
    "width": 512,
    "height": 512
  }
}

---

HTTP/1.1 200 OK

{
  "valid": true,
  "warnings": [],
  "wcs": {
    "crval": [206.3, 35.87],
    "crpix": [512, 512],
    "cd": [[-0.0004167, 0], [0, 0.0004167]],
    "ctype": ["RA---TAN", "DEC--TAN"],
    "pixelScale": 1.5
  },
  "reprojected": {
    "cd": [[-0.0004167, 0], [0, 0.0004167]],
    "crpix": [512, 512],
    "rotation": 0.0
  }
}

---

HTTP/1.1 400 Bad Request

{
  "valid": false,
  "reason": "Missing required keyword CTYPE1",
  "suggestions": ["Ensure FITS file is standard-compliant"]
}
```

**Latency SLA:** <100ms

### Endpoint 4: GET /healthz

**Purpose:** Liveness and readiness probe.

```http
GET /healthz?full=true HTTP/1.1

---

HTTP/1.1 200 OK

{
  "status": "healthy",
  "version": "0.1.0",
  "uptime_seconds": 86400,
  "checks": {
    "upstream_connectivity": "ok",
    "disk_cache_available": true,
    "disk_cache_size_gb": 42.5,
    "cache_hit_rate": 0.65
  },
  "metrics": {
    "requests_total": 12345,
    "requests_per_sec": 0.143,
    "average_latency_ms": 234,
    "p95_latency_ms": 1200,
    "p99_latency_ms": 2000,
    "errors_total": 12,
    "errors_per_sec": 0.0001
  }
}
```

**Degraded:**

```http
HTTP/1.1 503 Service Unavailable

{
  "status": "degraded",
  "reason": "Upstream service slow (>10s latency observed)",
  "checks": {
    "upstream_connectivity": "slow",
    "disk_cache_available": true
  }
}
```

---

## Part 3: Deployment & Configuration

### Environment Variables

```bash
RUST_LOG=info,vlass_rust=debug
RUST_BACKTRACE=1

# Server
LISTEN_ADDRESS=0.0.0.0
LISTEN_PORT=8081

# Upstream
NRAO_ARCHIVE_BASE_URL=https://archive.nrao.org/vlass/data
NRAO_METADATA_URL=https://archive.nrao.org/vlass/metadata
UPSTREAM_TIMEOUT_SEC=30
UPSTREAM_CONNECT_TIMEOUT_SEC=10
UPSTREAM_MAX_RETRIES=1

# Disk cache
CACHE_DIR=/cache
CACHE_MAX_SIZE_GB=50
CACHE_TTL_DAYS=7

# Concurrency
TILE_FETCH_CONCURRENCY=5
PREVIEW_RENDER_THREADS=4

# Observability
PROMETHEUS_METRICS_PORT=9090
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

### Kubernetes Pod Definition (Helm)

```yaml
# helm/vlass-rust/templates/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: vlass-rust
  labels:
    app: vlass-rust
spec:
  replicas: 1 # MVP; can scale later
  revisionHistoryLimit: 3
  selector:
    matchLabels:
      app: vlass-rust
  template:
    metadata:
      labels:
        app: vlass-rust
    spec:
      containers:
        - name: rust-service
          image: gcr.io/vlass-portal/vlass-rust:{{ .Chart.AppVersion }}
          imagePullPolicy: Always

          ports:
            - name: http
              containerPort: 8081
              protocol: TCP
            - name: metrics
              containerPort: 9090
              protocol: TCP

          env:
            - name: RUST_LOG
              value: 'info,vlass_rust=debug'
            - name: LISTEN_PORT
              value: '8081'
            - name: CACHE_DIR
              value: /cache
            - name: CACHE_MAX_SIZE_GB
              value: '50'

          resources:
            requests:
              cpu: 500m
              memory: 1Gi
            limits:
              cpu: 2000m
              memory: 2Gi

          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 2
            failureThreshold: 2

          volumeMounts:
            - name: cache
              mountPath: /cache

      volumes:
        - name: cache
          emptyDir:
            sizeLimit: 60Gi # 50Gi cache + 10Gi overhead
```

### Build & Release

```dockerfile
# Dockerfile

FROM rust:1.80-slim as builder
WORKDIR /build

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config libssl-dev libfitsio-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release -p vlass-rust

---

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y \
    ca-certificates libfitsio10 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/vlass-rust /usr/local/bin/

EXPOSE 8081 9090
CMD ["vlass-rust"]
```

---

## Part 4: Cache Persistence

### Disk Cache Strategy

```text
/cache
├── tiles/
│   ├── ql_rms/
│   │   ├── Norder2_Dir0_Npix64.png
│   │   ├── Norder3_Dir256_Npix768.png
│   │   └── ... (50GB total, LRU)
│   └── epoch_01/
└── previews/
    ├── {hash_of_request}.png
    └── ... (separate, also LRU)

Metadata: /cache/.index.json  # SQLite or msgpack
```

**Cache Eviction (LRU):**

```rust
// Rust cache implementation (pseudo-code)

struct CacheEntry {
  key: String,
  path: PathBuf,
  size: u64,
  accessed_at: SystemTime,
  created_at: SystemTime,
}

fn evict_if_needed(max_size: u64) {
  let current = total_cache_size();
  if current > max_size {
    let to_evict = (current - max_size) * 1.1;  // evict 10% extra

    // Sort by access time (LRU)
    let entries = load_index().sort_by(|a, b| a.accessed_at.cmp(&b.accessed_at));

    for entry in entries {
      fs::remove_file(&entry.path);
      current -= entry.size;
      if current <= max_size { break; }
    }
  }
}
```

**No shared cache (MVP):**

- Each Rust pod has its own disk cache
- If scaled to 3 replicas, each gets 50GB (total 150GB)
- Later: add Redis for shared cache (cross-replica deduplication)

---

## Part 5: Error Handling & Resilience

### Upstream Fetch Coalescing

**Problem:** If 5 clients request same tile simultaneously, don't fetch 5x from NRAO.

```rust
// Arc<Mutex<...>> pattern for in-flight requests

async fn get_tile(epoch: &str, order: u32, npix: u64) -> Result<Vec<u8>> {
  let cache_key = format!("{}_{}__{}", epoch, order, npix);

  // Check disk cache
  if let Ok(data) = disk_cache.get(&cache_key) {
    return Ok(data);
  }

  // Check in-flight requests
  if let Some(future) = in_flight.get(&cache_key) {
    return future.clone().await;  // Coalesce!
  }

  // Start new fetch
  let fetch_future = fetch_from_nrao(epoch, order, npix);
  let result = fetch_future.await;

  if result.is_ok() {
    disk_cache.set(&cache_key, &result.as_ref().unwrap());
  }

  in_flight.remove(&cache_key);
  result
}
```

### Circuit Breaker

If NRAO is down, fail fast:

```rust
struct CircuitBreaker {
  failures: Arc<AtomicU32>,
  last_failure: Arc<Mutex<SystemTime>>,
  threshold: u32,    // 5 failures → open
  timeout: Duration, // 60s closed window
}

async fn call_protected<F, T>(f: F) -> Result<T>
where
  F: Fn() -> BoxFuture<'static, Result<T>>,
{
  if breaker.is_open() {
    return Err("Circuit breaker open; try again later");
  }

  match f().await {
    Ok(val) => {
      breaker.record_success();
      Ok(val)
    }
    Err(e) => {
      breaker.record_failure();
      Err(e)
    }
  }
}
```

---

## Part 6: Monitoring & Observability

### Prometheus Metrics

```rust
// Named: vlass_rust_*

vlass_rust_http_requests_total{endpoint, status, method}
vlass_rust_http_request_duration_seconds{endpoint, le}
vlass_rust_cache_hits_total{type}
vlass_rust_cache_misses_total{type}
vlass_rust_cache_size_bytes{type}
vlass_rust_upstream_fetch_duration_seconds{endpoint, status}
vlass_rust_tile_render_duration_seconds{width, height}
vlass_rust_disk_free_bytes
```

### Structured Logging

```json
{
  "timestamp": "2026-02-06T20:15:00.123Z",
  "level": "INFO",
  "target": "vlass_rust::tile",
  "message": "Tile fetched",
  "fields": {
    "epoch": "ql_rms",
    "order": 3,
    "npix": 256,
    "size_bytes": 102400,
    "latency_ms": 145,
    "cache_hit": false,
    "request_id": "req_xyz456"
  }
}
```

---

## Part 7: Testing

### Unit Tests

```rust
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_healpix_indexing() {
    let (order, npix) = healpix::radec_to_tile(206.3, 35.87, 8);
    assert_eq!(order, 8);
    assert!(npix < 1728);  // 12 * 4^8
  }

  #[test]
  fn test_tile_manifest_validation() {
    let manifest = tile_manifest(Params {
      epoch: "ql_rms",
      center_ra: 206.3,
      center_dec: 35.87,
      fov_deg: 1.0,
      max_order: 11,
    }).unwrap();

    assert!(manifest.tiles.len() > 0);
    assert!(manifest.coverage.coverage_percent > 90.0);
  }

  #[tokio::test]
  async fn test_upstream_circuit_breaker() {
    let breaker = CircuitBreaker::new(5, Duration::from_secs(60));

    for _ in 0..5 {
      breaker.record_failure();
    }

    assert!(breaker.is_open());
    assert!(call_protected(async { ... }).await.is_err());
  }
}
```

### Integration Tests

```rust
#[tokio::test]
async fn test_preview_png_generation() {
  let client = test_client();

  let res = client
    .post("/v1/preview")
    .json(&PreviewRequest {
      epoch: "ql_rms".to_string(),
      center_ra: 206.3,
      center_dec: 35.87,
      fov_deg: 0.5,
      width: 512,
      height: 512,
      format: "png".to_string(),
      colormap: "viridis".to_string(),
    })
    .send()
    .await
    .unwrap();

  assert_eq!(res.status(), 200);
  assert_eq!(res.headers()["content-type"], "image/png");
  assert!(res.content_length().unwrap() > 1000);
}
```

---

## Part 8: Known Limitations & Future Work

| Limitation                | Status       | Notes                                       |
| ------------------------- | ------------ | ------------------------------------------- |
| WCS reprojection (Mode B) | MVP          | Basic validation only; full reprojection v2 |
| GPU-accelerated rendering | Deferred     | wgpu integration to use GPU for large tiles |
| Distributed cache         | Deferred     | Add Redis for cross-replica sharing         |
| FITS generation           | Out of scope | Link-out only per ADR-002                   |
| GRPCendpoints             | Deferred     | HTTP REST sufficient for v1; gRPC in v2     |

---

**Last Updated:** 2026-02-06  
**Status:** NORMATIVE  
**Repository:** `apps/vlass-rust` (if separate) or `libs/vlass-compute` (if monorepo)  
**Related:** ADR-003, HIPS-PIPELINE.md
