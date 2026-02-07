# Security Guardrails & Policy Enforcement

## Core Principle

**VLASS Sky Portal is a public-data-only, bounded-cache, auditable system.**

No proprietary data. No "mirror" behavior. No bulk crawling. Every action logged.

## Data Access Guardrails

### 1. Public-Only Enforcement

**Policy:** Only endpoints explicitly documented as public VLASS/NRAO products are accessible.

**Enforcement:**

```typescript
// Whitelist-only proxy
const UPSTREAM_ALLOWLIST = [
  'vlass-dl.nrao.edu',
  'data-query.nrao.edu', // TAP metadata only
  'data.nrao.edu', // AAT redirects
  'vizier.u-strasbg.fr', // Sesame resolver
  'cds.unistra.fr',
];

// In NestJS ProxyGuard:
if (!UPSTREAM_ALLOWLIST.some((domain) => requestUrl.includes(domain))) {
  throw new ForbiddenException('Domain not in allowlist');
}
```

**Audit trail:**

- Every allowlist violation is logged
- Admin dashboard monitors violations
- Circuit breaker can blacklist clients after N violations

### 2. "Do Not Mirror" HiPS Cache

**Policy:** Your cache is a bounded, on-demand performance cache, not a dataset mirror.

NRAO explicitly states:

> "Do not mirror any HiPS without agreement; do not mirror any HiPS with unclonable status."

**Enforcement (multi-layered):**

#### Layer 1: On-Demand Only

```typescript
// Anti-prefetch: only cache when fetched by a real user view
if (!fetchContext.isUserTriggered) {
  throw new Error('Prefetching not allowed');
}
```

#### Layer 2: Size and TTL Caps

```typescript
const CACHE_CONFIG = {
  maxBytes: 1_500_000_000, // 1.5 GB hard cap
  ttlSeconds: 43_200, // 12 hours default
  maxConcurrentUpstream: 6,
  evictionPolicy: 'LRU', // least recently used
};
```

#### Layer 3: Anti-Crawl Detection

```typescript
// Detect sequential tile requests in HiPS tile-space (obvious scraping)
if (isTileScanPattern(recentRequests, currentRequest)) {
  // Rate-limit aggressively, mark client for review
  rateLimiter.block(clientIp, duration: '24h', reason: 'tile-space-scan');
  auditLog.emit({
    action: 'ANTI_CRAWL_BLOCK',
    clientIp: clientIpHash,
    reason: 'sequential_tiles',
    count: scanLength,
  });
}

function isTileScanPattern(recent: Request[], current: Request): boolean {
  // If last 20 requests are HEALPix tiles with monotonically increasing order/xyz,
  // likely a crawl attempt
  const lastTiles = recent.filter(r => r.type === 'TILE');
  return lastTiles.length > 20 && isMonotonicSequence(lastTiles);
}
```

#### Layer 4: User-Agent and Attribution

```typescript
// All upstream requests include:
const upstreamHeaders = {
  'User-Agent': 'VLASS-Sky-Portal/1.0 (+https://yourdomain.com/about)',
  'X-Request-ID': correlationId,
};

// All rendered views include footer attribution:
// "Data source: NRAO VLASS (public products). Powered by VLASS Sky Portal."
```

### 3. Proprietary Data Rejection

**Policy:** If an upstream endpoint requires authentication or returns 401/403, reject automatically.

```typescript
if (upstreamResponse.status === 401 || upstreamResponse.status === 403) {
  throw new ForbiddenException(
    'Upstream requires authentication; access denied',
  );
}

// Never attempt to use stored credentials without explicit user action
// Never bypass NRAO's proprietary data restrictions
```

## Verification & Account Gating

### 1. Unverified Throttling

**Policy:** Email verification unlocks normal usage.

**Enforcement:**

```typescript
@Injectable()
export class VerificationGate implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();

    // These endpoints require verification:
    const VERIFIED_ENDPOINTS = [
      'POST:/community/posts',
      'POST:/community/posts/:id/comments',
      'GET:/view/manifest', // with zoom >= threshold
      'POST:/view/snapshot',
    ];

    const endpoint = `${req.method}:${req.path}`;

    if (
      VERIFIED_ENDPOINTS.some((v) => v === endpoint) &&
      !req.user.isVerified
    ) {
      throw new ForbiddenException('Email verification required');
    }

    return true;
  }
}
```

### 2. Dev-Mode Email Verification

**For development:** Verification tokens are logged and optionally returned.

```typescript
// In AuthService.register() [dev mode only]:
const verificationToken = crypto.randomBytes(32).toString('hex');
const tokenHash = hashToken(verificationToken);

logger.info(`Dev verification token for ${email}: ${verificationToken}`);
// Also return in response if NODE_ENV === 'development'

return {
  user: userPublic,
  verificationTokenForDevOnly:
    NODE_ENV === 'development' ? verificationToken : undefined,
};
```

**Production:** Email delivery is the only path.

## Location Privacy

### 1. Coarse Location Only

**Policy:** Never store or log raw lat/long.

```typescript
// User provides lat/long via browser or manual entry
const userLocation = { lat: 45.5231, long: -122.6765 }; // Portland, OR

// Coarse it immediately (2–3 decimal places = ~1 km precision)
const coarseLocation = {
  lat: Math.round(userLocation.lat * 100) / 100, // 45.52
  long: Math.round(userLocation.long * 100) / 100, // -122.68
};

// Store in signed cookie, never in DB
setCookie('coarseLocation', sign(coarseLocation), {
  secure: true,
  httpOnly: true,
  sameSite: 'Strict',
  maxAge: 30 * 24 * 60 * 60, // 30 days
});
```

### 2. Audit Log Redaction

```typescript
// In AuditService, redact location from all logs:
export function redactAuditEvent(event: AuditEvent): AuditEvent {
  const redacted = { ...event };

  // Remove any coordinates
  delete redacted.payload?.ra;
  delete redacted.payload?.dec;
  delete redacted.payload?.lat;
  delete redacted.payload?.long;

  // Replace IP with hash
  if (event.actorIp) {
    redacted.actorIpHash = hashIp(event.actorIp);
    delete redacted.actorIp;
  }

  return redacted;
}
```

### 3. Explicit Consent

```typescript
// Landing page asks explicitly:
// ☐ Use my location (browser prompt)
// ☐ Enter city / state (manual)

// Never assume / auto-geolocate without user action
```

## Community Content Safety

### 1. No FITS Uploads (v1 Policy)

**Policy:** Only PNG/JPEG images allowed in community posts.

```typescript
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg'];
const MAX_IMAGE_SIZE_BYTES = 5_000_000; // 5 MB

if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
  throw new BadRequestException('Only PNG and JPEG images allowed');
}

if (file.size > MAX_IMAGE_SIZE_BYTES) {
  throw new BadRequestException('Image exceeds 5 MB limit');
}

// Strip EXIF before storing
const exifStripped = await stripExifData(file.buffer);
storage.put(exifStripped);
```

### 2. Rate-Limited Publishing

```typescript
// New accounts: 1 post per day until reputation threshold
// Verified accounts: 10 posts per day
// Power+: unlimited

const PUBLISH_RATE_LIMITS = {
  new: { posts_per_day: 1 },
  verified: { posts_per_day: 10 },
  power: { unlimited: true },
};
```

### 3. First-Post Review (Optional)

```typescript
// Optional config: hold first posts from new accounts for mod review
if (user.createdAtUtc > Date.now() - 7 * 24 * 60 * 60 * 1000) {
  // User < 7 days old
  post.status = 'PENDING_REVIEW'; // Hidden until mod approves
  notifyMods('new_user_post', postId);
}
```

### 4. Data Ownership Declaration

```typescript
// Post editor includes checkbox and runtime validation:

export interface PublishPostRequest {
  // ...
  certifications: {
    noProprietaryData: boolean; // Required; must be true
    publicSourcesOnly: boolean; // Required; must be true
  };
}

if (
  !request.certifications.noProprietaryData ||
  !request.certifications.publicSourcesOnly
) {
  throw new BadRequestException('You must certify public sources only');
}
```

## Rate Limiting & DDoS Protection

### 1. Per-IP + Per-User Token Buckets

```typescript
const RATE_LIMITS = {
  anonymous: { rpm: 20, burst: 30 }, // 30 sec @ 2x
  unverified: { rpm: 60, burst: 90 }, // 90 sec @ 1.5x
  verified: { rpm: 300, burst: 360 }, // 360 sec @ 1.2x
  power: { rpm: 600, burst: 660 },
  moderator: { rpm: 900, burst: 990 },
  admin: { rpm: null }, // unlimited
};

// Check both IP and user ID
const ipBucket = rateLimiter.getBucket('ip:' + clientIp);
const userBucket = user ? rateLimiter.getBucket('user:' + user.id) : null;

if (
  !ipBucket.tryConsume(cost) ||
  (userBucket && !userBucket.tryConsume(cost))
) {
  throw new TooManyRequestsException('Rate limit exceeded');
}
```

### 2. Cumulative Cost Across Operations

```typescript
const OPERATION_COSTS = {
  view_manifest: 1, // cheap
  sesame_resolve: 1, // cheap
  tap_query: 5, // medium
  snapshot_generate: 25, // expensive
  fits_download: 25, // expensive
};

// User budget = X RPM; operations consume multiple "points"
```

### 3. Circuit Breaker on Upstream Errors

```typescript
// If NRAO HiPS returns 503/504, exponential backoff:
const breaker = new CircuitBreaker(() => fetchFromUpstream(), {
  failureThreshold: 5,
  resetTimeout: 60_000, // 60 sec
  monitor: true,
});

try {
  await breaker.fire();
} catch (e) {
  if (e instanceof CircuitBreakerOpenError) {
    // Circuit open; return cached tile or friendly error
    return cachedTile || 'Service temporarily unavailable';
  }
  throw e;
}
```

## Audit Trail (90-Day Retention)

### 1. Immutable Event Log

```typescript
export interface AuditEvent {
  id: string;
  tsUtc: string;
  corrId: string;
  actorUserId?: string; // who
  actorIpHash?: string; // not raw IP
  action: string; // PUBLISH_POST, PROXY_TILE, etc.
  target: string; // post:123, tile:xyz
  status: 'OK' | 'DENY' | 'ERROR';
  latencyMs?: number;
  bytes?: number;
  redactedMeta?: Dictionary; // redacted payload info
}
```

### 2. Retention & Cleanup Job

```typescript
// Daily job (00:00 UTC)
export class AuditRetentionJob {
  @Cron('0 0 * * *')
  async cleanupOldEvents() {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Archive to cold storage (optional)
    const oldEvents = await db.auditEvents.find({ ts: { $lt: cutoff } });
    if (oldEvents.length > 0) {
      await archive.store(oldEvents);
    }

    // Delete
    await db.auditEvents.deleteMany({ ts: { $lt: cutoff } });

    logger.info(`Deleted ${oldEvents.length} audit events older than 90 days`);
  }
}
```

### 3. Admin Query Interface

```typescript
GET /ops/audit?from=2026-01-01&to=2026-02-06&action=PROXY_TILE&page=1

// Returns paginated, redacted audit log (admin only)
```

## Artifact Storage Integrity

### 1. Checksums & Provenance

```typescript
export interface Artifact {
  id: string;
  type: 'snapshot' | 'preview' | 'cache_tile';
  path: string; // /artifacts/post/123/rev1/snapshot.png
  sha256: string; // deterministic verification
  bytes: number;
  contentType: string;
  createdAtUtc: string;
  provenance: {
    source: 'auto_snapshot' | 'user_export' | 'ssr_preview';
    config: Dictionary; // what ViewerState generated this
  };
}
```

### 2. Cleanup Policy

```typescript
// Artifacts from deleted posts cleaned up:
async deletePost(postId: string) {
  const post = await db.posts.findById(postId);

  // Soft delete
  post.status = 'REMOVED';

  // Cleanup associated artifacts after grace period
  scheduleJob(`artifact_cleanup:${postId}`, 30 * 24 * 60 * 60 * 1000, async () => {
    const artifacts = await db.artifacts.find({ provenance: { post_id: postId } });
    for (const art of artifacts) {
      storage.delete(art.path);
    }
  });
}
```

## Secret Management

### 1. Environment Variables Only

```text
JWT_SECRET — never hardcoded, never logged
DB credentials — never logged
API keys — never exposed to client
```

### 2. Client Config Endpoint

```typescript
// GET /config/public returns only what's safe
{
  epochs: [...],
  features: {...},
  // Never includes:
  // - JWT_SECRET
  // - DB_URL
  // - Any API credentials
}
```

---

**Last Updated:** 2026-02-06

**Key Principles:**

1. **Public-only:** VLASS data only; no proprietary sources.
2. **Bounded:** Cache caps, TTL, concurrency limits, rate limits.
3. **Auditable:** Every action logged, 90-day retention, redacted.
4. **Transparent:** Clear data provenance, honest caveats (QL is exploratory).
5. **Respectful:** No mirroring, no bulk crawling; upstream-friendly caching.
