# Test Type Safety - Quick Reference

## Common Patterns

### Create Test Data

```typescript
// Comments
const comment = new CommentBuilder().withId('c1').withContent('text').build();

// Posts
const post = new PostBuilder().withId('p1').withTitle('Title').build();

// Reports
const report = new CommentReportBuilder().withId('r1').withReason('Spam').build();

// Logs
const log = new LogEntryBuilder().withType('ACTION').withSeverity('INFO').build();
```

### Mock Repositories

```typescript
const mockRepo = createMockRepository<Comment>();
mockRepo.findById.mockResolvedValue(comment);
mockRepo.find.mockResolvedValue([comment]);
mockRepo.create.mockResolvedValue(comment);
```

### Mock Services

```typescript
const mockService = {
  getComments: jest.fn(),
  createComment: jest.fn(),
} as jest.Mocked<CommentsService>;

mockService.getComments.mockResolvedValue([comment]);
```

### Validate Data

```typescript
// Single entity
TestDataTypeChecker.validateEntity(comment, ['id', 'content', 'user_id']);

// Array of entities
TestDataTypeChecker.validateEntityArray(comments, ['id', 'post_id']);

// Enum values
TestDataTypeChecker.assertEnumValue(status, Object.values(PostStatus));

// Records
TestDataTypeChecker.assertRecordStructure(map, 'string', 'number');
```

### Assertions

```typescript
import { TypeSafeAssertions } from '../testing/mock-factory';

// Partial object comparison
TypeSafeAssertions.assertPartial(result, { id: 'c1', status: 'active' });

// Array elements
TypeSafeAssertions.assertArrayPropertiesEqual(results, [
  { id: 'c1', status: 'active' },
  { id: 'c2', status: 'pending' },
]);

// Mock called with partial
TypeSafeAssertions.assertMockCalledWithPartial(repo.find, { post_id: 'p1' });
```

## Common Builders

### CommentBuilder

```typescript
.withId(id: string)
.withContent(content: string)
.withUserId(userId: string)
.withPostId(postId: string)
.withParentId(parentId: string | null)
.withHidden(hidden: boolean, hiddenAt?: Date)
.withDeleted(deleted: boolean, deletedAt?: Date)
.withParent(parent: any)
.withPost(post: any)
.withUser(user: any)
.withReplies(replies: any[])
.build()
```

### PostBuilder

```typescript
.withId(id: string)
.withTitle(title: string)
.withStatus(status: PostStatus)
.withUserId(userId: string)
.withLocked(locked: boolean)
.build()
```

### LogEntryBuilder

```typescript
.withId(id: string)
.withAt(at: Date)
.withType(type: string)
.withSeverity(severity: 'INFO' | 'WARN' | 'ERROR')
.withMessage(message: string)
.withContext(context: string)
.withMeta(meta: Record<string, any>)
.build()
```

### CommentReportBuilder

```typescript
.withId(id: string)
.withCommentId(commentId: string)
.withUserId(userId: string)
.withReason(reason: string)
.withStatus(status: 'pending' | 'resolved' | 'dismissed')
.withComment(comment: any)
.withUser(user: any)
.build()
```

## Files

| File | Purpose |
|------|---------|
| `test-builders.ts` | Fluent builders for test entities |
| `mock-factory.ts` | Mock utils (repo, service, assertions) |
| `type-safety-config.ts` | TypeScript config, validators |

## Import Paths

```typescript
// Builders
import { CommentBuilder, PostBuilder, CommentReportBuilder, LogEntryBuilder, TestDataFactory } from '../testing/test-builders';

// Mocks
import { createMockRepository, createMockRedisClient, mockService, TypeSafeAssertions } from '../testing/mock-factory';

// Validators
import { TestDataTypeChecker, BuilderTypeValidator } from '../testing/type-safety-config';
```

## Do's ✅

- Use builders for all test entities
- Include all required fields
- Validate test data structure
- Mock with proper types
- Check enum values

## Don'ts ❌

- Don't use `any` types
- Don't hand-write nested objects
- Don't skip validation
- Don't leave fields undefined
- Don't use untyped mocks

## Running Tests

```bash
# All backend tests
pnpm nx run cosmic-horizons-api:test

# Single test file
pnpm nx run cosmic-horizons-api:test -- comments.controller.spec.ts

# With coverage
pnpm nx run cosmic-horizons-api:test -- --coverage

# Watch mode
pnpm nx run cosmic-horizons-api:test -- --watch
```

## Coverage Goals

| Week | Target | Tests Added | Focus |
|------|--------|-------------|-------|
| 1 | 75% | +30 | Repository layer |
| 2 | 82% | +25 | DTO validation |
| 3 | 89% | +20 | Auth/Guards |
| 4 | 92%+ | +15 | E2E scenarios |

**Current Status**: 68% (431 passing tests, all type-safe)
**Deadline**: 90%+ by April 1, 2026 (symposium abstract deadline)
