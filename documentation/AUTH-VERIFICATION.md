# User Verification & Authentication

## Overview

VLASS Portal has a **user verification tier system** that gates access to FITS, community posting, and higher rate limits.

Users progress through states: **ANON** → **UNVERIFIED** → **VERIFIED** (or mod/admin roles).

---

## Part 1: User States & Verification

### States

```text
ANONYMOUS (unauthenticated)
  ├─ No session
  ├─ Rate limited: 100 req/min
  └─ No FITS, no posting

LOGIN (creates session)
  ↓
SESSION (unverified)
  ├─ JWT token issued
  ├─ Email unconfirmed
  ├─ user.verified = false
  ├─ Rate limite: 500 req/min
  └─ No FITS, no posting

VERIFY EMAIL (user clicks link)
  ↓
VERIFIED
  ├─ user.verified = true
  ├─ Rate limit: 2000 req/min
  ├─ FITS quota: 10 GB/day
  ├─ Can post/comment
  └─ Can request curated tags

POWER / MOD / ADMIN (role assignment)
  ├─ Admin-assigned only
  ├─ Higher quotas
  └─ Moderation powers
```

### Verification Email

```text
Subject: Verify your VLASS Portal email

Hi {username},

Confirm your email to unlock community posting, FITS access, and higher rate limits.

[Button: Verify Email] ← https://portal.vlass.example.com/auth/verify?token={verification_token}

This link expires in 24 hours.

...
```

**Token format:**

```text
verification_token = base64(
  JWT {
    sub: user_id,
    email: user.email,
    purpose: "email_verification",
    exp: now + 24h,
    iat: now
  }
)
```

Signed with secret key (not user's JWT key).

---

## Part 2: Email Verification Flow

### Signup → Verification

```typescript
// apps/vlass-api/src/app/auth/auth.service.ts

@Post("auth/register")
async register(
  @Body() dto: RegisterDto
): Promise<{ userId: string; message: string }> {
  const { username, email, password } = dto;

  // Validation
  if (!email.match(EMAIL_REGEX)) {
    throw new BadRequestException("Invalid email");
  }

  if (await this.db.user.findUnique({ where: { email } })) {
    throw new ConflictException("Email already registered");
  }

  // Create user (unverified)
  const user = await this.db.user.create({
    data: {
      id: uuid(),
      username,
      email,
      password_hash: await bcrypt.hash(password, 12),
      email_verified: false,
      email_verified_at: null,
      created_at: new Date(),
    },
  });

  // Generate verification token
  const verificationToken = this.auth.generateVerificationToken(user);

  // Send email (async, fire-and-forget)
  await this.email.queue("send_verification_email", {
    userId: user.id,
    email: user.email,
    token: verificationToken,
  });

  // Audit
  await this.audit.log({
    action: "USER_REGISTERED",
    actor_id: user.id,
    details: { email: maskEmail(user.email) },
    timestamp: new Date(),
  });

  // Issue temporary JWT (unverified, limited permissions)
  const jwt = this.auth.signToken(user, { verified: false });

  return {
    userId: user.id,
    message: "Registration successful. Check your email to verify.",
    jwt,  // client stores for future requests
  };
}

@Post("auth/verify-email")
async verifyEmail(
  @Body() dto: { token: string }
): Promise<{ verified: true }> {
  const token = dto.token;

  // Decode & validate
  const payload = this.auth.verifyVerificationToken(token);
  if (!payload || payload.purpose !== "email_verification") {
    throw new BadRequestException("Invalid or expired token");
  }

  const user = await this.db.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user) {
    throw new NotFoundException("User not found");
  }

  if (user.email_verified) {
    return { verified: true };  // Already verified
  }

  // Mark verified
  await this.db.user.update({
    where: { id: user.id },
    data: {
      email_verified: true,
      email_verified_at: new Date(),
    },
  });

  // Audit
  await this.audit.log({
    action: "USER_EMAIL_VERIFIED",
    actor_id: user.id,
    timestamp: new Date(),
  });

  return { verified: true };
}
```

### Resend Verification Email

```typescript
@Post("auth/resend-verification")
@UseGuards(JwtGuard)
async resendVerification(
  @Request() req
): Promise<{ message: string }> {
  const user = req.user;

  if (user.email_verified) {
    return { message: "Email already verified" };
  }

  // Rate limit: max 3 resends per hour
  const recent = await this.db.verification_request.count({
    where: {
      user_id: user.id,
      created_at: { gt: new Date(Date.now() - 3600000) },
    },
  });

  if (recent >= 3) {
    throw new TooManyRequestsException(
      "Too many resend requests; try again in 1 hour"
    );
  }

  // Generate new token
  const token = this.auth.generateVerificationToken(user);

  // Send email
  await this.email.queue("send_verification_email", {
    userId: user.id,
    email: user.email,
    token,
  });

  // Log request
  await this.db.verification_request.create({
    data: {
      id: uuid(),
      user_id: user.id,
      created_at: new Date(),
    },
  });

  return { message: "Verification email sent" };
}
```

---

## Part 3: JWT Token Structure

### Token Payload (at verification)

```json
{
  "sub": "user_123",
  "username": "alice",
  "email": "alice@example.com",
  "email_verified": true,
  "role": "USER", // USER | POWER | MOD | ADMIN
  "iat": 1707264000,
  "exp": 1707350400, // 24 hours
  "iss": "vlass-api"
}
```

### Token Issuing

```typescript
signToken(user: User, options?: any): string {
  const payload = {
    sub: user.id,
    username: user.username,
    email: user.email,
    email_verified: user.email_verified,
    role: user.role || "USER",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,  // 24h
    iss: "vlass-api",
  };

  return jwt.sign(payload, this.secretKey, { algorithm: "HS256" });
}
```

---

## Part 4: Rate Limit Mapping

| Tier           | Condition               | RPM       | FITS Daily | Posting | FITS |
| -------------- | ----------------------- | --------- | ---------- | ------- | ---- |
| **ANON**       | No auth                 | 100       | 0          | ❌      | ❌   |
| **UNVERIFIED** | Auth, `!email_verified` | 500       | 0          | ❌      | ❌   |
| **VERIFIED**   | Auth, `email_verified`  | 2000      | 10 GB      | ✅      | ✅   |
| **POWER**      | `role == POWER`         | 5000      | 100 GB     | ✅      | ✅   |
| **MOD**        | `role == MOD`           | 5000      | 100 GB     | ✅      | ✅   |
| **ADMIN**      | `role == ADMIN`         | unlimited | unlimited  | ✅      | ✅   |

**Applied at Guard layer:**

```typescript
// apps/vlass-api/src/app/guards/rate-limit.guard.ts

@Injectable()
export class RateLimitGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // From JWT or undefined

    let tier = 'ANON';
    if (user) {
      if (user.email_verified) {
        tier =
          user.role === 'ADMIN'
            ? 'ADMIN'
            : user.role === 'MOD'
              ? 'MOD'
              : user.role === 'POWER'
                ? 'POWER'
                : 'VERIFIED';
      } else {
        tier = 'UNVERIFIED';
      }
    }

    const limits = RATE_LIMITS[tier];
    const key = `ratelimit:${user?.id || request.ip}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, 60);
    }

    if (current > limits.rpm) {
      throw new TooManyRequestsException(
        `Rate limit exceeded: ${limits.rpm}/min for tier ${tier}`,
      );
    }

    return true;
  }
}
```

---

## Part 5: Admin Verification Override

Admins can manually verify users:

```typescript
@Patch("admin/users/:userId/verify")
@UseGuards(JwtGuard, RolesGuard("ADMIN"))
async adminVerifyUser(
  @Param("userId") userId: string
): Promise<UserDto> {
  const user = await this.db.user.update({
    where: { id: userId },
    data: {
      email_verified: true,
      email_verified_at: new Date(),
    },
  });

  // Audit
  await this.audit.log({
    action: "USER_VERIFIED_BY_ADMIN",
    actor_id: req.user.id,
    actor_role: "ADMIN",
    resource: { userId },
    timestamp: new Date(),
  });

  return toDto(user);
}
```

---

## Part 6: Grace Period & Unverified Limits

### Option A: No grace period

- User must verify immediately to unlock features
- Can still browse/read (low tier)

### Option B: Grace period (recommended)

- Unverified user gets 7 days to verify
- Full VERIFIED quotas during grace period
- After 7 days: drop to UNVERIFIED quotas until verified

```typescript
// Determine effective tier
function getEffectiveTier(user: User): Tier {
  if (user.email_verified) return 'VERIFIED';

  // Grace period: 7 days from signup
  const daysSinceSignup = Math.floor(
    (Date.now() - user.created_at.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (daysSinceSignup < 7) {
    return 'VERIFIED_GRACE'; // Temporary full access
  }

  return 'UNVERIFIED'; // Back to limited tier
}
```

**Email reminder at day 6:**

```typescript
@Cron("0 9 * * *")  // 9 AM UTC daily
async sendVerificationReminders() {
  const almostExpired = await db.user.findMany({
    where: {
      email_verified: false,
      created_at: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),  // Last 7 days
        lt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),   // But before 6 days
      },
    },
  });

  for (const user of almostExpired) {
    const token = this.auth.generateVerificationToken(user);
    await this.email.queue("send_final_verification_reminder", {
      userId: user.id,
      email: user.email,
      token,
    });
  }
}
```

---

## Part 7: Testing

```typescript
// apps/vlass-api-e2e/src/auth-verification.spec.ts

describe("Email Verification", () => {
  it("should register unverified user with limited access", async () => {
    const res = await request
      .post("/auth/register")
      .send({
        username: "alice",
        email: "alice@example.com",
        password: "SecurePass123!",
      });

    expect(res.status).toBe(201);
    expect(res.body.jwt).toBeDefined();

    // Test with JWT: should hit unverified rate limits
    let count = 0;
    for (let i = 0; i < 600; i++) {  // 500 + 100 buffer
      const r = await request
        .get("/api/v1/posts")
        .set("Authorization", `Bearer ${res.body.jwt}`);

      if (r.status === 429) {
        count++;
        expect(count).toBe(1);  // First 429 at request 501
        break;
      }
    }

    expect(count).toBe(1);
  });

  it("should unlock features after email verification", async () => {
    // 1. Register user
    const registerRes = await request.post("/auth/register").send({ ... });
    const { jwt } = registerRes.body;

    // 2. Extract token from email (mock)
    const emailQueue = mockEmailService.getQueue();
    const emailEvent = emailQueue.find(e => e.type === "send_verification_email");
    const verificationToken = emailEvent.data.token;

    // 3. Verify email
    const verifyRes = await request
      .post("/auth/verify-email")
      .send({ token: verificationToken });

    expect(verifyRes.status).toBe(200);

    // 4. Try posting (should now work)
    const postRes = await request
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${jwt}`)
      .send({ title: "Test", markdown: "Content" });

    expect(postRes.status).toBe(201);  // Not 403
  });

  it("should deny FITS access to unverified", async () => {
    const unverified = await createUnverifiedUser();

    const res = await request
      .post("/api/v1/fits/download")
      .set("Authorization", `Bearer ${unverified.jwt}`)
      .send({ epoch: "ql_rms" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Verify email first");
  });

  it("should allow verified user FITS access", async () => {
    const verified = await createVerifiedUser();

    const res = await request
      .post("/api/v1/fits/download")
      .set("Authorization", `Bearer ${verified.jwt}`)
      .send({ epoch: "ql_rms", ra: 206.3, dec: 35.87 });

    expect(res.status).toBe(200);  // Or 206 if streaming
  });

  it("should enforce grace period", async () => {
    const user = await createUserWithSignupDate(
      new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)  // 5 days ago
    );

    // Should still have full access (within grace)
    const postRes = await request
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${user.jwt}`)
      .send({ ... });

    expect(postRes.status).toBe(201);
  });

  it("should deny posting after grace period if not verified", async () => {
    const user = await createUserWithSignupDate(
      new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)  // 8 days ago
    );

    const postRes = await request
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${user.jwt}`)
      .send({ ... });

    expect(postRes.status).toBe(403);
    expect(postRes.body.error).toContain("Verify email");
  });
});
```

---

**Last Updated:** 2026-02-06  
**Status:** NORMATIVE  
**Related:** RATE-LIMITING.md, AUTHENTICATION.md, DATA-RETENTION-DELETION.md
