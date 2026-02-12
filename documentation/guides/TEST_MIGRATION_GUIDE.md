# Test Migration Guide: Adding Type Safety

This guide shows how to migrate existing tests to use the type-safe builder and mock factory infrastructure.

## Step 1: Identify Tests to Migrate

Find test files with common type-safety issues:

```bash
# Find all test files
find apps/cosmic-horizons-api/src -name "*.spec.ts" | wc -l

# Find files with 'any' types
grep -r "any" apps/cosmic-horizons-api/src --include="*.spec.ts" | head -20
```

## Step 2: Import Infrastructure

Add imports at the top of your spec file:

```typescript
// BEFORE
import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';

// AFTER
import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { CommentBuilder, PostBuilder, CommentReportBuilder, TestDataFactory } from '../testing/test-builders';
import { createMockRepository, TypeSafeAssertions } from '../testing/mock-factory';
import { TestDataTypeChecker } from '../testing/type-safety-config';
```

## Step 3: Update Mock Data Creation

### Pattern 1: Simple Entity Mocks

**BEFORE:**

```typescript
const mockComment = {
  id: 'comment-1',
  content: 'Test comment',
  user_id: 'user-1',
  post_id: 'post-1',
  // Missing relations: hidden_at, post, user, replies
};
```

**AFTER:**

```typescript
const mockComment = new CommentBuilder()
  .withId('comment-1')
  .withContent('Test comment')
  .withUserId('user-1')
  .withPostId('post-1')
  .build();
// All relations auto-populated
```

### Pattern 2: Nested Objects

**BEFORE:**

```typescript
const mockPost = {
  id: 'post-1',
  title: 'Amazing Discovery',
  // Missing: status, user_id, description, content
};

const mockComment = {
  id: 'comment-1',
  content: 'Great post!',
  post: mockPost, // May have missing fields
};
```

**AFTER:**

```typescript
const mockPost = new PostBuilder()
  .withId('post-1')
  .withTitle('Amazing Discovery')
  .build();

const mockComment = new CommentBuilder()
  .withId('comment-1')
  .withContent('Great post!')
  .withPost(mockPost)
  .build();
```

### Pattern 3: Arrays of Entities

**BEFORE:**

```typescript
const comments: any[] = [
  { id: 'c1', content: 'test1', user_id: 'u1', post_id: 'p1' },
  { id: 'c2', content: 'test2', user_id: 'u1', post_id: 'p1' },
];
```

**AFTER:**

```typescript
const comments = Array.from({ length: 2 }, (_, i) =>
  new CommentBuilder()
    .withId(`c${i + 1}`)
    .withContent(`test${i + 1}`)
    .withUserId('u1')
    .withPostId('p1')
    .build(),
);
```

### Pattern 4: Factory Convenience Functions

For simpler cases, use the factory shortcuts:

**BEFORE:**

```typescript
const defaultComment = {
  id: 'comment-1',
  content: 'Default text',
  user_id: 'user-1',
  post_id: 'post-1',
};
```

**AFTER:**

```typescript
const defaultComment = TestDataFactory.createComment({
  content: 'Default text',
});
// Uses sensible defaults for all other fields
```

## Step 4: Update Mock Repositories

### Pattern 1: Repository in beforeEach

**BEFORE:**

```typescript
beforeEach(async () => {
  const mockCommentRepo = {
    findById: jest.fn().mockResolvedValue(mockComment),
    find: jest.fn().mockResolvedValue([mockComment]),
    create: jest.fn().mockResolvedValue(mockComment),
    update: jest.fn().mockResolvedValue(mockComment),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CommentsService,
      {
        provide: CommentRepository,
        useValue: mockCommentRepo,
      },
    ],
  }).compile();
});
```

**AFTER:**

```typescript
beforeEach(async () => {
  const mockCommentRepo = createMockRepository<Comment>();
  jest.spyOn(mockCommentRepo, 'findById').mockResolvedValue(mockComment);
  jest.spyOn(mockCommentRepo, 'find').mockResolvedValue([mockComment]);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CommentsService,
      {
        provide: CommentRepository,
        useValue: mockCommentRepo,
      },
    ],
  }).compile();
});
```

### Pattern 2: Direct Mock Calls

**BEFORE:**

```typescript
it('should create comment', async () => {
  const newComment = { id: 'c1', content: 'new', user_id: 'u1', post_id: 'p1' };
  mockCommentRepo.create.mockResolvedValue(newComment);
  
  const result = await service.createComment(newComment);
  
  expect(mockCommentRepo.create).toHaveBeenCalledWith(newComment);
});
```

**AFTER:**

```typescript
it('should create comment', async () => {
  const newComment = new CommentBuilder()
    .withContent('new')
    .build();
  
  mockCommentRepo.create.mockResolvedValue(newComment);
  
  const result = await service.createComment(newComment);
  
  TypeSafeAssertions.assertMockCalledWithPartial(
    mockCommentRepo.create,
    { content: 'new' },
  );
});
```

## Step 5: Update Service Mocks

### Pattern 1: Controller Tests

**BEFORE:**

```typescript
beforeEach(async () => {
  const mockService = {
    getCommentsByPost: jest.fn(),
    createComment: jest.fn(),
    updateComment: jest.fn(),
  };

  const module: TestingModule = await Test.createTestingModule({
    controllers: [CommentsController],
    providers: [
      {
        provide: CommentsService,
        useValue: mockService,
      },
    ],
  }).compile();
});
```

**AFTER:**

```typescript
beforeEach(async () => {
  const mockService = {
    getCommentsByPost: jest.fn() as jest.MockedFunction<CommentsService['getCommentsByPost']>,
    createComment: jest.fn() as jest.MockedFunction<CommentsService['createComment']>,
    updateComment: jest.fn() as jest.MockedFunction<CommentsService['updateComment']>,
  } as jest.Mocked<CommentsService>;

  const module: TestingModule = await Test.createTestingModule({
    controllers: [CommentsController],
    providers: [
      {
        provide: CommentsService,
        useValue: mockService,
      },
    ],
  }).compile();
});
```

## Step 6: Update Assertions

### Pattern 1: Exact Matches → Partial Matches

**BEFORE:**

```typescript
it('should return comment', async () => {
  mockService.getCommentsByPost.mockResolvedValue([mockComment]);
  
  const result = await controller.getCommentsByPost('post-1');
  
  expect(result).toEqual([mockComment]);
});
```

**AFTER:**

```typescript
it('should return comment', async () => {
  mockService.getCommentsByPost.mockResolvedValue([mockComment]);
  
  const result = await controller.getCommentsByPost('post-1');
  
  expect(result).toHaveLength(1);
  TypeSafeAssertions.assertPartial(result[0], {
    id: mockComment.id,
    content: mockComment.content,
  });
});
```

### Pattern 2: Validate Structure

**BEFORE:**

```typescript
expect(result).toBeDefined();
expect(result.id).toBeDefined();
expect(result.comment).toBeDefined();
```

**AFTER:**

```typescript
TestDataTypeChecker.validateEntity(result, [
  'id',
  'comment',
  'comment_id',
  'user_id',
]);
```

### Pattern 3: Array Validation

**BEFORE:**

```typescript
expect(results).toHaveLength(3);
results.forEach(r => {
  expect(r.id).toBeDefined();
  expect(r.content).toBeDefined();
});
```

**AFTER:**

```typescript
TestDataTypeChecker.validateEntityArray(results, [
  'id',
  'content',
  'user_id',
  'post_id',
]);
```

## Step 7: Add Validation to beforeEach

Optionally add test data validation:

```typescript
beforeEach(async () => {
  // ... module setup ...

  // Validate test data structure
  TestDataTypeChecker.validateEntity(mockComment, [
    'id',
    'content',
    'user_id',
    'post_id',
    'hidden_at',
    'post',
    'user',
    'replies',
  ]);
});
```

## Complete Example: Before and After

### BEFORE (Type Errors, Incomplete Data)

```typescript
describe('CommentsController', () => {
  let controller: CommentsController;
  let service: CommentsService;

  beforeEach(async () => {
    // Incomplete mock data
    const mockComment = {
      id: 'comment-1',
      content: 'Test comment',
      user_id: 'user-1',
      // Missing: post_id, hidden_at, post, user, replies
    };

    // Type-unsafe mock
    const mockService = {
      getCommentsByPost: jest.fn().mockResolvedValue([mockComment]),
      createComment: jest.fn(),
      updateComment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [
        {
          provide: CommentsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get(CommentsController);
    service = module.get(CommentsService);
  });

  it('should get comments', async () => {
    const result = await controller.getCommentsByPost('post-1');

    expect(result).toEqual([mockComment]); // May silently miss fields
    expect(result[0].id).toBeDefined();
  });

  it('should create comment', async () => {
    const createDto = {
      content: 'New comment',
      post_id: 'post-1',
    };

    await controller.createComment(createDto);

    expect(service.createComment).toHaveBeenCalled(); // Loose check
  });
});
```

### AFTER (Type-Safe, Complete Data)

```typescript
import { CommentBuilder, TestDataFactory } from '../testing/test-builders';
import { TypeSafeAssertions, createMockRepository } from '../testing/mock-factory';
import { TestDataTypeChecker } from '../testing/type-safety-config';

describe('CommentsController', () => {
  let controller: CommentsController;
  let mockService: jest.Mocked<CommentsService>;
  let mockComment: any;

  beforeEach(async () => {
    // Complete, type-safe mock data
    mockComment = new CommentBuilder()
      .withId('comment-1')
      .withContent('Test comment')
      .withUserId('user-1')
      .withPostId('post-1')
      .build();

    // Validate structure before tests run
    TestDataTypeChecker.validateEntity(mockComment, [
      'id',
      'content',
      'user_id',
      'post_id',
      'hidden_at',
      'post',
      'user',
      'replies',
    ]);

    // Type-safe mock service
    mockService = {
      getCommentsByPost: jest.fn() as jest.MockedFunction<CommentsService['getCommentsByPost']>,
      createComment: jest.fn() as jest.MockedFunction<CommentsService['createComment']>,
      updateComment: jest.fn() as jest.MockedFunction<CommentsService['updateComment']>,
    } as jest.Mocked<CommentsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [
        {
          provide: CommentsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get(CommentsController);
  });

  it('should get comments with full type safety', async () => {
    mockService.getCommentsByPost.mockResolvedValue([mockComment]);

    const result = await controller.getCommentsByPost('post-1');

    expect(result).toHaveLength(1);
    TypeSafeAssertions.assertPartial(result[0], {
      id: 'comment-1',
      content: 'Test comment',
    });
  });

  it('should create comment with validation', async () => {
    const createDto = new CommentBuilder()
      .withContent('New comment')
      .withPostId('post-1')
      .build();

    mockService.createComment.mockResolvedValue(createDto);

    await controller.createComment(createDto);

    TypeSafeAssertions.assertMockCalledWithPartial(
      mockService.createComment,
      { content: 'New comment', post_id: 'post-1' },
    );
  });
});
```

## Checklist for Migration

- [ ] Import builders, factories, validators
- [ ] Replace all `any` types
- [ ] Convert mock data to builders
- [ ] Update nested objects to use builders
- [ ] Replace array mocks with builder loops
- [ ] Use `createMockRepository` for repos
- [ ] Type mock services properly
- [ ] Replace mock calls with TypeSafeAssertions
- [ ] Add structure validation
- [ ] Run tests to verify still passing
- [ ] Update assertions for better coverage

## Running the Migration

```bash
# 1. Update one test file (e.g., comments.controller.spec.ts)
# 2. Run that test
pnpm nx run cosmic-horizons-api:test -- comments.controller.spec.ts

# 3. Verify all tests pass
pnpm nx run cosmic-horizons-api:test

# 4. Check coverage
pnpm nx run cosmic-horizons-api:test -- --coverage

# 5. Move to next test file
```

## Troubleshooting

### "Cannot find module"

Ensure imports are correct:

```typescript
import { CommentBuilder } from '../testing/test-builders'; // Adjust path
```

### "Property ... does not exist"

Builder is missing required fields. Check what the entity needs:

```typescript
// Get list of required fields for entity
TestDataTypeChecker.validateEntity(yourObject, ['id', 'whatElse?']);
```

### Tests still have `any` types

Use TypeScript strict mode to catch these:

```json
{
  "compilerOptions": {
    "noImplicitAny": true
  }
}
```

### Mock returns don't match expected type

Rebuild with proper type annotation:

```typescript
mockService.getItems.mockResolvedValue(
  Array.from({ length: 3 }, (_, i) =>
    new ItemBuilder().withId(`item-${i}`).build(),
  ),
);
```
