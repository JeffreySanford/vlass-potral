# API Versioning Strategy

## Approach: URL Path Versioning

We use **URL path versioning** (`/api/v1/`, `/api/v2/`) with gradual deprecation.

---

## Structure

```text
/api/v1
  /community/posts
  /tap-search
  /users

/api/v2
  /community/posts    (enhanced response)
  /tap-search         (new filters)
  /users

/api/v3 (future)
  ...
```

---

## NestJS Implementation

### Module Setup

```typescript
// apps/vlass-api/src/app/api/api.module.ts

import { Module } from '@nestjs/common';
import { CommunityModule } from '../community/community.module';
import { TapModule } from '../tap/tap.module';

@Module({
  imports: [
    CommunityModule.forVersion('v1'),
    CommunityModule.forVersion('v2'),
    TapModule.forVersion('v1'),
    TapModule.forVersion('v2'),
  ],
})
export class ApiModule {}
```

### Dynamic Version Controller

```typescript
// apps/vlass-api/src/app/community/community.controller.ts

import { Controller, Get, Post, Param, Body, Version } from '@nestjs/common';

@Controller('community')
@ApiTags('community')
export class CommunityController {
  constructor(private community: CommunityService) {}

  // Available in v1, v2, v3
  @Version('1', '2', '3')
  @Get('posts/:id')
  async getPost(@Param('id') id: string): Promise<PostDtoV1> {
    return this.community.getPostV1(id);
  }

  // Only in v2, v3 (enhanced response)
  @Version('2', '3')
  @Post('posts')
  async createPost(@Body() dto: CreatePostDtoV2): Promise<PostDtoV2> {
    return this.community.createPostV2(dto);
  }

  // New endpoint in v3 only
  @Version('3')
  @Get('posts/:id/analytics')
  async getPostAnalytics(@Param('id') id: string): Promise<AnalyticsDto> {
    return this.community.getAnalytics(id);
  }
}
```

### DTOs by Version

```typescript
// apps/vlass-api/src/app/community/dto/post.dto.ts

// V1: Basic response
export interface PostDtoV1 {
  id: string;
  title: string;
  author: { id: string; username: string };
  createdAt: string;
}

// V2: Added fields
export interface PostDtoV2 extends PostDtoV1 {
  content: string;
  tags: string[];
  likeCount: number;
  flagCount: number;
}

// V3: Flattened author
export interface PostDtoV3 {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorUsername: string;
  createdAt: string;
  tags: string[];
  engagement: {
    likes: number;
    flags: number;
  };
}
```

---

## Automatic DTO Conversion

```typescript
// apps/vlass-api/src/app/shared/pipes/version.pipe.ts

import { Injectable, PipeTransform } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class VersionPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata): any {
    const version = this.extractVersion(metadata.context);
    return this.transformByVersion(value, version);
  }

  private extractVersion(context: ExecutionContext): string {
    const request: Request = context.switchToHttp().getRequest();
    return request.version || 'v1';
  }

  private transformByVersion(obj: PostDtoV3, version: string): any {
    if (version === 'v1') {
      return {
        id: obj.id,
        title: obj.title,
        author: {
          id: obj.authorId,
          username: obj.authorUsername,
        },
        createdAt: obj.createdAt,
      } as PostDtoV1;
    }

    if (version === 'v2') {
      return {
        ...obj,
        author: {
          id: obj.authorId,
          username: obj.authorUsername,
        },
        likeCount: obj.engagement.likes,
        flagCount: obj.engagement.flags,
      } as PostDtoV2;
    }

    return obj as PostDtoV3; // v3
  }
}
```

---

## Deprecation Strategy

### Phase 1: Announce (6 months)

```typescript
// Warn in response headers
@Get("posts")
async getPosts(): Promise<PostDtoV1[]> {
  // Add deprecation header
  this.response.header(
    "Deprecation",
    "true"
  );
  this.response.header(
    "Sunset",
    new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toUTCString()
  );
  this.response.header(
    "Link",
    '</api/v2/posts>; rel="successor-version"'
  );

  return this.community.getPosts();
}
```

**Client Response:**

```text
HTTP/1.1 200 OK

Deprecation: true
Sunset: Wed, 06 Aug 2026 00:00:00 GMT
Link: </api/v2/posts>; rel="successor-version"
```

### Phase 2: Enforce (3 months)

```typescript
// Return 410 Gone or 301 Redirect

@Get("posts")
async getPosts(): Promise<PostDtoV1[]> {
  this.response.status(301);
  this.response.header("Location", "/api/v2/posts");
  return;
}

// Or on v1 controller, remove @Version("1") decorator
// This removes the route entirely
```

### Phase 3: Remove

Remove code entirely from repository.

---

## Client Migration Guide

### Detect Version Support

```typescript
// apps/vlass-web/src/app/core/api.service.ts

async checkVersionSupport(): Promise<string> {
  try {
    const res = await http.head("/api/v3/status");
    return "v3";
  } catch {
    try {
      const res = await http.head("/api/v2/status");
      return "v2";
    } catch {
      return "v1";
    }
  }
}
```

### Auto-Upgrade

```typescript
// When v1 is deprecated, redirect all traffic
if (requestedVersion === 'v1') {
  return http.get('/api/v2/posts'); // Auto-upgrade
}
```

---

## Testing by Version

```typescript
// apps/vlass-api-e2e/src/versioning.spec.ts

describe('API Versioning', () => {
  it('v1 should return basic post DTO', async () => {
    const res = await request.get('/api/v1/community/posts/p_1');
    expect(res.body).toEqual({
      id: 'p_1',
      title: '...',
      author: { id: 'u_1', username: '...' },
      createdAt: '...',
    });
  });

  it('v2 should return enhanced post DTO', async () => {
    const res = await request.get('/api/v2/community/posts/p_1');
    expect(res.body).toHaveProperty('content');
    expect(res.body).toHaveProperty('tags');
    expect(res.body).toHaveProperty('likeCount');
  });

  it('v3 should return flattened post DTO', async () => {
    const res = await request.get('/api/v3/community/posts/p_1');
    expect(res.body).toHaveProperty('authorId');
    expect(res.body.engagement).toEqual({
      likes: expect.any(Number),
      flags: expect.any(Number),
    });
  });

  it('v1 with deprecation header should warn in 6-month window', async () => {
    const res = await request.get('/api/v1/community/posts');
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBeDefined();
  });

  it('should auto-upgrade v1 to v2 after deprecation', async () => {
    const res = await request.get('/api/v1/community/posts');
    expect(res.status).toBe(301);
    expect(res.headers.location).toContain('/api/v2');
  });
});
```

---

## Breaking Changes Flowchart

```text
Change Planned
  ↓
v2 Released (new version coexists)
  ↓
v1 Deprecated (header warnings, 6 months)
  ↓
v1 Auto-Redirects (301 to v2, 3 months)
  ↓
v1 Removed (code cleaned up)
```

---

**Last Updated:** 2026-02-06

**Key:** URL path versioning. Announce → Enforce → Remove.
