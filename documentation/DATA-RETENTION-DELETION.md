# Data Retention & Deletion Policy

## Overview

Retention policy balances compliance (GDPR, COPPA) with operational needs (audit logs, abuse history).

---

## Retention Schedule

| Data Type          | Retention                                | Reason                           |
| ------------------ | ---------------------------------------- | -------------------------------- |
| Posts (content)    | Forever (or user deletion)               | Permanence of discussion         |
| Comments           | Forever (or user deletion)               | Thread integrity                 |
| Audit logs         | 2 years                                  | Compliance + abuse investigation |
| User sessions      | 30 days                                  | Security/memory                  |
| Error logs         | 90 days                                  | Debugging                        |
| Analytics (IP, UA) | 90 days                                  | GDPR data minimization           |
| User personal data | Account lifetime + 30 days post-deletion | Legal hold                       |

---

## User Deletion (GDPR Art. 17 Right to Erasure)

### Phase 1: Mark for Deletion (Soft Delete)

```typescript
// apps/vlass-api/src/app/users/users.service.ts

async deleteUser(userId: string): Promise<void> {
  const user = await this.db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundException("User not found");

  // Soft delete: mark account as deleted
  await this.db.user.update({
    where: { id: userId },
    data: {
      deletedAt: new Date(),
      email: `deleted_${userId}@archived.local`, // Anonymize
      profile: null, // Clear PII
      deleted: true,
    },
  });

  // Audit
  await this.audit.log({
    action: "USER_DELETION_REQUESTED",
    actor_id: userId,
    timestamp: new Date(),
  });

  // Queue hard deletion (30 days later)
  await this.queue.add("hard_delete_user", { userId }, {
    delay: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}
```

### Phase 2: Hard Delete (After Retention Period)

```typescript
// apps/vlass-api/src/app/jobs/hard-delete.job.ts

@Processor('hard_delete_user')
export class HardDeleteUserJob {
  constructor(
    private db: PrismaService,
    private s3: S3Service,
    private audit: AuditService,
  ) {}

  @Process()
  async handleHardDelete(job: Job<{ userId: string }>): Promise<void> {
    const { userId } = job.data;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { posts: true, comments: true },
    });

    if (!user || !user.deletedAt) {
      this.logger.warn(`User ${userId} not marked for deletion`);
      return;
    }

    // Check retention period (30 days since deletion request)
    const daysSinceDelete = Math.floor(
      (Date.now() - user.deletedAt.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (daysSinceDelete < 30) {
      throw new Error(`Retention period not met for ${userId}`);
    }

    // Delete user's posts (content authored by them)
    // NOTE: Keep posts if they have replies (preserve thread)
    for (const post of user.posts) {
      const replyCount = await this.db.comment.count({
        where: { post_id: post.id },
      });

      if (replyCount === 0) {
        await this.db.post.delete({ where: { id: post.id } });
        // Delete attachments from S3
        if (post.attachment_s3_key) {
          await this.s3.delete(post.attachment_s3_key);
        }
      } else {
        // Replace with "[deleted]" placeholder
        await this.db.post.update({
          where: { id: post.id },
          data: {
            title: '[deleted]',
            content: '[deleted]',
            author_id: null, // Anonymize author
          },
        });
      }
    }

    // Delete comments
    for (const comment of user.comments) {
      const reply_count = await this.db.comment.count({
        where: { parent_id: comment.id },
      });

      if (reply_count === 0) {
        await this.db.comment.delete({ where: { id: comment.id } });
      } else {
        await this.db.comment.update({
          where: { id: comment.id },
          data: {
            content: '[deleted]',
            author_id: null,
          },
        });
      }
    }

    // Delete personal data
    await this.db.user.delete({ where: { id: userId } });

    // Final audit log (before user is gone)
    await this.audit.log({
      action: 'USER_HARD_DELETED',
      actor_id: 'SYSTEM',
      details: { userId },
      timestamp: new Date(),
    });

    this.logger.log(`Hard deleted user ${userId}`);
  }
}
```

---

## Data Export (GDPR Art. 20 Data Portability)

### Generate Export

```typescript
// apps/vlass-api/src/app/users/export.service.ts

@Injectable()
export class DataExportService {
  constructor(
    private db: PrismaService,
    private s3: S3Service,
  ) {}

  async exportUserData(userId: string): Promise<string> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        posts: { include: { attachments: true } },
        comments: true,
        follows: true,
        audit_events: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const export_data = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
        role: user.role,
      },
      posts: user.posts.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        createdAt: p.created_at,
        attachments: p.attachments.map((a) => ({
          filename: a.filename,
          size: a.size_bytes,
          url: a.s3_key, // Client can download
        })),
      })),
      comments: user.comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.created_at,
      })),
      audit_events: user.audit_events.slice(-1000), // Last 1000 actions
    };

    // Generate ZIP file
    const zip = new AdmZip();
    zip.addFile('data.json', Buffer.from(JSON.stringify(export_data, null, 2)));

    // Upload to S3 (temporary, 7-day expiry)
    const key = `exports/${userId}/${Date.now()}.zip`;
    await this.s3.upload(key, zip.toBuffer(), {
      Expires: 7 * 24 * 60 * 60, // 7 days
    });

    // Generate signed URL
    const url = await this.s3.getSignedUrl(key);

    return url;
  }
}
```

### Endpoint

```typescript
@Post("users/me/export")
@UseGuards(JwtGuard)
async requestDataExport(@Request() req): Promise<{ url: string }> {
  const url = await this.export.exportUserData(req.user.id);
  return { url }; // Client can download
}
```

---

## Automated Cleanup Jobs

### Archive Old Logs

```typescript
// Runs daily at 2 AM UTC
@Cron("0 2 * * *")
async archiveOldLogs(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  // Delete error_logs older than 90 days
  const deleted = await this.db.error_log.deleteMany({
    where: {
      timestamp: { lt: cutoff },
    },
  });

  this.logger.log(`Archived ${deleted.count} error logs`);
}
```

### Delete Expired Sessions

```typescript
@Cron("0 3 * * *")
async deleteExpiredSessions(): Promise<void> {
  const deleted = await this.db.session.deleteMany({
    where: {
      expires_at: { lt: new Date() },
    },
  });

  this.logger.log(`Deleted ${deleted.count} expired sessions`);
}
```

### Hard-Delete Soft-Deleted Users

```typescript
@Cron("0 4 * * *")
async processQueuedDeletions(): Promise<void> {
  // Find users soft-deleted > 30 days ago
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const users = await this.db.user.findMany({
    where: {
      deletedAt: { lt: cutoff },
    },
  });

  for (const user of users) {
    await this.queue.add("hard_delete_user", { userId: user.id });
  }

  this.logger.log(`Queued hard-deletion for ${users.length} users`);
}
```

---

## Testing

```typescript
// apps/vlass-api-e2e/src/data-retention.spec.ts

describe('Data Retention & Deletion', () => {
  it('should soft-delete user immediately', async () => {
    const userId = 'user_test';

    const res = await request.delete('/users/me').auth(userId);

    expect(res.status).toBe(200);

    // User should still exist in DB (soft deleted)
    const user = await db.user.findUnique({ where: { id: userId } });
    expect(user.deletedAt).toBeDefined();
    expect(user.deleted).toBe(true);
  });

  it('should hard-delete after 30 days', async () => {
    const userId = 'user_old';

    // Soft delete user
    await db.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });

    // Run hard-delete job
    await hardDeleteQueue.process();

    // User should be gone
    const user = await db.user.findUnique({ where: { id: userId } });
    expect(user).toBeNull();
  });

  it('should export user data as ZIP', async () => {
    const userId = 'user_export';

    const res = await request.post('/users/me/export').auth(userId);

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/s3.*\.zip/);

    // Download and verify ZIP contains data.json
    const buffer = await http.get(res.body.url);
    const zip = new AdmZip(buffer);
    expect(zip.getEntry('data.json')).toBeDefined();
  });

  it('should keep posts with replies on user deletion', async () => {
    const userId = 'user_author';
    const postId = 'post_with_replies';

    // Add comment to post
    await db.comment.create({
      data: {
        content: 'Reply',
        post_id: postId,
        author_id: 'other_user',
      },
    });

    // Hard delete user
    await db.user.delete({ where: { id: userId } });

    // Post should still exist (anonymized)
    const post = await db.post.findUnique({ where: { id: postId } });
    expect(post.author_id).toBeNull();
    expect(post.content).toBe('[deleted]');
  });
});
```

---

**Last Updated:** 2026-02-06

**Policy:** Soft delete (30d) → Hard delete. Export on demand. Audit logs 2 years.
