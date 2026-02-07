# Cache Policy (MVP: Two-Tier Only)

## Overview

VLASS Portal **caches HiPS tiles** with strict bounds to avoid becoming an inadvertent mirror.

**Two-tier strategy (MVP only):**

1. **NestJS HTTP cache** (fast, in-memory + Redis)
2. **Browser tile cache** (for Aladin Lite, expires weekly)

**Note:** We do NOT proxy or cache FITS (link-out only per ADR-002). Rust is only for PNG rendering (snapshots), not tile caching.

---

## Design Principles

1. **On-Demand Only:** No prefetching. Fetch tiles only when viewer requests them.
2. **Bounded Size:** Redis: 100MB (configurable); browser: 50MB.
3. **Short TTL:** 7 days. Allows new observations to surface.
4. **Request Coalescing:** If two users request same tile simultaneously, fetch once.
5. **No Mirroring:** Never archive VLASS tiles permanently. Just cache for performance.

---

## NestJS Layer (BFF Cache)

### Config

```typescript
// apps/vlass-api/src/app/proxy/proxy.service.ts

const CACHE_CONFIG = {
  maxBytes: 1_500_000_000, // 1.5 GB
  ttlSeconds: 12 * 60 * 60, // 12 hours
  maxConcurrency: 6, // Don't hammer NRAO
} as const;
```

### Implementation

```typescript
@Injectable()
export class ProxyService {
  private readonly cache = new Map<string, CachedTile>();
  private readonly sizeBytesEstimate = 0;
  private readonly requests$ = new Map<string, Observable<ArrayBuffer>>();

  constructor(
    private readonly http: HttpClient,
    private readonly audit: AuditService,
  ) {}

  /**
   * Fetch tile with cache + coalescing.
   * Returns the same observable for simultaneous identical requests.
   */
  getTile(url: string): Observable<ArrayBuffer> {
    // 1. Check cache
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > new Date()) {
      return of(cached.data);
    }

    // 2. Check if in-flight (coalesce)
    if (this.requests$.has(url)) {
      return this.requests$.get(url)!;
    }

    // 3. Fetch from upstream
    const request$ = this.fetchAndCache(url).pipe(
      shareReplay(1),
      finalize(() => this.requests$.delete(url)),
    );

    this.requests$.set(url, request$);
    return request$;
  }

  private fetchAndCache(url: string): Observable<ArrayBuffer> {
    // 1. Validate allowlist
    if (!this.isAllowedUrl(url)) {
      return throwError(new Error(`URL not in allowlist: ${url}`));
    }

    // 2. Fetch
    return this.http.get(url, { responseType: 'arraybuffer' }).pipe(
      timeout(10000), // 10s timeout
      retry({ count: 2, delay: 500 }),
      tap((data) => {
        // 3. Store in cache
        this.cache.set(url, {
          data,
          expiresAt: new Date(Date.now() + CACHE_CONFIG.ttlSeconds * 1000),
          sizeBytes: data.byteLength,
          fetchedAt: new Date(),
        });

        // 4. Check size; evict if needed
        this.sizeBytesEstimate += data.byteLength;
        if (this.sizeBytesEstimate > CACHE_CONFIG.maxBytes) {
          this.evictLRU();
        }

        // 5. Audit
        this.audit.log({
          action: 'TILE_FETCH',
          target_resource: url,
          bytes_transferred: data.byteLength,
          status: 'SUCCESS',
        });
      }),
      catchError((err) => {
        this.audit.log({
          action: 'TILE_FETCH',
          target_resource: url,
          status: 'ERROR',
          error_short: err.message,
        });
        return throwError(err);
      }),
    );
  }

  private isAllowedUrl(url: string): boolean {
    const allowlist = process.env.UPSTREAM_ALLOWLIST?.split(',') || [];
    const urlHost = new URL(url).hostname;
    return allowlist.some((host) => urlHost.includes(host.trim()));
  }

  private evictLRU(): void {
    // Sort by fetchedAt (oldest first)
    const sorted = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].fetchedAt.getTime() - b[1].fetchedAt.getTime(),
    );

    // Remove oldest 25% of cache
    const removeCount = Math.ceil(sorted.length / 4);
    for (let i = 0; i < removeCount; i++) {
      const [url, tile] = sorted[i];
      this.sizeBytesEstimate -= tile.sizeBytes;
      this.cache.delete(url);
    }

    this.logger.log(
      `[Cache] Evicted ${removeCount} tiles. Size now: ${this.sizeBytesEstimate / 1e9}GB`,
    );
  }
}
```

---

## Browser Cache (Aladin Lite)

Aladin Lite automatically caches HiPS tiles in the browser's localStorage or IndexedDB:

- **Size:** ~50MB (browser-managed quota)
- **TTL:** 7 days (configurable in Aladin settings)
- **Cleared:** Browser clear cache = Aladin cache cleared
- **Notes:** Each browser instance has its own cache; not shared across devices

---

## Future: v2 Possible Enhancements

If performance monitoring shows tile fetch is a bottleneck:

- Dedicated Redis instance (not in MVP)
- S3 or CDN for frequently-accessed tile regions (not in MVP)
- Rust service for tile composition / resampling (possible, but only if measured need)

For MVP: NestJS + browser cache is sufficient.

---

## Testing Tile Cache

Unit test cache eviction:
cacheFile := filepath.Join(s.cacheDir, cacheKey+".json")

// 2. Check disk cache
if cached, err := s.readCache(cacheFile); err == nil && !s.isExpired(cached) {
return cached, nil
}

// 3. Fetch from upstream
manifest, err := s.fetchFromUpstream(raD, decD, fovD, layer)
if err != nil {
return nil, err
}

// 4. Write to disk cache
if err := s.writeCache(cacheFile, manifest); err != nil {
// Log but don't fail
fmt.Printf("[WARN] Failed to write cache: %v\n", err)
}

return manifest, nil
}

func (s *ManifestService) readCache(path string) (*CachedManifest, error) {
data, err := os.ReadFile(path)
if err != nil {
return nil, err
}
var m CachedManifest
if err := json.Unmarshal(data, &m); err != nil {
return nil, err
}
return &m, nil
}

func (s *ManifestService) isExpired(m*CachedManifest) bool {
return time.Since(m.FetchedAt) > s.cacheTTL
}

func (s *ManifestService) writeCache(path string, m*CachedManifest) error {
m.FetchedAt = time.Now()
data, err := json.MarshalIndent(m, "", " ")
if err != nil {
return err
}
return os.WriteFile(path, data, 0644)
}

func (s *ManifestService) fetchFromUpstream(
raD, decD, fovD float64,
layer string,
) (*CachedManifest, error) {
// Compute HEALPix tile list for this view
// (Use HEALPix library like healpix-go)

tiles := s.computeTiles(raD, decD, fovD)

// Build tile URLs from upstream
for i := range tiles {
tiles[i].URL = fmt.Sprintf(
"%s/%s/Norder%d/Dir*%.0f/Npix*%d.png",
s.upstream,
layer,
tiles[i].Order,
float64(tiles[i].X)\*1000,
tiles[i].Y,
)
}

return &CachedManifest{
Tiles: tiles,
Center: SkyPoint{
RaDeg: raD,
DecDeg: decD,
},
}, nil
}

func (s \*ManifestService) computeTiles(raD, decD, fovD float64) []Tile {
// Use HEALPix to determine which tiles cover this region
// Return tiles sorted by order (ascending = low to high resolution)
// ... (healpix-go library)
return []Tile{}
}

````text

### HTTP Handler

```go
// apps/vlass-go/main.go

func handleManifest(w http.ResponseWriter, r *http.Request) {
 raStr := r.URL.Query().Get("ra")
 decStr := r.URL.Query().Get("dec")
 fovStr := r.URL.Query().Get("fov")
 layer := r.URL.Query().Get("layer")

 ra := parseFloat(raStr)
 dec := parseFloat(decStr)
 fov := parseFloat(fovStr)

 if ra < 0 || ra > 360 || dec < -90 || dec > 90 || fov <= 0 {
  w.WriteHeader(400)
  json.NewEncoder(w).Encode(map[string]string{"error": "Invalid coordinates"})
  return
 }

 manifest, err := manifestService.GetManifest(ra, dec, fov, layer)
 if err != nil {
  w.WriteHeader(500)
  json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
  return
 }

 w.Header().Set("Content-Type", "application/json")
 w.Header().Set("Cache-Control", "public, max-age=3600") // 1h browser cache
 json.NewEncoder(w).Encode(manifest)
}

func main() {
 http.HandleFunc("/manifest", handleManifest)
 http.ListenAndServe(":9090", nil)
}
````

---

## Browser Tile Cache

```typescript
// Mode B canvas viewer caches tiles in memory

private tileCache = new Map<string, HTMLImageElement>();
private cacheSizeBytes = 0;
private readonly maxCacheBytes = 50_000_000; // 50 MB

private getTileImage(url: string): HTMLImageElement | null {
  if (this.tileCache.has(url)) {
    return this.tileCache.get(url)!;
  }

  const img = new Image();
  img.src = url;
  img.crossOrigin = "anonymous";

  img.onload = () => {
    // Update cache size estimate
    const estSize = 512 * 512 * 4; // 512x512 RGBA
    this.cacheSizeBytes += estSize;

    if (this.cacheSizeBytes > this.maxCacheBytes) {
      this.evictLRU();
    }

    this.tileCache.set(url, img);
    this.render(); // Re-render with new tile
  };

  img.onerror = () => {
    console.error(`[Cache] Failed to load tile: ${url}`);
  };

  return null; // Not yet loaded
}

private evictLRU(): void {
  const lru = Array.from(this.tileCache.entries()).shift();
  if (lru) {
    const [url] = lru;
    this.tileCache.delete(url);
    this.cacheSizeBytes -= 512 * 512 * 4;
  }
}
```

---

## Stale-While-Revalidate (Optional, Post-MVP)

Allow serving stale cache while fetching fresh data in background:

```typescript
getTile(url: string, staleTTL = 24 * 60 * 60): Observable<ArrayBuffer> {
  const cached = this.cache.get(url);
  const now = new Date();

  // 1. Stale cache exists
  if (cached && cached.expiresAt > new Date(now.getTime() - staleTTL * 1000)) {
    // Return stale immediately
    const response = of(cached.data);

    // Revalidate in background (if > TTL)
    if (cached.expiresAt <= now) {
      this.fetchAndCache(url).subscribe({
        error: (err) => console.warn("[Cache] Revalidation failed:", err),
      });
    }

    return response;
  }

  // 2. No cache; fetch fresh
  return this.getTile(url);
}
```

---

## Cache Invalidation (Admin)

```typescript
// POST /api/v1/admin/cache/invalidate

@Post("invalidate")
@UseGuards(AuthGuard, RbacGuard)
@RequireRole("ADMIN")
async invalidateCache(
  @Query("layer") layer?: string
): Promise<{ message: string }> {
  if (layer) {
    // Invalidate by layer
    const matching = Array.from(this.cache.entries()).filter(([url]) =>
      url.includes(layer)
    );
    for (const [url] of matching) {
      this.cache.delete(url);
    }
    return { message: `Invalidated ${matching.length} tiles for layer ${layer}` };
  } else {
    // Clear all
    this.cache.clear();
    return { message: "Cleared entire cache" };
  }
}
```

---

## Tests

```typescript
// apps/vlass-api-e2e/src/cache.spec.ts

describe('Cache Policy', () => {
  it('should cache tile and return same data on second request', async () => {
    const url = 'https://vlass-dl.nrao.edu/vlass/HiPS/Norder3/...';

    const first = await proxyService.getTile(url).toPromise();
    const second = await proxyService.getTile(url).toPromise();

    expect(first).toEqual(second);
    expect(fetchUpstreamCount).toBe(1); // Only fetched once
  });

  it('should coalesce simultaneous requests for same tile', async () => {
    const url = 'https://vlass-dl.nrao.edu/vlass/HiPS/Norder3/...';

    const [a, b, c] = await Promise.all([
      proxyService.getTile(url).toPromise(),
      proxyService.getTile(url).toPromise(),
      proxyService.getTile(url).toPromise(),
    ]);

    expect(fetchUpstreamCount).toBe(1); // Single fetch for all 3
  });

  it('should respect 12-hour TTL', async () => {
    const url = 'https://vlass-dl.nrao.edu/vlass/HiPS/Norder3/...';

    // First fetch
    await proxyService.getTile(url).toPromise();
    expect(fetchUpstreamCount).toBe(1);

    // Fast-forward 13 hours
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 13 * 60 * 60 * 1000);

    // Second fetch (cache expired)
    await proxyService.getTile(url).toPromise();
    expect(fetchUpstreamCount).toBe(2);
  });

  it('should evict LRU when size exceeds 1.5 GB', async () => {
    // Simulate filling cache
    for (let i = 0; i < 3000; i++) {
      const tile = new ArrayBuffer(512 * 512); // 512 KB each
      proxyService.setCache(`tile_${i}`, tile);
    }

    // Total: ~1.5 GB; should trigger eviction
    expect(proxyService.cacheSize()).toBeLessThan(1.5e9);
  });

  it('should reject URLs outside allowlist', async () => {
    const badUrl = 'https://untrusted-domain.com/tile.png';

    const promise = proxyService.getTile(badUrl).toPromise();

    await expect(promise).rejects.toThrow('not in allowlist');
  });
});
```

---

**Last Updated:** 2026-02-06

**Key Reminders:**

1. **On-demand, bounded, no mirror.** Clear intent avoids NRAO policy conflicts.
2. **Three-tier cache** (Nest, Go, Browser) for performance at each layer.
3. **LRU eviction.** When full, oldest tiles removed first.
4. **Coalescing.** Simultaneous requests fetch once.
5. **12-hour TTL.** Allows new observations to surface soon (not stale for weeks).
