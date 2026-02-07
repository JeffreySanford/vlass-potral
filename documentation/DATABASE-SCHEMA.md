# Database Schema & Data Model

## Overview

VLASS Portal uses **SQLite for local development** and **PostgreSQL for production**. Schema emphasizes:

- **Audit trails:** every user action logged with correlation ID
- **Role-based access:** users have roles; posts/comments have author roles
- **Soft deletes:** minimal deletion; mostly records historical state
- **Immutable events:** audit_events never modified, only appended
- **No raw coordinates in logs:** location privacy enforced at DB layer

## Tables

### users

Stores registered accounts. Anonymous users do not get a row here.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified_at TIMESTAMP NULL,
  password_hash VARCHAR(255) NOT NULL,

  -- Name for community posts, moderation
  display_name VARCHAR(100) NOT NULL,

  -- Roles: 'USER' | 'POWER' | 'MODERATOR' | 'ADMIN'
  -- Users can have multiple roles (stored as JSON array for simplicity)
  roles JSONB DEFAULT '["USER"]',

  -- Community participation flags
  is_banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT NULL,
  ban_created_at TIMESTAMP NULL,

  -- Activity tracking
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- GDPR/privacy
  consent_newsletter BOOLEAN DEFAULT FALSE,
  consent_location BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP NULL  -- soft delete
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_verified ON users(email_verified_at);
CREATE INDEX idx_users_roles ON users USING GIN(roles);
```

### audit_events

Immutable log of all user actions. **Never delete; only INSERT.** Cleanup via aged-out archival.

```sql
CREATE TABLE audit_events (
  id SERIAL PRIMARY KEY,

  -- Correlation ID (trace across HTTP + WebSocket)
  correlation_id UUID NOT NULL,

  -- Timestamp (UTC)
  ts_utc TIMESTAMP DEFAULT NOW(),

  -- Actor (user ID or 'ANON')
  actor_id UUID NULL,
  actor_ip VARCHAR(45),  -- IPv4 or IPv6

  -- Action: 'LOGIN' | 'REGISTER' | 'VERIFY_EMAIL' | 'VIEW_IMAGE' | 'SEARCH' |
  --         'POST_CREATE' | 'POST_UPDATE' | 'POST_DELETE' | 'COMMENT_CREATE' |
  --         'LIKE' | 'REPORT' | 'ADMIN_BAN' | 'MOD_APPROVE_TAG' | etc.
  action VARCHAR(50) NOT NULL,

  -- Target resource (post ID, image tile, etc.; coarse for privacy)
  target_resource VARCHAR(255),

  -- Result: 'SUCCESS' | 'RATE_LIMITED' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'ERROR'
  status VARCHAR(20),

  -- Latency (milliseconds)
  latency_ms INTEGER,

  -- Bytes transferred
  bytes_transferred INTEGER,

  -- Free-form notes (sanitized; no raw coordinates, passwords, etc.)
  details TEXT,

  -- Coarse location (only if user consented; redacted in older records)
  -- e.g., "40.7128,-74.0060" -> "40.71,-74.01" (rounded to 0.01 degree)
  location_coarse VARCHAR(20) NULL,

  -- Referrer (sanitized domain only, no query params)
  referrer_domain VARCHAR(255) NULL,

  -- Error stack (if action failed; PII redacted)
  error_short VARCHAR(500) NULL
);

CREATE INDEX idx_audit_ts ON audit_events(ts_utc);
CREATE INDEX idx_audit_actor ON audit_events(actor_id);
CREATE INDEX idx_audit_action ON audit_events(action);
CREATE INDEX idx_audit_corr_id ON audit_events(correlation_id);
CREATE INDEX idx_audit_status ON audit_events(status);

-- 90-day retention policy (see cleanup job in TESTING-STRATEGY.md)
-- Trigger: daily job runs `DELETE FROM audit_events WHERE ts_utc < NOW() - INTERVAL '90 days'`
```

### posts

Community research posts (Markdown + viewer snapshots + links to NRAO archive).

```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Author
  author_id UUID NOT NULL REFERENCES users(id),

  -- Metadata
  title VARCHAR(300) NOT NULL,
  description TEXT,  -- optional summary for feed

  -- Content
  body TEXT NOT NULL,  -- Markdown (may include ![image](url) and [blocks])

  -- Viewer snapshot (JSON; see types/ViewerBlock)
  -- e.g., { "mode": "ALADIN", "center": { "raDeg": 40.5, "decDeg": -75.5 }, "fovDeg": 0.5, ... }
  viewer_snapshot JSONB NULL,

  -- Publication status
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMP NULL,

  -- Moderation
  is_approved BOOLEAN DEFAULT FALSE,
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_reason VARCHAR(255) NULL,

  -- Tags (curated, all approved by moderator)
  tags JSONB DEFAULT '[]',  -- e.g., ["AGN", "VLASS2.1", "Supernova"]

  -- Activity
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL  -- soft delete
);

CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_published ON posts(is_published, published_at DESC);
CREATE INDEX idx_posts_approved ON posts(is_approved);
CREATE INDEX idx_posts_tags ON posts USING GIN(tags);
```

### post_revisions

Track revision history for posts. Users can propose changes; moderators approve.

```sql
CREATE TABLE post_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which post
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,

  -- Proposer (editor)
  proposed_by_id UUID NOT NULL REFERENCES users(id),

  -- Revision content
  title VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,
  viewer_snapshot JSONB NULL,

  -- Approval
  is_approved BOOLEAN DEFAULT FALSE,
  approved_by_id UUID NULL REFERENCES users(id),
  approval_reason TEXT NULL,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_revisions_post ON post_revisions(post_id);
CREATE INDEX idx_revisions_proposed_by ON post_revisions(proposed_by_id);
CREATE INDEX idx_revisions_approved ON post_revisions(is_approved);
```

### comments

Comments on posts (threaded by post, not nested within comments).

```sql
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which post
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,

  -- Author
  author_id UUID NOT NULL REFERENCES users(id),

  -- Content
  body TEXT NOT NULL,  -- Markdown allowed

  -- Moderation
  is_approved BOOLEAN DEFAULT FALSE,
  is_flagged BOOLEAN DEFAULT FALSE,
  flag_reason VARCHAR(255) NULL,

  -- Activity
  like_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_approved ON comments(is_approved);
```

### post_likes

Like/vote on posts (many-to-many).

```sql
CREATE TABLE post_likes (
  id SERIAL PRIMARY KEY,

  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(post_id, user_id)  -- one like per user per post
);

CREATE INDEX idx_likes_post ON post_likes(post_id);
CREATE INDEX idx_likes_user ON post_likes(user_id);
```

### comment_likes

Like/vote on comments.

```sql
CREATE TABLE comment_likes (
  id SERIAL PRIMARY KEY,

  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_comment_likes_comment ON comment_likes(comment_id);
CREATE INDEX idx_comment_likes_user ON comment_likes(user_id);
```

### tags

Curated tag vocabulary (moderator-approved only).

```sql
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,

  -- Tag name (immutable once approved)
  name VARCHAR(100) NOT NULL UNIQUE,

  -- Description
  description TEXT,

  -- Category: 'SURVEY' | 'OBJECT_TYPE' | 'TOPIC' | 'REGION' | etc.
  category VARCHAR(50),

  -- Approval
  is_approved BOOLEAN DEFAULT FALSE,
  proposed_by_id UUID NULL REFERENCES users(id),
  approved_by_id UUID NULL REFERENCES users(id),

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_tags_approved ON tags(is_approved);
CREATE INDEX idx_tags_name ON tags(name);
```

### email_verification_tokens

Temporary tokens for email verification (deleted once used).

```sql
CREATE TABLE email_verification_tokens (
  id SERIAL PRIMARY KEY,

  -- User getting verified
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Token (32-byte hex)
  token VARCHAR(64) NOT NULL UNIQUE,

  -- Expiration
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP NULL,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_verify_token ON email_verification_tokens(token);
CREATE INDEX idx_verify_user ON email_verification_tokens(user_id);
CREATE INDEX idx_verify_expires ON email_verification_tokens(expires_at);
```

### password_reset_tokens

Similar to verification tokens; temporary reset tokens.

```sql
CREATE TABLE password_reset_tokens (
  id SERIAL PRIMARY KEY,

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP NULL,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reset_token ON password_reset_tokens(token);
CREATE INDEX idx_reset_user ON password_reset_tokens(user_id);
```

### artifacts

Metadata for user-uploaded artifacts (profile pics, custom images, etc.).

```sql
CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- File metadata
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(100),  -- 'image/png', etc.
  size_bytes INTEGER,

  -- Storage location
  storage_key VARCHAR(500) NOT NULL,  -- e.g., filesystem path or S3 key

  -- Metadata extraction (for images: EXIF stripped)
  width INTEGER NULL,
  height INTEGER NULL,

  -- Activity
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_artifacts_user ON artifacts(user_id);
```

---

## Views & Denormalization

For performance, create views for common queries:

### view_posts_with_author

```sql
CREATE VIEW view_posts_with_author AS
SELECT
  p.id,
  p.title,
  p.description,
  p.body,
  p.viewer_snapshot,
  p.is_published,
  p.is_approved,
  p.tags,
  p.view_count,
  p.like_count,
  p.comment_count,
  p.created_at,
  p.updated_at,
  u.id AS author_id,
  u.display_name AS author_name,
  u.roles AS author_roles
FROM posts p
LEFT JOIN users u ON p.author_id = u.id
WHERE p.deleted_at IS NULL;
```

### view_audit_summary

```sql
CREATE VIEW view_audit_summary AS
SELECT
  DATE(ts_utc) AS date,
  action,
  status,
  COUNT(*) AS count,
  AVG(latency_ms) AS avg_latency_ms,
  SUM(bytes_transferred) AS total_bytes
FROM audit_events
GROUP BY DATE(ts_utc), action, status;
```

---

## Migrations Strategy

Use **TypeORM migrations** for schema changes:

```bash
# Create a new migration
pnpm nx exec -- typeorm migration:create apps/vlass-api/src/migrations/AddUserBanFields

# Edit the migration file (up/down)
# Then run:
pnpm nx exec -- typeorm migration:run

# In production, migrations run as part of deployment startup
```

Example migration:

```typescript
// apps/vlass-api/src/migrations/1700000000000-InitialSchema.ts

import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create tables
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          // ... define columns
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}
```

---

## Backup & Recovery

### SQLite

```bash
# Backup
cp vlass.db vlass.db.backup.$(date +%s)

# Restore
cp vlass.db.backup.1234567890 vlass.db
```

### PostgreSQL

```bash
# Backup (all data + schema)
pg_dump vlass_db > vlass_db_backup.sql

# Restore
psql vlass_db < vlass_db_backup.sql

# Or use pg_basebackup for continuous archival
```

---

**Last Updated:** 2026-02-06

**Key Reminders:**

1. **Audit events are immutable.** INSERT only. Cleanup via TTL cutoff, not DELETE on individual records.
2. **Soft deletes everywhere.** Apps filter out deleted_at IS NOT NULL records; data never truly gone.
3. **Location privacy.** Never store raw coordinates in logs; use coarse-grained rounding (0.01 degree).
4. **Roles stored as JSON.** Easier to query multi-role users; use GIN index for performance.
5. **Foreign keys enforced.** Cascading deletes on user deletion clean up posts/comments/artifacts automatically.
