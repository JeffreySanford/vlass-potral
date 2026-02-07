# Test Matrix & Coverage Goals

## Overview

Comprehensive testing across unit, integration, e2e, and performance layers.

---

## Test Pyramid

```text
                    ▲
                   / \
                  /   \    E2E (5-10%)
                 /     \   > 10 critical user flows
                /_______\
               /         \
              /   Integ.  \  Integration (10-20%)
             /             \ > Data flow, API, DB
            /______________\
           /                 \
          /      Unit         \  Unit (70-80%)
         /         Tests       \ > Functions, classes
        /___________I___________\
```

---

## Unit Tests

### Coverage Targets (Integration)

| Module              | Target | Current |
| ------------------- | ------ | ------- |
| `shared/models`     | 90%    | —       |
| `community/service` | 85%    | —       |
| `tap/service`       | 80%    | —       |
| `auth/service`      | 95%    | —       |
| `shared/utils`      | 100%   | —       |

### Run Unit Tests

```bash
cd apps/vlass-api
npm test

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Example: Community Service

```typescript
// apps/vlass-api/src/app/community/community.service.spec.ts

describe('CommunityService', () => {
  let service: CommunityService;
  let db: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CommunityService,
        { provide: PrismaService, useValue: mockDb },
      ],
    }).compile();

    service = module.get(CommunityService);
    db = module.get(PrismaService);
  });

  it('should create post with validation', async () => {
    const dto: CreatePostDto = {
      title: 'Test',
      content: 'Content',
      categoriesIds: ['cat_1'],
    };

    jest.spyOn(db.post, 'create').mockResolvedValue({
      id: 'p_1',
      ...dto,
      author_id: 'u_1',
      created_at: new Date(),
      updated_at: new Date(),
      deleted: false,
    });

    const result = await service.createPost('u_1', dto);

    expect(result.id).toBe('p_1');
    expect(db.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Test',
        author_id: 'u_1',
      }),
    });
  });

  it('should reject post with empty title', async () => {
    const dto: CreatePostDto = {
      title: '',
      content: 'Content',
      categoriesIds: [],
    };

    await expect(service.createPost('u_1', dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should flag post after 3 reports', async () => {
    const postId = 'p_1';

    // First 2 reports
    await service.reportPost(postId, 'u_2', 'SPAM');
    await service.reportPost(postId, 'u_3', 'SPAM');

    // Should not flag yet
    let post = await service.getPost(postId);
    expect(post.flag_count).toBe(2);

    // 3rd report triggers flag
    await service.reportPost(postId, 'u_4', 'SPAM');

    post = await service.getPost(postId);
    expect(post.flagged).toBe(true);
  });
});
```

---

## Integration Tests

### Coverage Targets

API contracts, database transactions, caching, auth flows.

### Run Integration Tests

```bash
cd apps/vlass-api
npm run test:integration

# Or specific test file
npm run test:integration -- community.integration.spec.ts
```

### Example: Post Creation Flow

```typescript
// apps/vlass-api-e2e/src/community.integration.spec.ts

describe('Community Post Flow (Integration)', () => {
  let app: INestApplication;
  let service: CommunityService;
  let db: PrismaService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    service = moduleFixture.get(CommunityService);
    db = moduleFixture.get(PrismaService);
  });

  beforeEach(async () => {
    // Clean database
    await db.post.deleteMany({});
    await db.comment.deleteMany({});
    await db.user.deleteMany({});
  });

  it('should create post, add comment, and flag comment', async () => {
    // Create user
    const user = await db.user.create({
      data: { id: 'u_1', username: 'alice', email: 'a@x.local' },
    });

    // Create post
    const post = await service.createPost('u_1', {
      title: 'Test',
      content: 'Content',
      categoriesIds: ['cat_1'],
    });

    expect(post.id).toBeDefined();
    expect(post.author_id).toBe('u_1');

    // Add comment
    const comment = await service.addComment(post.id, 'u_2', {
      content: 'Reply',
    });

    expect(comment.post_id).toBe(post.id);

    // Flag comment (3x)
    await service.reportComment(comment.id, 'u_3', 'SPAM');
    await service.reportComment(comment.id, 'u_4', 'SPAM');
    await service.reportComment(comment.id, 'u_5', 'SPAM');

    // Should be flagged
    const flagged = await db.comment.findUnique({
      where: { id: comment.id },
    });

    expect(flagged?.flagged).toBe(true);
  });

  it('should update cache on post modification', async () => {
    const cache = moduleFixture.get(CacheService);

    const post = await service.createPost('u_1', {
      title: 'Original',
      content: 'Original content',
      categoriesIds: ['cat_1'],
    });

    // Verify cached
    const cached = await cache.get(`post:${post.id}`);
    expect(cached.title).toBe('Original');

    // Update post
    await service.updatePost('u_1', post.id, {
      title: 'Updated',
    });

    // Verify cache invalidated
    const newCached = await cache.get(`post:${post.id}`);
    expect(newCached.title).toBe('Updated');
  });
});
```

---

## E2E Tests

### 10 Critical User Flows

1. **Auth Flow**: Register → Login → Set Profile
2. **Post Discovery**: Search → View Post → Comment
3. **Community Moderation**: Flag Post → Mod Review → Action
4. **TAP Query**: Search Catalog → View Image → Export FITS
5. **Data Export**: Request Export → Download Data
6. **User Deletion**: Request Delete → Confirm → Hard Delete
7. **Snapshot**: View Image → Generate Snapshot → Download
8. **Voting**: Like Post → Vote on Poll → See Results
9. **Admin Dashboard**: View Audit → Check Metrics → Export Report
10. **Full Text Search**: Search Posts → Filter → Sort Results

### Run E2E Tests

```bash
cd apps/vlass-web-e2e
npx playwright test

# Debug mode
npx playwright test --debug

# Single test
npx playwright test auth.flow.spec.ts
```

### Example: Auth Flow (Playwright)

```typescript
// apps/vlass-web-e2e/src/auth.flow.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Auth Flow', () => {
  test('register > login > profile', async ({ page }) => {
    // Register
    await page.goto('http://localhost:4200/auth/register');

    await page.fill('input[name="username"]', 'alice');
    await page.fill('input[name="email"]', 'alice@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');

    await page.click('button:has-text("Register")');

    // Wait for redirect to dashboard
    await page.waitForURL('http://localhost:4200/dashboard');
    expect(await page.title()).toContain('Dashboard');

    // Set profile
    await page.goto('http://localhost:4200/profile/edit');

    await page.fill('textarea[name="bio"]', 'Astronomer');
    await page.selectOption('select[name="role"]', 'observer');

    await page.click('button:has-text("Save")');
    await expect(page.locator('.success-message')).toBeVisible();

    // Login again (verify persistence)
    await page.click('text="Logout"');
    await page.goto('http://localhost:4200/auth/login');

    await page.fill('input[name="email"]', 'alice@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button:has-text("Login")');

    // Should see dashboard with profile
    await page.waitForURL('http://localhost:4200/dashboard');
    await expect(page.locator('text="Astronomer"')).toBeVisible();
  });

  it('should reject invalid password', async ({ page }) => {
    await page.goto('http://localhost:4200/auth/login');

    await page.fill('input[name="email"]', 'alice@example.com');
    await page.fill('input[name="password"]', 'WrongPassword');
    await page.click('button:has-text("Login")');

    await expect(page.locator('.error-message')).toBeVisible();
    expect(page.url()).toContain('/auth/login');
  });
});
```

---

## Performance Tests

### Benchmarks

| Operation             | Target  | Current |
| --------------------- | ------- | ------- |
| Search 1M posts (TAP) | < 500ms | —       |
| Load community feed   | < 1s    | —       |
| Snapshot 512x512      | < 5s    | —       |
| Export FITS (100MB)   | < 10s   | —       |
| Page load (JS+CSS)    | < 3s    | —       |

### Run Performance Tests

```bash
cd apps/vlass-api-e2e
npm run test:performance
```

### Example: TAP Search Performance

```typescript
// apps/vlass-api-e2e/src/performance.spec.ts

describe('Performance Tests', () => {
  it('should search 1M posts in < 500ms', async () => {
    // Pre-populate 1M posts
    const posts = Array.from({ length: 1_000_000 }, (_, i) => ({
      id: `p_${i}`,
      title: `Post ${i}`,
      ra: 200 + Math.random() * 10,
      dec: 30 + Math.random() * 10,
    }));

    await db.post.createMany({ data: posts });

    // Measure query time
    const startTime = performance.now();

    const results = await request
      .get('/api/tap-search?ra=205&dec=35&radius=1')
      .expect(200);

    const elapsed = performance.now() - startTime;

    expect(elapsed).toBeLessThan(500);
    expect(results.body.sources).toBeDefined();
  });

  it('should generate snapshot in < 5s', async () => {
    const startTime = performance.now();

    const res = await request
      .post('/api/viewers/123/snapshot')
      .send({ width: 512, height: 512 })
      .expect(200);

    const jobId = res.body.jobId;

    // Poll for completion
    let completed = false;
    let attempts = 0;

    while (!completed && attempts < 50) {
      const status = await request.get(`/api/jobs/${jobId}`).expect(200);

      if (status.body.status === 'COMPLETE') {
        completed = true;
      }

      await sleep(100);
      attempts++;
    }

    const elapsed = performance.now() - startTime;

    expect(elapsed).toBeLessThan(5000);
    expect(completed).toBe(true);
  });
});
```

---

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml

name: Test Suite

on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v3

  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      - run: npm run start &
      - run: npx playwright test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Coverage Report

Generate HTML report:

```bash
npm run test:unit -- --coverage --coverageReporters=html
open coverage/index.html
```

---

**Last Updated:** 2026-02-06

**Targets:** Unit 90%, Integration 15%, E2E 10 flows, Performance benchmarks.
