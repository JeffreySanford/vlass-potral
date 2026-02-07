# Environment Configuration & Link Enrollment

## Server-Only Environment Variables

Place these in a `.env` file (or equivalent) in your Nest app. **Never expose these to the client.**

```bash
# ============================================================
# VLASS & NRAO Upstream Endpoints (server-side only)
# ============================================================

# HiPS base directory (VLASS imagery for progressive zoom/pan)
VLASS_HIPS_BASE="https://vlass-dl.nrao.edu/vlass/HiPS"

# Quick Look image cache (ideal for SSR previews)
VLASS_QUICKLOOK_BASE="https://vlass-dl.nrao.edu/vlass/quicklook"

# NRAO Archive TAP service (metadata search via ADQL)
NRAO_TAP_BASE="https://data-query.nrao.edu/tap"

# NRAO Archive Access Tool (web UI for downloads; link destination)
NRAO_AAT_BASE="https://data.nrao.edu"

# ============================================================
# Upstream Allowlist (strict whitelist)
# ============================================================

# Comma-separated domains allowed for proxy/cache
UPSTREAM_ALLOWLIST="vlass-dl.nrao.edu,data-query.nrao.edu,data.nrao.edu,vizier.u-strasbg.fr,cds.unistra.fr"

# ============================================================
# Name Resolution (Sesame for "M87" -> RA/Dec)
# ============================================================

CDS_SESAME_BASE="https://cds.unistra.fr/cgi-bin/nph-sesame"

# ============================================================
# Authentication & JWT
# ============================================================

JWT_ISSUER="vlass-portal"
JWT_AUDIENCE="vlass-portal-web"
JWT_SECRET="dev-only-change-me"             # MUST change in production!

# Email verification token validity (minutes)
EMAIL_VERIFY_TOKEN_TTL_MIN="60"

# Dev mode: verification tokens logged + returned in response
# Prod mode: tokens sent via email only
NODE_ENV="development"                      # or "production"

# ============================================================
# Rate Limiting (requests per minute)
# ============================================================

RATE_ANON_RPM="20"                          # anonymous users
RATE_UNVERIFIED_RPM="60"                    # registered but unverified
RATE_VERIFIED_RPM="300"                     # email verified
RATE_POWER_RPM="600"                        # POWER role
RATE_MOD_RPM="900"                          # MODERATOR role
RATE_ADMIN_RPM="0"                          # ADMIN unlimited (0 = unlimited)

# ============================================================
# Proxy / Cache Guardrails (not a mirror!)
# ============================================================

# Cache behavior: on-demand only (no prefetching)
CACHE_ON_DEMAND_ONLY="true"

# Cache TTL (12 hours default)
CACHE_TTL_SECONDS="43200"

# Cache size hard cap (1.5 GB)
CACHE_MAX_BYTES="1500000000"

# Concurrent upstream requests (protect NRAO from overload)
CACHE_MAX_CONCURRENCY="6"

# ============================================================
# Audit Logging & Retention
# ============================================================

# Days to keep audit events before cleanup (90 days recommended)
AUDIT_RETENTION_DAYS="90"

# ============================================================
# Artifact Storage (filesystem now; S3 later)
# ============================================================

# Storage driver: filesystem | s3
ARTIFACTS_DRIVER="filesystem"

# Filesystem base path
ARTIFACTS_BASE="/var/vlass/artifacts"

# (Optional) S3 config (when ARTIFACTS_DRIVER=s3)
# S3_ENDPOINT="https://s3.amazonaws.com"
# S3_BUCKET="vlass-artifacts"
# S3_REGION="us-west-2"
# S3_ACCESS_KEY="..."
# S3_SECRET_KEY="..."

# ============================================================
# Database
# ============================================================

# SQLite (dev/single-machine)
DB_URL="sqlite:///./vlass.db"

# Or PostgreSQL (cluster)
# DB_URL="postgresql://user:password@localhost:5432/vlass"
# DB_POOL_MIN="2"
# DB_POOL_MAX="20"

# ============================================================
# Email (dev mode logs; prod mode SMTP)
# ============================================================

# Dev mode: tokens/codes logged to console and optionally returned in API
# Prod mode: send via SMTP

# SMTP_HOST="smtp.gmail.com"
# SMTP_PORT="587"
# SMTP_USER="your-account@gmail.com"
# SMTP_PASS="app-specific-password"
# SMTP_FROM="noreply@vlassportal.example.com"

# ============================================================
# WebSocket & Real-Time
# ============================================================

# Redis (optional; local server falls back to in-memory)
# REDIS_URL="redis://localhost:6379"

# ============================================================
# Logging
# ============================================================

LOG_LEVEL="info"                            # debug | info | warn | error
LOG_FORMAT="json"                           # json | text
```

## Client-Side Environment Configuration

Place these in `environment.ts` and `environment.prod.ts` (in Angular app):

```typescript
// environments/environment.ts (development)

export const environment = {
  production: false,

  // API base URLs
  apiBaseUrl: 'http://localhost:3333',
  wsBaseUrl: 'ws://localhost:3333',

  // Feature flags
  features: {
    dualViewerEnabled: true,
    communityEnabled: true,
    nraoTapSearchEnabled: false, // advanced; disabled in MVP
  },

  // Viewer defaults (fetched from /config/public at runtime)
  // These are fallbacks; server config overrides at load
  viewer: {
    defaultEpoch: 'MedianStack',
    defaultMode: 'ALADIN',
  },

  // Client-side rate limit hints (user sees limits)
  rateLimitHints: {
    anonRPM: 20,
    verifiedRPM: 300,
  },
};
```

```typescript
// environments/environment.prod.ts (production)

export const environment = {
  production: true,

  apiBaseUrl: 'https://api.vlassportal.example.com',
  wsBaseUrl: 'wss://api.vlassportal.example.com',

  features: {
    dualViewerEnabled: true,
    communityEnabled: true,
    nraoTapSearchEnabled: false, // enable after MVP validation
  },

  viewer: {
    defaultEpoch: 'MedianStack',
    defaultMode: 'ALADIN',
  },

  rateLimitHints: {
    anonRPM: 20,
    verifiedRPM: 300,
  },
};
```

## Sanitized Config Endpoint

Your API exposes a single public endpoint for the client:

```typescript
// GET /config/public

{
  epochs: ['MedianStack', 'VLASS2.1', 'VLASS2.2', ...],
  defaultEpoch: 'MedianStack',
  surveys: [
    { name: 'VLASS QuickLook', hipsUrl: 'https://vlass-dl.nrao.edu/vlass/HiPS/MedianStack/Quicklook' },
    { name: 'VLASS Median Stack', hipsUrl: 'https://vlass-dl.nrao.edu/vlass/HiPS/MedianStack' },
  ],
  features: {
    dualViewerEnabled: true,
    communityEnabled: true,
    commoditySearchEnabled: false,
  },
  rateLimitInfo: {
    anonRPM: 20,
    verifiedRPM: 300,
  },
}
```

**Notes:**

- Never include JWT_SECRET, DB credentials, or API keys
- This is the single source of truth for dynamic config on the client
- Use feature flags here to dynamically enable/disable UI sections

## Local Development Setup

Create a `.env.local` file in `apps/vlass-api/`:

```bash
NODE_ENV=development

JWT_SECRET=dev-secret-change-me

DB_URL=sqlite:///./vlass.dev.db

VLASS_HIPS_BASE=https://vlass-dl.nrao.edu/vlass/HiPS
VLASS_QUICKLOOK_BASE=https://vlass-dl.nrao.edu/vlass/quicklook

ARTIFACTS_DRIVER=filesystem
ARTIFACTS_BASE=./artifacts

CACHE_MAX_BYTES=500000000
CACHE_TTL_SECONDS=3600

AUDIT_RETENTION_DAYS=30

LOG_LEVEL=debug
```

## Deployment Checklist

Before deploying to production:

```bash
# 1. Verify .env is NOT checked in to git
git status | grep .env

# 2. Set production JWT_SECRET
JWT_SECRET=$(openssl rand -base64 32) && echo $JWT_SECRET

# 3. Verify DB_URL points to prod database
echo $DB_URL | grep prod

# 4. Verify VLASS endpoints are still correct (not localhost)
grep localhost .env && echo "ERROR: localhost in prod config!"

# 5. Enable SMTP for email
grep SMTP_HOST .env || echo "WARNING: SMTP not configured; verification will fail"

# 6. Set LOG_LEVEL=info (not debug)
echo LOG_LEVEL=info >> .env

# 7. Verify allowlist is reasonable
echo "UPSTREAM_ALLOWLIST=$UPSTREAM_ALLOWLIST"

# 8. Run tests
pnpm nx test

# 9. Build
pnpm nx build

# 10. Deploy
# (your deploy command)
```

## AWS Deployment Example (if applicable)

```bash
# Store secrets in AWS Secrets Manager
aws secretsmanager create-secret \
  --name vlass-portal/prod \
  --secret-string '{
    "JWT_SECRET": "...",
    "DB_URL": "postgresql://...",
    "SMTP_PASS": "..."
  }'

# Lambda / ECS can fetch at runtime
```

## Docker Deployment Example

```dockerfile
# Dockerfile

FROM node:18-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build apps
RUN pnpm nx build

# Runtime: fetch secrets from environment
ENV NODE_ENV=production

EXPOSE 3333 4444

CMD ["node", "dist/apps/vlass-api/main.js"]
```

```bash
# .dockerignore
.env
.env.local
node_modules
dist
.git
```

---

**Last Updated:** 2026-02-06

**Key Reminders:**

1. **Never commit `.env` to git.** Use `.env.example` template instead.
2. **Server reads upstream URLs from `.env`; client reads from `/config/public`.** This prevents client code from directly hitting NRAO.
3. **Secrets in production:** Use AWS Secrets Manager, Azure Key Vault, or equivalent. Never hardcode in code.
4. **Verify allowlist before deploy.** Typos here could break the app or accidentally allow unknown domains.
