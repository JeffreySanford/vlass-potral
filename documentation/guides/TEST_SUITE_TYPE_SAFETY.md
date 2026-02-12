# Test Suite Type Safety Guide

## Overview

This document outlines how to use strong TypeScript type checking in the Cosmic Horizons test suites to ensure robust, maintainable, and reliable tests.

## Table of Contents

1. [Type Safety Principles](#type-safety-principles)
2. [Test Builders](#test-builders)
3. [Mock Factory](#mock-factory)
4. [Type Assertion Helpers](#type-assertion-helpers)
5. [Configuration](#configuration)
6. [Migration Path: 90%+ Coverage](#migration-path-90-coverage)

---

## Type Safety Principles

### 1. Never Use `any` in Tests

**Bad:**

```typescript
const mockComment: any = { id: 'comment-1' };
```

**Good:**

```typescript
const mockComment = new CommentBuilder()
  .withId('comment-1')
  .build();
// Type is inferred as complete Comment entity
```

### 2. All Test Data Must Be Complete

Test data should include ALL required fields, even if only some are used in the test. This prevents silent bugs where missing fields cause test failures in CI.

**Bad:**

```typescript
const mockPost = {
  id: 'post-1',
  title: 'Test',
  // Missing: status, user_id, description, content, etc.
};
```

**Good:**

```typescript
const mockPost = new PostBuilder()
  .withId('post-1')
  .withTitle('Test')
  .withStatus(PostStatus.PUBLISHED)
  .withUserId('user-1')
  .build();
// All required fields auto-populated with defaults
```

### 3. Use Type Guards for Collections

**Bad:**

```typescript
const logs: any[] = [];
service.getRecent.mockResolvedValue(logs);
```

**Good:**

```typescript
const logs: LogEntry[] = [
  new LogEntryBuilder()
    .withType('ACTION')
    .build() as LogEntry,
];
service.getRecent.mockResolvedValue(logs);
```

---

## Test Builders

### CommentBuilder

Creates fully-typed Comment entities with all required relations.

```typescript
import { CommentBuilder } from '../testing/test-builders';

const comment = new CommentBuilder()
  .withId('comment-1')
  .withContent('Great post!')
  .withUserId('user-1')
  .withPostId('post-1')
  .withParentId(null)
  .withHidden(false)
  .build();

// All properties type-safe, including:
// - hidden_at: Date | null
// - post: Post object (auto-populated)
// - user: User object (auto-populated)
// - replies: Comment[] (auto-populated)
```

### PostBuilder

Creates fully-typed Post entities.

```typescript
import { PostBuilder } from '../testing/test-builders';
import { PostStatus } from '../entities/post.entity';

const post = new PostBuilder()
  .withId('post-1')
  .withTitle('My Great Discovery')
  .withStatus(PostStatus.PUBLISHED)
  .withUserId('scientist-1')
  .withLocked(false)
  .build();

// All properties populated:
// - description, content, published_at, hidden_at, created_at, updated_at, etc.
```

### CommentReportBuilder

Creates fully-typed CommentReport entities with relations.

```typescript
import { CommentReportBuilder } from '../testing/test-builders';

const report = new CommentReportBuilder()
  .withId('report-1')
  .withCommentId('comment-1')
  .withUserId('user-2')
  .withReason('Spam')
  .withStatus('pending')
  .withComment(mockComment) // Optional override
  .withUser(mockUser)       // Optional override
  .build();

// Includes: comment: Comment, user: User (auto-populated)
```

### LogEntryBuilder

Creates fully-typed LogEntry entities.

```typescript
import { LogEntryBuilder } from '../testing/test-builders';

const log = new LogEntryBuilder()
  .withType('ACTION')
  .withSeverity('INFO')
  .withMessage('User logged in')
  .withContext('AuthService')
  .withMeta({ userId: 'user-1', ip: '127.0.0.1' })
  .build();

// All properties: id, at, type, severity, message, context, meta
```

---

## Mock Factory

### Creating Typed Mocks

```typescript
import { createMockRepository, createMockRedisClient } from '../testing/mock-factory';

// Repository mocks
const mockCommentRepo = createMockRepository<Comment>();
mockCommentRepo.findById.mockResolvedValue(mockComment);

// Redis client mocks
const mockRedis = createMockRedisClient();
mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));
mockRedis.setex.mockResolvedValue('OK');
```

### Service Mocks

```typescript
import { CommentsService } from './comments.service';

const commentService = {
  getCommentsByPost: jest.fn() as jest.MockedFunction<CommentsService['getCommentsByPost']>,
  createComment: jest.fn() as jest.MockedFunction<CommentsService['createComment']>,
  updateComment: jest.fn() as jest.MockedFunction<CommentsService['updateComment']>,
  deleteComment: jest.fn() as jest.MockedFunction<CommentsService['deleteComment']>,
} as jest.Mocked<CommentsService>;

// All methods are type-safe!
commentService.getCommentsByPost.mockResolvedValue([mockComment]);
```

---

## Type Assertion Helpers

### Validate Entity Structure

```typescript
import { TestDataTypeChecker } from '../testing/type-safety-config';

// Verify required fields exist
TestDataTypeChecker.validateEntity<Comment>(mockComment, [
  'id',
  'content',
  'user_id',
  'post_id',
  'hidden_at',
  'post',
  'user',
  'replies',
]);

// Verify array of entities
TestDataTypeChecker.validateEntityArray<LogEntry>(logs, [
  'id',
  'at',
  'type',
  'severity',
]);
```

### Validate Enum Values

```typescript
TestDataTypeChecker.assertEnumValue(
  statusValue,
  Object.values(PostStatus),
  'PostStatus',
);
// Throws if statusValue is not a valid PostStatus
```

### Validate Collections

```typescript
TestDataTypeChecker.assertRecordStructure(
  logSummary,
  'string', // keys are strings
  'number', // values are numbers
);
```

---

## Configuration

### Jest Setup

Enable strict TypeScript checking in `jest.config.ts`:

```typescript
import { strictTestTypescriptConfig } from './src/app/testing/type-safety-config';

export default {
  ...strictTestTypescriptConfig,
  // other jest config
};
```

### tsconfig.json for Tests

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

---

## Migration Path: 90%+ Coverage

### Week 1: Repository Layer Tests (+30 tests)

**Target**: 75% coverage

Create type-safe repository tests using builders:

```typescript
describe('CommentRepository', () => {
  let repo: CommentRepository;

  it('should find comment by id with all relations', async () => {
    const expectedComment = new CommentBuilder()
      .withId('comment-1')
      .withContent('Test')
      .build();

    jest.spyOn(repo, 'findById').mockResolvedValue(expectedComment);

    const result = await repo.findById('comment-1');

    TestDataTypeChecker.validateEntity(result, [
      'id', 'content', 'user_id', 'post_id', 'post', 'user', 'replies'
    ]);
  });

  it('should find all comments for post with pagination', async () => {
    const comments = Array.from({ length: 10 }, (_, i) =>
      new CommentBuilder()
        .withId(`comment-${i}`)
        .withPostId('post-1')
        .build(),
    );

    jest.spyOn(repo, 'find').mockResolvedValue(comments);

    const results = await repo.find({ post_id: 'post-1' });

    TestDataTypeChecker.validateEntityArray(results, ['id', 'post_id', 'user_id']);
  });
});
```

### Week 2: DTO Validation Tests (+25 tests)

**Target**: 82% coverage

Test all DTO validators with type safety:

```typescript
describe('CreateCommentDto Validation', () => {
  it('should accept valid comment creation request', async () => {
    const dto: CreateCommentDto = {
      post_id: 'post-1',
      content: 'Great observation!',
      parent_id: undefined,
    };

    const validated = await validate(plainToInstance(CreateCommentDto, dto));
    expect(validated).toHaveLength(0);
  });

  it('should reject missing required fields', async () => {
    const dto: Partial<CreateCommentDto> = {
      content: 'Test',
      // Missing post_id
    };

    const validated = await validate(plainToInstance(CreateCommentDto, dto));
    expect(validated.length).toBeGreaterThan(0);
  });
});
```

### Week 3: Auth Guards & Strategies (+20 tests)

**Target**: 89% coverage

Type-safe auth tests:

```typescript
describe('AuthenticatedGuard', () => {
  it('should grant access for authenticated admin', async () => {
    const request: AuthenticatedRequest = {
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      },
    } as AuthenticatedRequest;

    const result = await guard.canActivate(createExecutionContext(request));
    expect(result).toBe(true);
  });
});
```

### Week 4: E2E with Cypress (+15 tests for coverage)

**Target**: 92%+ coverage

```typescript
describe('Comments E2E', () => {
  it('should create and display comment with full type safety', () => {
    const newComment = new CommentBuilder()
      .withContent('E2E test comment')
      .withPostId('test-post-1')
      .build();

    cy.createComment(newComment);
    cy.get('[data-testid="comment-content"]').should(
      'contain',
      newComment.content,
    );

    // Verify returned comment has all fields
    cy.get('[data-testid="comment-item"]').then(($el) => {
      const displayedComment = JSON.parse($el.attr('data-comment'));
      TestDataTypeChecker.validateEntity(displayedComment, [
        'id', 'content', 'user_id', 'post_id', 'created_at',
      ]);
    });
  });
});
```

---

## Best Practices Checklist

- [ ] All test data uses builders or factories
- [ ] No `any` types in test files
- [ ] All mocked entities are complete (all required fields)
- [ ] Repository mocks return typed collections
- [ ] Service mocks have proper return types
- [ ] Tests validate object structure, not just shape
- [ ] Builders include sensible defaults
- [ ] Error cases use proper exception types
- [ ] Auth context properly typed with AuthenticatedRequest
- [ ] DTOs validated before service calls

---

## Example: Complete Type-Safe Test

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { CommentRepository } from '../repositories/comment.repository';
import { CommentBuilder, PostBuilder } from '../testing/test-builders';
import { TestDataTypeChecker } from '../testing/type-safety-config';

describe('CommentsService - Type Safe Example', () => {
  let service: CommentsService;
  let repo: jest.Mocked<CommentRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        {
          provide: CommentRepository,
          useValue: {
            findById: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CommentsService);
    repo = module.get(CommentRepository) as jest.Mocked<CommentRepository>;
  });

  it('should get comments for post with full type safety', async () => {
    // Create typed test data
    const post = new PostBuilder()
      .withId('post-1')
      .build();

    const comments = Array.from({ length: 3 }, (_, i) =>
      new CommentBuilder()
        .withId(`comment-${i}`)
        .withPostId(post.id)
        .build(),
    );

    // Validate test data structure
    TestDataTypeChecker.validateEntityArray(comments, [
      'id',
      'post_id',
      'user_id',
      'content',
      'hidden_at',
    ]);

    // Setup typed mock
    repo.find.mockResolvedValue(comments);

    // Execute
    const result = await service.getCommentsByPost(post.id);

    // Assert with type safety
    expect(result).toHaveLength(3);
    result.forEach((comment) => {
      TestDataTypeChecker.validateEntity(comment, [
        'id',
        'post_id',
        'user_id',
        'post',
        'user',
        'replies',
      ]);
    });
  });
});
```

---

## Resources

- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
- [Jest TypeScript Support](https://jestjs.io/docs/getting-started#using-typescript)
- [NestJS Testing Guide](https://docs.nestjs.com/fundamentals/testing)
- [Test Data Builders Pattern](https://martinfowler.com/bliki/ObjectMother.html)
