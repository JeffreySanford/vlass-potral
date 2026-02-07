# API Routes & Endpoints

## Base URL

```text
API: http://localhost:3333  (dev)
WS:  ws://localhost:3333    (dev)
```

## Public Routes (No Auth Required)

### GET /config/public

Returns sanitized public configuration.

```typescript
Response {
  epochs: string[];          // ['MedianStack', 'VLASS2.1', ...]
  defaultEpoch: string;      // 'MedianStack'
  surveys: { name: string, hipsUrl: string }[];
  rateLimitInfo: {
    anonRPM: number;
    verifiedRPM: number;
  };
  features: {
    dualViewerEnabled: boolean;
    communityEnabled: boolean;
    nraoTapSearchEnabled: boolean;
  };
}
```

### POST /session/location

Captures user location (with consent). Sets a signed coarse-location cookie.

**Request:**

```typescript
{
  latDeg: number;
  longDeg: number;
}
```

**Response:**

```typescript
{
  cookieSet: boolean;
  nextSsrWillHaveBackground: boolean;
}
```

**Side effects:**

- Sets signed cookie (no raw GPS stored)
- Logs audit event (location access, not raw values)

### GET /view/preview

Render a small PNG preview of a sky region (SSR uses this for background).

**Query:**

```text
?ra=123.45&dec=45.67&fov=2&epoch=MedianStack&maxWidthPx=400
```

**Response:**

```text
Content-Type: image/png
[PNG bytes]
```

**Rate limit:** Per-IP, global (anon can use this).

### GET /community

Public feed of research posts (SSR-friendly).

**Response:**

```typescript
{
  posts: Post[];
  totalCount: number;
  page: number;
}
```

### GET /community/posts/:id

Single post detail page (SSR).

**Response:**

```typescript
{
  post: Post;
  comments: Comment[];
  relatedPosts?: Post[];
}
```

## Authentication Routes

### POST /auth/register

Create a new account.

**Request:**

```typescript
{
  email: string;
  password: string;
  displayName: string;
}
```

**Response:**

```typescript
{
  user: UserPublic;
  sessionToken: string;  // JWT
  isVerified: boolean;
  verificationTokenLoggedForDev?: string;  // dev mode only
}
```

**Side effects:**

- Creates user record
- Sends verification email (or logs token in dev)

### POST /auth/login

**Request:**

```typescript
{
  email: string;
  password: string;
}
```

**Response:**

```typescript
{
  user: UserPublic;
  sessionToken: string;
  isVerified: boolean;
  roles: Role[];
}
```

### POST /auth/verify-email

**Request:**

```typescript
{
  token: string;
}
```

**Response:**

```typescript
{
  success: boolean;
  message: string;
}
```

**Side effects:**

- Sets isVerified = true
- User unlocks normal quotas

### POST /auth/resend-verification

Re-send verification email (or dev-mode token).

**Response:**

```typescript
{
  sent: boolean;
  verificationTokenLoggedForDev?: string;
}
```

### GET /auth/me

Current user session info.

**Response:**

```typescript
{
  user: UserPublic;
  roles: Role[];
  isVerified: boolean;
  quotas: {
    rpm: number;
    zoom: number;
  };
}
```

### POST /auth/logout

Invalidates session.

## Viewer Routes (Require Auth for Higher Tiers)

### GET /view/manifest

Compute tile manifest for a region (Mode B canvas uses this).

**Query:**

```text
?ra=123.45&dec=45.67&fov=2&zoom=8&epoch=MedianStack
```

**Response:**

```typescript
{
  tiles: TileRef[];      // url, order, x, y, w, h
  center: SkyPoint;
  attribution: string;
  cacheHint: { ttlSeconds: number };
}
```

**Rate limit:** Standard tier; higher cost for high zoom.

**Notes:**

- Tiles returned have proxied URLs (not raw upstream)
- If unverified requests FITS format, rejected
- If zoom > threshold for verified user, rejected

### GET /proxy/tile

Controlled proxy endpoint (no open proxy).

**Query:**

```text
?url=<encoded-tile-url>&format=png|fits
```

**Response:**
Tile bytes (PNG or FITS).

**Guardrails:**

- URL must be in allowlist
- Size-bounded
- Cached
- Rate-limited

### POST /view/snapshot (Verified only)

Generate a snapshot PNG from a viewers state.

**Request:**

```typescript
{
  state: ViewerState;
  artifact?: {
    postId: string;
    revId: string;
  };
}
```

**Response:**

```typescript
{
  artifactId: string;
  imageUrl: string;
  sha256: string;
}
```

**Side effects:**

- Stores artifact (filesystem)
- Audits snapshot generation

## Community Routes (Verified Required for Write)

### POST /community/posts (Verified only)

Publish a new research post.

**Request:**

```typescript
{
  title: string;
  markdown: string;         // with optional blocks
  viewerBlocks: ViewerBlock[];
  tags: string[];           // must be from curated list
  images?: { id: string; url: string }[];
}
```

**Response:**

```typescript
{
  post: Post;
  revision: PostRevision;
}
```

**Side effects:**

- Creates post + revision 1
- Auto-generates snapshot
- Emits audit event

### POST /community/posts/:id/revisions (Verified, Own Post)

Create a new revision.

**Request:**

```typescript
{
  markdown: string;
  tags: string[];
}
```

**Response:**

```typescript
{
  revision: PostRevision;
  revNo: number;
}
```

**Side effects:**

- Increments revNo
- Audits revision creation
- Auto-snapshot if viewer blocks changed

### POST /community/posts/:id/comments (Verified only)

Add a comment to a post.

**Request:**

```typescript
{
  markdown: string;
}
```

**Response:**

```typescript
{
  comment: Comment;
}
```

### POST /community/reports (Any authenticated user)

Report inappropriate content.

**Request:**

```typescript
{
  targetType: 'post' | 'comment';
  targetId: string;
  reason: string;
}
```

**Response:**

```typescript
{
  reportId: string;
  received: boolean;
}
```

**Side effects:**

- Audits report (even if anon)
- Queues for moderation

## Moderation Routes (Moderator only)

### GET /mod/queue

Moderation queue (reports, new-user posts, etc.).

**Query:**

```text
?filter=reports|new_users|flagged&page=1
```

**Response:**

```typescript
{
  items: ModQueueItem[];
  totalCount: number;
}
```

### POST /mod/actions

Perform moderation action.

**Request:**

```typescript
{
  action: 'HIDE_POST' | 'UNHIDE_POST' | 'LOCK_COMMENTS' | 'UNLOCK_COMMENTS' | 'REMOVE_POST' | 'TAG_POST';
  targetType: 'post' | 'comment' | 'user';
  targetId: string;
  reason?: string;
  tag?: string;
}
```

**Response:**

```typescript
{
  success: boolean;
  actionId: string;
}
```

**Side effects:**

- Audits action with all details
- Publishes to WS /mod topic
- Updates post/comment status in DB

### POST /tags/propose (Power+ only)

Propose new curated tags.

**Request:**

```typescript
{
  names: string[];
  rationale: string;
}
```

**Response:**

```typescript
{
  proposalId: string;
  status: 'PENDING';
}
```

### POST /tags/curate (Moderator+ only)

Approve or reject tag proposal.

**Request:**

```typescript
{
  proposalId: string;
  action: 'APPROVE' | 'REJECT';
  note?: string;
}
```

**Response:**

```typescript
{
  success: boolean;
}
```

**Side effects:**

- Audits decision
- Updates tag registry if approved

## Operations Routes (Admin/Mod access)

### GET /ops/rate-limit-status (Verified+)

Current user's rate limit status.

**Response:**

```typescript
{
  rpm: number;
  remaining: number;
  resetAtUtc: string;
  tier: 'anon' | 'unverified' | 'verified' | 'power' | 'mod' | 'admin';
}
```

### GET /ops/cache/stats (Admin)

Cache performance metrics.

**Response:**

```typescript
{
  hitRate: number;
  bytesCached: number;
  bytesMax: number;
  itemsCount: number;
  mostRecentEvictionAtUtc: string;
  antiCrawlBlocksToday: number;
}
```

### GET /ops/audit (Admin; role-gated)

Query audit log.

**Query:**

```text
?from=2026-02-01&to=2026-02-06&action=PROXY_TILE&page=1&limit=100
```

**Response:**

```typescript
{
  events: AuditEvent[];
  totalCount: number;
}
```

**Notes:**

- Redacted (no passwords, no raw PII)
- Only >90 days old archived
- Can't be modified or deleted

## WebSocket Endpoint

### WS /ws

Multiplexed topics with subscription model.

**Subscribe:**

```json
{
  "type": "SUBSCRIBE",
  "topics": ["audit", "ops"]
}
```

**Receive (example):**

```json
{
  "tsUtc": "2026-02-06T14:30:00Z",
  "corrId": "req-uuid",
  "topic": "audit",
  "type": "AUDIT_EVENT",
  "payload": {
    "action": "PROXY_TILE",
    "status": "OK",
    "latencyMs": 125
  }
}
```

**Topics:**

- `audit` — all events (admin only; mods see subset)
- `ops` — cache, rate limit, upstream health
- `jobs` — snapshot/cutout progress
- `mod` — moderation queue updates

---

**Last Updated:** 2026-02-06

**Notes:**

- All endpoints return `corrId` in response header + body
- 90-day audit retention job runs daily at 00:00 UTC
- All write operations emit audit events
- Rate limit headers included in HTTP 429 responses
