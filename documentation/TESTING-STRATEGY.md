# Testing Strategy & TDD Implementation

## Philosophy

**Test-Driven Development (TDD) is mandatory.** Tests gate every merge and enforced at CI. Key principles:

1. **Policy tests first.** No `standalone: true`, no `async/await` in observables, no direct NRAO calls, allowlist enforced.
2. **API integration tests.** NestJS API returns correct JSON shapes.
3. **Golden image tests.** Viewer output matches reference snapshots.
4. **Audit tests.** Every user action logged with correlation ID.
5. **E2E tests.** Full workflows (signup → post → snapshot → share) work end-to-end.

---

## Test Structure

```text
apps/
├── vlass-api/
│   └── src/
│       ├── **/*.spec.ts          # Unit tests (colocated)
│       └── e2e/                  # Integration tests
│           ├── auth.e2e.ts
│           ├── viewer.e2e.ts
│           ├── community.e2e.ts
│           └── fixtures/         # Recorded responses
│               ├── vlass-hips-manifest.json
│               ├── nrao-tap-result.json
│               └── ...
├── vlass-web/
│   └── src/
│       ├── **/*.spec.ts          # Unit tests
│       └── e2e/                  # Playwright tests
│           ├── viewer.spec.ts
│           ├── community.spec.ts
│           └── fixtures/         # Golden images
│               ├── viewer-aladin-mode.png
│               ├── community-feed.png
│               └── ...
└── vlass-rust/                   # (Optional, v2+) Render service tests
    └── tests/
        ├── preview.test.rs
        └── snapshot.test.rs
```

---

## Policy Tests (Enforcement Gates)

Tests that **must pass** before any merge. These validate constraints, not features.

### 1. No Standalone Components

```typescript
// tools/policy-tests/no-standalone.spec.ts

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Policy: No Standalone Components', () => {
  it('should fail if any component has standalone: true', () => {
    const appDir = join(process.cwd(), 'apps/vlass-web/src');
    const componentFiles = findFiles(appDir, /\.ts$/, (f) =>
      f.includes('component.ts'),
    );

    const violations: string[] = [];

    for (const file of componentFiles) {
      const content = readFileSync(file, 'utf-8');
      if (/standalone\s*:\s*true/.test(content)) {
        violations.push(file);
      }
    }

    expect(violations).toEqual(
      [],
      `Found standalone components: ${violations.join(', ')}`,
    );
  });
});
```

**CI Integration:**

```bash
# In nx.json or .github/workflows/ci.yml
pnpm nx run tools-policy-tests:test --policy=no-standalone
```

If this test fails, **the build stops.** No exceptions.

### 2. No Async/Await in Observable Code

```typescript
// tools/policy-tests/no-async-await.spec.ts

describe('Policy: No async/await in Observable Services', () => {
  it('should find no async method declarations in service/**/*.ts', () => {
    const serviceDir = join(process.cwd(), 'apps/vlass-api/src');
    const serviceFiles = findFiles(serviceDir, /\.service\.ts$/);

    const violations: string[] = [];

    for (const file of serviceFiles) {
      const content = readFileSync(file, 'utf-8');
      // Match "async methodName()" but allow in non-Observable methods
      const asyncMatches = content.match(
        /async\s+\w+\s*\(.*?\)\s*:\s*Observable/g,
      );
      if (asyncMatches) {
        violations.push(`${file}: ${asyncMatches.join(', ')}`);
      }
    }

    expect(violations).toEqual(
      [],
      `No async Observable methods allowed: ${violations.join('; ')}`,
    );
  });
});
```

### 3. Allowlist Not Bypassed

```typescript
// tools/policy-tests/allowlist-enforced.spec.ts

describe('Policy: Upstream Allowlist Enforced', () => {
  it('should reject any hardcoded upstream URLs outside allowlist', () => {
    const proxyDir = join(process.cwd(), 'apps/vlass-api/src/proxy');
    const proxyFiles = findFiles(proxyDir, /\.ts$/);

    const allowlist = [
      'vlass-dl.nrao.edu',
      'data-query.nrao.edu',
      'data.nrao.edu',
      'vizier.u-strasbg.fr',
      'cds.unistra.fr',
    ];

    const violations: string[] = [];

    for (const file of proxyFiles) {
      const content = readFileSync(file, 'utf-8');
      // Find all hardcoded URLs
      const urlMatches = content.match(/https?:\/\/[\w\-.]+(:\d+)?/g) || [];
      for (const url of urlMatches) {
        const host = new URL(url).hostname;
        if (!allowlist.some((a) => host.includes(a))) {
          violations.push(`${file}: ${url}`);
        }
      }
    }

    expect(violations).toEqual(
      [],
      `Hardcoded URLs outside allowlist: ${violations.join('; ')}`,
    );
  });
});
```

---

## Contract Tests (Nest ↔ Go)

Validate that Nest calls Go microservice and receives correct shapes.

```typescript
// apps/vlass-api-e2e/src/contracts/manifest.contract.ts

import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test.describe('Contract: Go Manifest Service', () => {
  test('should return correct manifest shape for valid request', async ({
    request,
  }) => {
    const response = await request.get(
      'http://localhost:9090/manifest?ra=40.5&dec=-75.5&fov=1.0&layer=MedianStack',
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Validate shape
    expect(data).toHaveProperty('tiles');
    expect(Array.isArray(data.tiles)).toBe(true);

    // Validate each tile
    data.tiles.forEach((tile: Record<string, unknown>) => {
      expect(tile).toHaveProperty('url');
      expect(tile).toHaveProperty('order');
      expect(tile).toHaveProperty('x');
      expect(tile).toHaveProperty('y');
      expect(typeof tile.order).toBe('number');
    });

    expect(data).toHaveProperty('center');
    expect(data.center).toHaveProperty('raDeg');
    expect(data.center).toHaveProperty('decDeg');

    // Save as golden record
    fs.writeFileSync(
      'apps/vlass-api-e2e/src/fixtures/manifest-response.json',
      JSON.stringify(data, null, 2),
    );
  });

  test('should fail gracefully on invalid coordinates', async ({ request }) => {
    const response = await request.get(
      'http://localhost:9090/manifest?ra=999&dec=999&fov=0&layer=MedianStack',
    );

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty('error');
  });
});
```

**Run before merge:**

```bash
# Start both services
pnpm nx serve vlass-api &
go run ./apps/vlass-go/main.go &

# Run contract tests
pnpm nx e2e vlass-api-e2e

# Stop services
pkill node; pkill -f "main.go"
```

---

## Golden Image Tests (Viewer Mode A)

Aladin Lite viewer output compared against reference screenshots.

```typescript
// apps/vlass-web-e2e/src/viewer-aladin.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Viewer Mode A: Aladin Lite', () => {
  test('should render MedianStack survey at default position', async ({
    page,
  }) => {
    // Navigate to viewer
    await page.goto(
      'http://localhost:4200/viewer?epoch=MedianStack&mode=ALADIN',
    );

    // Wait for Aladin to load
    await page.waitForSelector('[data-test-id="aladin-viewer"]');

    // Ensure tiles load
    await page.waitForTimeout(2000);

    // Take screenshot
    const screenshot = await page
      .locator('[data-test-id="aladin-viewer"]')
      .screenshot({
        path: 'actual-aladin-default.png',
      });

    // Compare against golden
    expect(screenshot).toMatchSnapshot('aladin-default.png');
  });

  test('should pan and zoom smoothly', async ({ page }) => {
    await page.goto(
      'http://localhost:4200/viewer?epoch=MedianStack&mode=ALADIN',
    );
    await page.waitForSelector('[data-test-id="aladin-viewer"]');

    // Simulate pan (drag)
    const viewer = page.locator('[data-test-id="aladin-viewer"]');
    await viewer.dragTo(viewer, {
      sourcePosition: { x: 100, y: 100 },
      targetPosition: { x: 50, y: 50 },
    });

    await page.waitForTimeout(500);

    const screenshot = await viewer.screenshot();
    expect(screenshot).toMatchSnapshot('aladin-pan.png');
  });

  test('should handle search-to-center workflow', async ({ page }) => {
    await page.goto(
      'http://localhost:4200/viewer?epoch=MedianStack&mode=ALADIN',
    );
    await page.waitForSelector('[data-test-id="search-box"]');

    // Type object name
    await page.fill('[data-test-id="search-box"]', 'M87');
    await page.click('[data-test-id="search-button"]');

    // Wait for centering
    await page.waitForTimeout(1000);

    const screenshot = await page
      .locator('[data-test-id="aladin-viewer"]')
      .screenshot();
    expect(screenshot).toMatchSnapshot('aladin-m87.png');
  });
});
```

**Update goldens:**

```bash
pnpm nx e2e vlass-web-e2e -- --update-snapshots
```

---

## Audit Trail Tests

Verify that every user action is logged with correlation ID.

```typescript
// apps/vlass-api-e2e/src/audit.e2e.ts

describe('Audit Trail', () => {
  it('should log user login with correlation ID', async () => {
    const response = await request.post('http://localhost:3333/auth/login', {
      data: { email: 'user@test.com', password: 'password123' },
    });

    const correlationId = response.headers()['x-correlation-id'];
    expect(correlationId).toBeTruthy();

    // Query audit_events for this correlation ID
    const auditRecord = await db.query(
      'SELECT * FROM audit_events WHERE correlation_id = ?',
      [correlationId],
    );

    expect(auditRecord).toBeTruthy();
    expect(auditRecord.action).toBe('LOGIN');
    expect(auditRecord.status).toBe('SUCCESS');
    expect(auditRecord.actor_id).toBeTruthy();
  });

  it('should log rate-limited requests', async () => {
    // Exhaust rate limit
    for (let i = 0; i < 25; i++) {
      await request.get('http://localhost:3333/config/public');
    }

    // Next request should be rate-limited
    const response = await request.get('http://localhost:3333/config/public');
    expect(response.status()).toBe(429);

    const correlationId = response.headers()['x-correlation-id'];

    // Verify audit log
    const auditRecord = await db.query(
      'SELECT * FROM audit_events WHERE correlation_id = ?',
      [correlationId],
    );

    expect(auditRecord.status).toBe('RATE_LIMITED');
    expect(auditRecord.action).toBe('CONFIG_READ');
  });

  it('should redact sensitive fields in audit logs', async () => {
    // Register a new user
    await request.post('http://localhost:3333/auth/register', {
      data: {
        email: 'newuser@test.com',
        password: 'SuperSecret123!',
        displayName: 'Test User',
      },
    });

    // Check audit log
    const auditRecords = await db.query(
      'SELECT details FROM audit_events WHERE action = ? ORDER BY ts_utc DESC LIMIT 1',
      ['REGISTER'],
    );

    const details = JSON.parse(auditRecords.details);

    // Password should NOT be in details
    expect(JSON.stringify(details)).not.toContain('SuperSecret123');

    // Email should NOT be in details (PII)
    expect(JSON.stringify(details)).not.toContain('newuser@test.com');
  });
});
```

---

## Integration Tests (API Shape Validation)

```typescript
// apps/vlass-api-e2e/src/api-shapes.e2e.ts

describe('API Response Shapes', () => {
  it('GET /config/public should match ConfigPublic DTO', async () => {
    const response = await request.get('http://localhost:3333/config/public');
    const data = response.json();

    // Validate shape (from libs/shared/models)
    expect(data).toHaveProperty('epochs');
    expect(Array.isArray(data.epochs)).toBe(true);

    expect(data).toHaveProperty('defaultEpoch');
    expect(typeof data.defaultEpoch).toBe('string');

    expect(data).toHaveProperty('surveys');
    expect(Array.isArray(data.surveys)).toBe(true);

    data.surveys.forEach((survey: Record<string, unknown>) => {
      expect(survey).toHaveProperty('name');
      expect(survey).toHaveProperty('hipsUrl');
    });

    expect(data).toHaveProperty('features');
    expect(typeof data.features).toBe('object');

    expect(data).toHaveProperty('rateLimitInfo');
    expect(data.rateLimitInfo).toHaveProperty('anonRPM');
    expect(data.rateLimitInfo).toHaveProperty('verifiedRPM');
  });

  it('POST /community/posts should return Post with author details', async () => {
    // Setup: register and verify user
    const userResponse = await registerAndVerifyUser();
    const token = userResponse.token;

    // Create post
    const response = await request.post(
      'http://localhost:3333/community/posts',
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          title: 'Test Post',
          body: 'This is a test.',
          tags: ['Test', 'VLASS2.1'],
        },
      },
    );

    const post = await response.json();

    expect(post).toHaveProperty('id');
    expect(post).toHaveProperty('title');
    expect(post).toHaveProperty('body');
    expect(post).toHaveProperty('author_id');
    expect(post).toHaveProperty('author_name');
    expect(post).toHaveProperty('is_published');
    expect(post.is_published).toBe(false); // unpublished until approved
    expect(post).toHaveProperty('created_at');
  });
});
```

---

## Test Categories & Coverage Goals

| Category              | Tool       | Target Coverage                 | Gate                                     |
| --------------------- | ---------- | ------------------------------- | ---------------------------------------- |
| **Unit Tests**        | Jest       | 80% (services), 60% (UI)        | ❌ Not blocking (informational)          |
| **Integration Tests** | Jest       | API shape + auth flow           | ✅ Blocking merge                        |
| **Contract Tests**    | Playwright | Nest → Go messages              | ✅ Blocking merge                        |
| **Golden Images**     | Playwright | Aladin viewer mode              | ✅ Blocking merge                        |
| **Policy Tests**      | Jest       | No standalone, allowlist, async | ✅ Blocking merge                        |
| **Audit Tests**       | Jest + DB  | All actions logged              | ✅ Blocking merge                        |
| **E2E/Playwright**    | Playwright | User workflows                  | ⚠️ Can be skipped with `--skip-e2e` flag |

---

## Running Tests

```bash
# Run all unit tests
pnpm nx test

# Run specific project
pnpm nx test apps/vlass-api

# Run with coverage
pnpm nx test --coverage

# Run e2e (start servers first)
pnpm nx e2e vlass-api-e2e
pnpm nx e2e vlass-web-e2e

# Run policy tests (must pass)
pnpm nx run tools-policy-tests:test

# Run everything (CI pipeline)
pnpm nx run-many --target=test --all && \
pnpm nx run-many --target=e2e --all && \
pnpm nx run tools-policy-tests:test
```

---

## Mocking Strategy

### Mock NRAO Upstreams

Create fixture JSON files for common queries:

```typescript
// apps/vlass-api-e2e/src/fixtures/index.ts

export const VLASS_MANIFEST_FIXTURE = {
  tiles: [
    {
      url: 'https://vlass-dl.nrao.edu/vlass/HiPS/MedianStack/Norder3/...',
      order: 3,
      x: 4,
      y: 5,
      w: 512,
      h: 512,
    },
    // ... more tiles
  ],
  center: { raDeg: 40.5, decDeg: -75.5 },
  attribution: 'VLASS / NRAO',
};

export const NRAO_TAP_RESULT = {
  data: [
    { source_id: '12345', ra: 40.5, dec: -75.5, flux_1_4: 0.05 },
    // ... more objects
  ],
};
```

### Mock HTTP Requests

```typescript
// apps/vlass-api/src/proxy/proxy.service.spec.ts

import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { ProxyService } from './proxy.service';
import { VLASS_MANIFEST_FIXTURE } from '../fixtures';

describe('ProxyService', () => {
  let service: ProxyService;
  let httpService: DeepMocked<HttpService>;

  beforeEach(async () => {
    httpService = createMock<HttpService>();
    service = new ProxyService(httpService);
  });

  it('should fetch and cache VLASS manifest', (done) => {
    // Mock the HTTP call
    httpService.get.mockReturnValue(of({ data: VLASS_MANIFEST_FIXTURE }));

    service.getManifest('40.5', '-75.5', '1.0').subscribe((manifest) => {
      expect(manifest.center.raDeg).toBe(40.5);
      expect(manifest.tiles.length).toBeGreaterThan(0);
      done();
    });
  });
});
```

---

## Cleanup & Retention Policies

### Audit Event Cleanup Job

```typescript
// apps/vlass-api/src/audit/audit-cleanup.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from './audit-event.entity';

@Injectable()
export class AuditCleanupService {
  private logger = new Logger(AuditCleanupService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private auditRepository: Repository<AuditEvent>,
  ) {}

  // Daily at 02:00 UTC
  @Cron('0 2 * * *')
  async cleanupOldAuditEvents() {
    const retentionDays = parseInt(
      process.env.AUDIT_RETENTION_DAYS || '90',
      10,
    );
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.auditRepository.delete({
      ts_utc: new Date(`${cutoffDate.toISOString().split('T')[0]}T00:00:00Z`),
    });

    this.logger.log(
      `Deleted ${result.affected} audit events older than ${retentionDays} days`,
    );
  }
}
```

---

**Last Updated:** 2026-02-06

**Key Reminders:**

1. **Policy tests are blocking.** No exceptions for `standalone: true` or hardcoded URLs.
2. **Golden images must be updated.** Use `--update-snapshots` carefully; review diffs before committing.
3. **Fixtures are immutable.** Recorded responses checked in to git; never modify by hand.
4. **Audit logs are truth.** Query DB to verify tests; logs are the source of record, not application memory.
5. **Correlation IDs everywhere.** Track requests from HTTP → Nest → Go using UUID header.
