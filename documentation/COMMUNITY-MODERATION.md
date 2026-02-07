# Community Moderation & Content Safety

## Philosophy

- **Public read, verified write:** Anyone can read posts/comments; only verified users can create
- **Reactive (not pre-approval):** Community posts publish immediately; flagging + moderation is reactive
- **Transparent actions:** Users see why content was removed
- **Audit everything:** Every moderation action is logged

---

## Content Model

### Posts

```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,  -- Markdown
  viewer_snapshot JSONB NULL,  -- Embedded viewer state

  is_published BOOLEAN DEFAULT FALSE,  -- ONLY verified authors can publish
  published_at TIMESTAMP NULL,

  is_flagged BOOLEAN DEFAULT FALSE,     -- Community flag
  flag_reason VARCHAR(255) NULL,

  is_approved BOOLEAN DEFAULT FALSE,    -- MOD approval (only for flagged posts)
  is_removed BOOLEAN DEFAULT FALSE,      -- ADMIN removal

  tags JSONB,  -- Curated (tag.is_approved = true only)
  view_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL  -- Soft delete
);
```

**State Flow:**

```text
DRAFT (is_published=false)
  ↓ [Verified author clicks Publish]
PUBLISHED (is_published=true, is_flagged=false, is_approved=false)
  ↓ [User flags OR Moderator flags manually]
FLAGGED (is_flagged=true)
  ↓ [Moderator reviews + decides]
  ├→ APPROVED (keep visible, is_approved=true, is_flagged=true)
  └→ REMOVED (hide from public, is_removed=true)
```

### Comments

```sql
CREATE TABLE comments (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),

  body TEXT NOT NULL,  -- Markdown

  is_flagged BOOLEAN DEFAULT FALSE,
  is_removed BOOLEAN DEFAULT FALSE,
  removal_reason VARCHAR(255) NULL,

  like_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);
```

**State:**

```text
VISIBLE (is_flagged=false, is_removed=false)
  ↓ [Community flags or MOD acts]
FLAGGED / REMOVED (is_removed=true)
```

---

## Creation Rules

```typescript
// POST /api/v1/community/posts

export interface CreatePostRequest {
  title: string;        // 3-300 chars
  body: string;         // Markdown, >= 10 chars
  tags: string[];       // Refs to tag.name (must exist + be approved)
  viewerSnapshot?: {    // Optional; references viewer state at time of post
    mode: "ALADIN" | "CANVAS";
    center: { raDeg: number; decDeg: number };
    fovDeg: number;
    epoch: string;
    previewPng?: string;  // Data URL or S3 key
  };
}

@Post("posts")
@UseGuards(AuthGuard, VerifiedGuard)  // Only verified + authenticated
async createPost(
  @Body() dto: CreatePostRequest,
  @Request() req: RequestWithUser
): Promise<PostDTO> {
  // 1. Validate
  if (dto.title.length < 3) throw new BadRequestException("Title too short");
  if (dto.body.length < 10) throw new BadRequestException("Body too short");

  // 2. Verify all tags exist + are approved
  const tags = await this.tagRepository.find({ name: In(dto.tags) });
  if (tags.length !== dto.tags.length) {
    throw new BadRequestException("One or more tags not found or not approved");
  }

  // 3. Validate Markdown
  const parsed = marked.parse(dto.body);
  if (!parsed) throw new BadRequestException("Invalid Markdown");

  // 4. Create post (unpublished)
  const post = await this.postRepository.save({
    author_id: req.user.id,
    title: dto.title,
    body: dto.body,
    viewer_snapshot: dto.viewerSnapshot,
    tags: dto.tags.map((t) => ({ name: t })),
    is_published: true,  // Publish immediately (no pre-mod)
    published_at: new Date(),
    is_flagged: false,
  });

  // 5. Audit
  await this.audit.log({
    action: "POST_CREATE",
    actor: req.user.id,
    target_resource: `post/${post.id}`,
    status: "SUCCESS",
  });

  return mapToDTO(post);
}
```

---

## Moderation Panel

### Admin Routes

```typescript
// GET /api/v1/admin/posts/flagged
// List all flagged posts (MODERATOR+ access)

export interface FlaggedPostsQuery {
  limit: number;     // Default 20
  offset: number;    // Default 0
  sortBy: "flagged_at" | "likes" | "flags";
}

// PATCH /api/v1/admin/posts/:id/approve
// Mark post as reviewed + OK to stay visible

@Patch(":id/approve")
@UseGuards(AuthGuard, RbacGuard)
@RequireRole("MODERATOR")
async approvePost(
  @Param("id") postId: string,
  @Body() dto: { reason: string },  // Optional mod note
  @Request() req: RequestWithUser
): Promise<void> {
  const post = await this.postRepository.findOne(postId);
  if (!post) throw new NotFoundException();

  post.is_flagged = false;
  post.is_approved = true;
  await this.postRepository.save(post);

  await this.audit.log({
    action: "MOD_APPROVE_POST",
    actor: req.user.id,
    target_resource: `post/${postId}`,
    details: dto.reason,
    status: "SUCCESS",
  });
}

// PATCH /api/v1/admin/posts/:id/remove
// Hide post from public view

@Patch(":id/remove")
@UseGuards(AuthGuard, RbacGuard)
@RequireRole("MODERATOR")
async removePost(
  @Param("id") postId: string,
  @Body() dto: { reason: "SPAM" | "ABUSIVE" | "MISINFORMATION" | "OTHER" },
  @Request() req: RequestWithUser
): Promise<void> {
  const post = await this.postRepository.findOne(postId);
  if (!post) throw new NotFoundException();

  post.is_removed = true;
  post.is_flagged = false;
  await this.postRepository.save(post);

  // Audit
  await this.audit.log({
    action: "MOD_REMOVE_POST",
    actor: req.user.id,
    target_resource: `post/${postId}`,
    details: dto.reason,
    status: "SUCCESS",
  });

  // Notify author
  await this.notification.sendToUser(post.author_id, {
    kind: "POST_REMOVED",
    postId,
    reason: dto.reason,
    message:
      "Your post was removed for violating community guidelines. Appeal at support@vlassportal.example.com",
  });
}
```

---

## Community Flagging

### User Flag Action

```typescript
// POST /api/v1/community/posts/:id/flag

export interface FlagPostRequest {
  reason: "SPAM" | "ABUSIVE" | "MISINFORMATION" | "OTHER";
  details?: string;  // Optional freeform description
}

@Post(":id/flag")
@UseGuards(AuthGuard)  // Any authenticated user
async flagPost(
  @Param("id") postId: string,
  @Body() dto: FlagPostRequest,
  @Request() req: RequestWithUser
): Promise<void> {
  const post = await this.postRepository.findOne(postId);
  if (!post) throw new NotFoundException();

  // 1. Update post
  post.is_flagged = true;
  post.flag_reason = dto.reason;
  await this.postRepository.save(post);

  // 2. Log flag action
  const flag = await this.flagRepository.save({
    post_id: postId,
    flagger_id: req.user.id,  // Who reported
    reason: dto.reason,
    details: dto.details,
    created_at: new Date(),
  });

  // 3. Audit
  await this.audit.log({
    action: "POST_FLAG",
    actor: req.user.id,
    target_resource: `post/${postId}`,
    details: `Reason: ${dto.reason}`,
    status: "SUCCESS",
  });

  // 4. Notify mods
  await this.notification.notifyMods({
    kind: "POST_FLAGGED",
    postId,
    flagReason: dto.reason,
    flagCount: await this.flagRepository.count({ post_id: postId }),
  });
}
```

---

## Comment Moderation

Comments are **simpler**: no pre-mod, but remove/hide on flag.

```typescript
// POST /api/v1/community/posts/:postId/comments

export interface CreateCommentRequest {
  body: string;  // Markdown, >= 3 chars
}

@Post(":postId/comments")
@UseGuards(AuthGuard, VerifiedGuard)
async createComment(
  @Param("postId") postId: string,
  @Body() dto: CreateCommentRequest,
  @Request() req: RequestWithUser
): Promise<CommentDTO> {
  const post = await this.postRepository.findOne(postId);
  if (!post) throw new NotFoundException("Post not found");

  if (dto.body.length < 3) throw new BadRequestException("Comment too short");

  const comment = await this.commentRepository.save({
    post_id: postId,
    author_id: req.user.id,
    body: dto.body,
    is_flagged: false,
    is_removed: false,
    created_at: new Date(),
  });

  // Increment post comment count
  post.comment_count += 1;
  await this.postRepository.save(post);

  // Audit
  await this.audit.log({
    action: "COMMENT_CREATE",
    actor: req.user.id,
    target_resource: `comment/${comment.id}`,
    status: "SUCCESS",
  });

  return mapToDTO(comment);
}

// PATCH /api/v1/community/comments/:id/flag
@Patch(":id/flag")
@UseGuards(AuthGuard)
async flagComment(
  @Param("id") commentId: string,
  @Body() dto: { reason: string },
  @Request() req: RequestWithUser
): Promise<void> {
  const comment = await this.commentRepository.findOne(commentId);
  if (!comment) throw new NotFoundException();

  comment.is_flagged = true;
  await this.commentRepository.save(comment);

  await this.audit.log({
    action: "COMMENT_FLAG",
    actor: req.user.id,
    target_resource: `comment/${commentId}`,
    status: "SUCCESS",
  });
}

// PATCH /api/v1/admin/comments/:id/remove
@Patch(":id/remove")
@UseGuards(AuthGuard, RbacGuard)
@RequireRole("MODERATOR")
async removeComment(
  @Param("id") commentId: string,
  @Body() dto: { reason: string },
  @Request() req: RequestWithUser
): Promise<void> {
  const comment = await this.commentRepository.findOne(commentId);
  if (!comment) throw new NotFoundException();

  comment.is_removed = true;
  await this.commentRepository.save(comment);

  // Decrement comment count
  const post = await this.postRepository.findOne(comment.post_id);
  post.comment_count = Math.max(0, post.comment_count - 1);
  await this.postRepository.save(post);

  await this.audit.log({
    action: "MOD_REMOVE_COMMENT",
    actor: req.user.id,
    target_resource: `comment/${commentId}`,
    status: "SUCCESS",
  });
}
```

---

## Curated Tags

Tags are **approved only**:

```typescript
// POST /api/v1/community/tags/propose (POWER + users)
export interface ProposeTagRequest {
  name: string;        // e.g., "AGN", "Supernova"
  description: string; // What this tag means
  category: string;    // "SURVEY" | "OBJECT_TYPE" | "TOPIC"
}

@Post("propose")
@UseGuards(AuthGuard, VerifiedGuard)
async proposeTag(
  @Body() dto: ProposeTagRequest
): Promise<TagDTO> {
  // Only POWER+ users can propose
  if (!req.user.roles.includes("POWER")) {
    throw new ForbiddenException("Only POWER users can propose tags");
  }

  const tag = await this.tagRepository.save({
    name: dto.name,
    description: dto.description,
    category: dto.category,
    proposed_by_id: req.user.id,
    is_approved: false,  // Pending mod approval
  });

  return mapToDTO(tag);
}

// PATCH /api/v1/admin/tags/:id/approve (MODERATOR+)
@Patch(":id/approve")
@UseGuards(AuthGuard, RbacGuard)
@RequireRole("MODERATOR")
async approveTag(
  @Param("id") tagId: number,
  @Request() req: RequestWithUser
): Promise<TagDTO> {
  const tag = await this.tagRepository.findOne(tagId);
  if (!tag) throw new NotFoundException();

  tag.is_approved = true;
  tag.approved_by_id = req.user.id;
  await this.tagRepository.save(tag);

  return mapToDTO(tag);
}
```

---

## Moderation Dashboard

Admin panel shows:

1. **Flagged Posts Queue:** Sorted by flag count, age
2. **Flagged Comments:** Newest first
3. **Tag Proposals:** Pending approval
4. **Banned Users:** List with ban reason + date
5. **Audit Log:** Filterable by action, actor, date

---

## Ban System

```typescript
// POST /api/v1/admin/users/:id/ban (ADMIN only)

@Post(":id/ban")
@UseGuards(AuthGuard, RbacGuard)
@RequireRole("ADMIN")
async banUser(
  @Param("id") userId: string,
  @Body() dto: { reason: string; duration?: string },  // Duration = "permanent" | "30d"
  @Request() req: RequestWithUser
): Promise<void> {
  const user = await this.userRepository.findOne(userId);
  if (!user) throw new NotFoundException();

  user.is_banned = true;
  user.ban_reason = dto.reason;
  user.ban_created_at = new Date();

  if (dto.duration && dto.duration !== "permanent") {
    const days = parseInt(dto.duration);
    user.ban_expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  await this.userRepository.save(user);

  await this.audit.log({
    action: "ADMIN_BAN_USER",
    actor: req.user.id,
    target_resource: `user/${userId}`,
    details: dto.reason,
    status: "SUCCESS",
  });
}

// Login guard checks ban
@Post("login")
async login(@Body() dto: LoginRequest): Promise<LoginResponse> {
  const user = await this.userRepository.findOne({ email: dto.email });
  if (!user) throw new UnauthorizedException();

  if (user.is_banned) {
    const msg = user.ban_expires_at
      ? `You are banned until ${user.ban_expires_at}. Reason: ${user.ban_reason}`
      : `You are permanently banned. Reason: ${user.ban_reason}`;
    throw new ForbiddenException(msg);
  }

  // ... continue login
}
```

---

## Tests

```typescript
// apps/vlass-api-e2e/src/moderation.spec.ts

describe('Moderation', () => {
  it('should flag post as user', async ({ request }) => {
    const { postId } = await createTestPost();

    const response = await request.patch(
      `http://localhost:3333/community/posts/${postId}/flag`,
      {
        data: { reason: 'SPAM' },
      },
    );

    expect(response.ok()).toBe(true);
  });

  it('should only MOD+ approve flagged posts', async ({ request }) => {
    const { postId } = await createTestPost();
    await flagPost(postId);

    // Regular user tries to approve
    const regularResponse = await request.patch(
      `http://localhost:3333/admin/posts/${postId}/approve`,
      { headers: { Authorization: `Bearer ${userToken}` } },
    );
    expect(regularResponse.status()).toBe(403);

    // MOD approves
    const modResponse = await request.patch(
      `http://localhost:3333/admin/posts/${postId}/approve`,
      { headers: { Authorization: `Bearer ${modToken}` } },
    );
    expect(modResponse.ok()).toBe(true);
  });

  it('should prevent banned users from posting', async ({ request }) => {
    const userId = 'test-user-id';
    const token = await generateToken(userId);

    // Ban user
    await request.post(`http://localhost:3333/admin/users/${userId}/ban`, {
      data: { reason: 'Spam', duration: 'permanent' },
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Try to create post
    const response = await request.post(
      'http://localhost:3333/community/posts',
      {
        data: { title: 'Test', body: 'Content' },
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    expect(response.status()).toBe(403);
  });
});
```

---

**Last Updated:** 2026-02-06

**Key Reminders:**

1. **Immediate publish, reactive moderation.** No pre-approval queue.
2. **Transparency.** Users see why content was removed.
3. **Audit everything.** Every mod action is logged.
4. **Only verified users write.** Anon can read + flag.
