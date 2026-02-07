# RBAC: Role-Based Access Control Matrix

## Role Definitions

### USER

**Default role for all registered accounts.**

- Browse viewer (limited rate + depth)
- Save personal views
- Publish community posts (after email verification)
- Comment on posts (after verification)
- Report content
- Generate snapshots (rate-limited; verified required for high-res)

### POWER

**Trusted contributors, elevated quotas and community influence.**

- All USER capabilities
- Higher rate limits (multiplier: 2x base verified)
- Propose new curated tags (mod reviews)
- Pin/feature posts (pending: future feature)
- Limited moderation helpers (e.g., suggest "needs sources" tag)

### MODERATOR

**Community governance.**

- All POWER capabilities
- Full content moderation:
  - Hide/unhide posts
  - Lock/unlock comments
  - Soft-delete posts
  - Tag posts ("needs sources", etc.)
- Approve/reject tag proposals
- View all reports
- Access moderation queue + dashboard
- View audit logs (community-scoped)

### ADMIN

**System operations and full oversight.**

- All MODERATOR capabilities
- User management (create, ban, quarantine)
- Full audit log access (system-wide)
- Cache policy management (TTL, size caps, eviction rules)
- Upstream health metrics + circuit breaker control
- System settings + feature flags

## Permission Matrix

| Capability             | Anon | User (unverified) | User (verified) | Power | Moderator | Admin  |
| ---------------------- | ---- | ----------------- | --------------- | ----- | --------- | ------ |
| **Viewer Access**      | -    | -                 | -               | -     | -         | -      |
| View SSR background    | ✅   | ✅                | ✅              | ✅    | ✅        | ✅     |
| Use viewer (limited)   | ✅   | ✅                | ✅              | ✅    | ✅        | ✅     |
| High-rate queries      | ❌   | ❌                | ✅              | ✅✅  | ✅✅      | ✅✅✅ |
| FITS download          | ❌   | ❌                | ✅              | ✅    | ✅        | ✅     |
| **Community**          | -    | -                 | -               | -     | -         | -      |
| Publish posts          | ❌   | ❌                | ✅              | ✅    | ✅        | ✅     |
| Comment                | ❌   | ❌                | ✅              | ✅    | ✅        | ✅     |
| Edit own posts         | ❌   | ❌                | ✅              | ✅    | ✅        | ✅     |
| Report content         | ✅   | ✅                | ✅              | ✅    | ✅        | ✅     |
| **Governance**         | -    | -                 | -               | -     | -         | -      |
| Propose tags           | ❌   | ❌                | ❌              | ✅    | ✅        | ✅     |
| Approve tags           | ❌   | ❌                | ❌              | ❌    | ✅        | ✅     |
| Hide/unhide posts      | ❌   | ❌                | ❌              | ❌    | ✅        | ✅     |
| Lock comments          | ❌   | ❌                | ❌              | ❌    | ✅        | ✅     |
| Remove posts           | ❌   | ❌                | ❌              | ❌    | ✅        | ✅     |
| View moderation queue  | ❌   | ❌                | ❌              | ❌    | ✅        | ✅     |
| **Admin**              | -    | -                 | -               | -     | -         | -      |
| Manage users           | ❌   | ❌                | ❌              | ❌    | ❌        | ✅     |
| View all audit logs    | ❌   | ❌                | ❌              | ❌    | ❌        | ✅     |
| Configure cache policy | ❌   | ❌                | ❌              | ❌    | ❌        | ✅     |
| Access system settings | ❌   | ❌                | ❌              | ❌    | ❌        | ✅     |

Legend:

- ✅ = Allowed
- ❌ = Denied
- ✅✅ = Allowed with higher quotas
- ✅✅✅ = Allowed with maximum quotas

## Rate Limiting by Role

### Quota Tiers (Requests Per Minute)

| Role              | Tier Name | RPM       | Burst Allowed   | Allowed Operations      |
| ----------------- | --------- | --------- | --------------- | ----------------------- |
| Anonymous         | minimal   | 20        | 30 sec @ 2x     | view only, no FITS      |
| User (unverified) | throttled | 60        | 60 sec @ 1.5x   | view + search, no posts |
| User (verified)   | normal    | 300       | 300 sec @ 1.2x  | view + search + publish |
| Power             | trusted   | 600       | 600 sec @ 1.1x  | elevated + tag proposal |
| Moderator         | curator   | 900       | 900 sec @ 1.05x | all operations          |
| Admin             | full      | unlimited | unlimited       | unrestricted            |

### Cost Model (Internal; not exposed to user)

Cheap operations (cost = 1):

- View manifest/preview (mostly cached)
- Search by name (Sesame)
- Read posts/comments

Standard operations (cost = 5):

- Cone search (NRAO TAP query)
- Publish post
- Generate snapshot

Expensive operations (cost = 25):

- FITS download
- Batch job (multiple cutouts)
- High-resolution preview

Example: USER (verified) = 300 RPM

- Can do 300 cheap ops/min, or
- 60 standard ops/min, or
- 12 expensive ops/min, or
- mix proportionally

## Guard Enforcement in NestJS

### Decorator Pattern

```typescript
// Protect a route to verified users only
@Roles(Role.USER)
@UseGuards(JwtAuthGuard, VerifiedGuard, RolesGuard)
@Post('/community/posts')
publishPost() { ... }

// Require moderator or above
@Roles(Role.MODERATOR, Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Post('/mod/actions')
performModAction() { ... }

// Admin only
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Get('/audit/logs')
getAuditLogs() { ... }
```

### Verification Guard

```typescript
@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!req.user?.isVerified) {
      // Throttle unverified, or block entirely for certain endpoints
      throw new ForbiddenException('Email verification required');
    }
    return true;
  }
}
```

### Rate Limit Guard (Per-Endpoint)

```typescript
@Injectable()
export class RateLimitGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const endpoint = ctx.switchToHttp().getRequest().url;

    // Check if user exceeded rate limit for this tier
    const bucket = this.rateLimitService.getBucket(user.id, user.roles);
    const cost = this.operationCostService.getCost(endpoint);

    if (!bucket.tryConsume(cost)) {
      throw new TooManyRequestsException('Rate limit exceeded');
    }

    return true;
  }
}
```

## Session & Verification Workflow

1. **Register** → User created with `isVerified = false`
2. **Login while unverified** → Returns JWT but flagged unverified
3. **Verification email sent** (or in dev mode, token logged/returned)
4. **Verify endpoint** → isVerified set to true
5. **Next request** → user unlocks verified quota tier

## Audit Trail for RBAC Actions

Every RBAC decision emitted as AuditEvent:

```typescript
AuditEvent {
  ts: '2026-02-06T14:30:00Z',
  corrId: 'req-uuid',
  actor: { userId: 'user-123', roles: ['USER'] },
  action: 'RBAC_CHECK',
  target: 'endpoint:/community/posts',
  status: 'ALLOW' | 'DENY',
  reason?: 'verified_required' | 'role_insufficient',
  latencyMs: 5,
}
```

This enables:

- Admin audit of who tried what and when
- Trend analysis (e.g., "10 unverified users tried to post today")
- Debugging of permission issues

## Future Extensions

- **Temporary role escalation** (e.g., "curator for 24h" after specific actions)
- **Custom quotas** (admin can assign per-user overrides)
- **Delegation** (admin appoints mods for specific time periods)
- **Scope-limited roles** (e.g., "mod for astronomy tag only")

---

**Last Updated:** 2026-02-06

**Implementation Notes:**

- All RBAC checks are synchronous guards; no async I/O in guards.
- Rate limiter is Redis-backed for cluster deployments, in-memory for local.
- Audit trail is immutable once written; retention job runs every 24h to archive/delete >90 days.
