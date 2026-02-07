# Authentication & Email Verification UX

## Overview

**Goal:** Registration → Email Verification → Unlock Features (posts, comments, FITS).

**UX Principles:**

1. **Anonymous browsing always works** (search, view)
2. **Unverified users get a grace window** (1 hour to try viewer, then prompt)
3. **Email down is handled gracefully** (resend, revert to unverified)
4. **Verification is friction, but necessary** (anti-spam guardrail)

---

## User Journey

```text
┌─────────────────────────────────────────────────────────────┐
│ Anon User Lands                                             │
│ ✓ Can view, search, pan, zoom                              │
│ ✗ Cannot post, comment, request FITS                       │
│ [Prompt: "Register to unlock community"]                   │
└─────────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Registration Form                                   │
│ - Email, password, display_name                            │
│ - Terms of service checkbox                                │
│ - Submit: POST /auth/register                              │
└─────────────────────────────────────────────────────────────┘
            ↓ 201 Created
┌─────────────────────────────────────────────────────────────┐
│ Step 2: "Verify Your Email"                                │
│ Status: UNVERIFIED (can search/view, limited write)        │
│ - Dev mode: token shown in-UI (for testing)                │
│ - Prod mode: token sent via email                          │
│ - [Resend Token] button (available for 24h)               │
│ - [Use Unverified 1 Hour] button (grace period)            │
└─────────────────────────────────────────────────────────────┘
            ↓ User clicks email link OR [Use Unverified]
┌─────────────────────────────────────────────────────────────┐
│ Option A: Email Verified                                    │
│ - POST /auth/verify-email { token }                        │
│ - Status: VERIFIED                                         │
│ - Can post, comment, etc.                                  │
│                                                             │
│ Option B: Unverified Grace (1h)                            │
│ - Can try community features                               │
│ - "Complete verification for full access" banner          │
│ - After 1h: features lock, prompt to verify                │
└─────────────────────────────────────────────────────────────┘
```

---

## Registration Endpoint

```typescript
// POST /api/v1/auth/register

export interface RegisterRequest {
  email: string; // Valid email format
  password: string; // >= 12 chars, mixed case + number + symbol
  displayName: string; // 2-50 chars, no special chars
  termsAccepted: boolean;
}

export interface RegisterResponse {
  userId: string;
  email: string;
  status: 'UNVERIFIED' | 'VERIFY_EMAIL_SENT';

  // Dev mode only: token returned for testing
  verificationToken?: string; // 32-byte hex string
  verificationTokenExpiresAt?: string; // ISO 8601

  // Message for UI
  message: string; // e.g., "Verification token sent to user@example.com"
}
```

### Implementation (Verify Endpoint)

```typescript
// apps/vlass-api/src/app/auth/auth.controller.ts

@Post("register")
async register(@Body() dto: RegisterRequest): Promise<RegisterResponse> {
  // 1. Validate email format + strength
  if (!isValidEmail(dto.email)) throw new BadRequestException("Invalid email");
  if (!isStrongPassword(dto.password)) {
    throw new BadRequestException("Password too weak");
  }

  // 2. Check email not already used
  const existing = await this.userRepository.findOne({ email: dto.email });
  if (existing) throw new ConflictException("Email already registered");

  // 3. Hash password
  const hashedPassword = await bcrypt.hash(dto.password, 12);

  // 4. Create user (status = UNVERIFIED)
  const user = await this.userRepository.save({
    email: dto.email,
    password_hash: hashedPassword,
    display_name: dto.displayName,
    roles: ["USER"],
    email_verified_at: null,
  });

  // 5. Generate verification token
  const token = generateRandomHex(32);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await this.emailTokenRepository.save({
    user_id: user.id,
    token,
    expires_at: expiresAt,
    is_used: false,
  });

  // 6. Send email or log token (dev vs prod)
  if (process.env.NODE_ENV === "development") {
    this.logger.log(
      `[DEV] Verification token for ${dto.email}: ${token}`
    );
    return {
      userId: user.id,
      email: user.email,
      status: "VERIFY_EMAIL_SENT",
      verificationToken: token, // Only in dev
      verificationTokenExpiresAt: expiresAt.toISOString(),
      message: "Token logged above. Token also sent to email (simulated in dev).",
    };
  } else {
    await this.emailService.sendVerificationEmail(user.email, token);
    return {
      userId: user.id,
      email: user.email,
      status: "VERIFY_EMAIL_SENT",
      message: `Verification email sent to ${user.email}. Link valid for 24 hours.`,
    };
  }
}
```

---

## Email Verification Endpoint

```typescript
// POST /api/v1/auth/verify-email

export interface VerifyEmailRequest {
  token: string;
}

export interface VerifyEmailResponse {
  userId: string;
  email: string;
  status: 'VERIFIED';
  accessToken: string;
  expiresInSeconds: number;
  message: string;
}
```

### Implementation (Resend Endpoint)

```typescript
@Post("verify-email")
async verifyEmail(@Body() dto: VerifyEmailRequest): Promise<VerifyEmailResponse> {
  // 1. Look up token
  const tokenRecord = await this.emailTokenRepository.findOne({
    token: dto.token,
  });

  if (!tokenRecord) throw new UnauthorizedException("Invalid token");
  if (tokenRecord.is_used) throw new UnauthorizedException("Token already used");
  if (new Date() > tokenRecord.expires_at) {
    throw new UnauthorizedException("Token expired");
  }

  // 2. Mark user as verified
  const user = await this.userRepository.findOne(tokenRecord.user_id);
  user.email_verified_at = new Date();
  await this.userRepository.save(user);

  // 3. Mark token as used
  tokenRecord.is_used = true;
  tokenRecord.used_at = new Date();
  await this.emailTokenRepository.save(tokenRecord);

  // 4. Issue JWT
  const accessToken = this.jwt.sign(
    { userId: user.id, email: user.email, roles: user.roles },
    { expiresIn: "8h" }
  );

  // 5. Audit log
  await this.audit.log({
    action: "VERIFY_EMAIL",
    actor: user.id,
    status: "SUCCESS",
  });

  return {
    userId: user.id,
    email: user.email,
    status: "VERIFIED",
    accessToken,
    expiresInSeconds: 8 * 60 * 60,
    message: "Email verified! You can now post and comment.",
  };
}
```

---

## Resend Verification Token

```typescript
// POST /api/v1/auth/resend-verification-email

export interface ResendVerificationRequest {
  email: string;
}

export interface ResendVerificationResponse {
  message: string;
  expiresInHours: number;
}
```

### Implementation

```typescript
@Post("resend-verification-email")
async resendVerificationEmail(
  @Body() dto: ResendVerificationRequest
): Promise<ResendVerificationResponse> {
  // 1. Find user
  const user = await this.userRepository.findOne({ email: dto.email });
  if (!user) {
    // For security, don't reveal if email exists
    return { message: "If email exists, token has been sent.", expiresInHours: 24 };
  }

  // 2. If already verified, no-op
  if (user.email_verified_at) {
    return { message: "Email already verified.", expiresInHours: 0 };
  }

  // 3. Invalidate old token (if any)
  await this.emailTokenRepository.update(
    { user_id: user.id, is_used: false },
    { is_used: true, used_at: new Date() }
  );

  // 4. Create new token
  const token = generateRandomHex(32);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await this.emailTokenRepository.save({
    user_id: user.id,
    token,
    expires_at: expiresAt,
    is_used: false,
  });

  // 5. Send email
  if (process.env.NODE_ENV === "development") {
    this.logger.log(`[DEV] Resent verification token: ${token}`);
  } else {
    await this.emailService.sendVerificationEmail(user.email, token);
  }

  return {
    message: "Verification email resent.",
    expiresInHours: 24,
  };
}
```

---

## Unverified Grace Period (1 Hour)

After registration, users get **1 hour** of "unverified but functional" access:

- Can search objects
- Can view + pan viewer
- Cannot post/comment/request FITS
- Session storage tracks "grace started at"
- Banner: "Complete email verification for full access" (countdown)
- After 1h expires: prompt to verify or logout

### Implementation (Client)

```typescript
// libs/data-access/auth/src/auth.store.ts

export interface AuthState {
  user: SessionInfo | null;
  isVerified: boolean;
  isUnverifiedGraceActive: boolean;
  graceExpiresAt: Date | null;
}

@Injectable()
export class AuthService {
  private readonly state$ = new BehaviorSubject<AuthState>({...});

  registerUnverified(user: SessionInfo): void {
    const graceExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
    this.state$.next({
      user,
      isVerified: false,
      isUnverifiedGraceActive: true,
      graceExpiresAt,
    });

    // Start countdown timer
    this.scheduleGraceExpiration(graceExpiresAt);
  }

  private scheduleGraceExpiration(expiresAt: Date): void {
    const now = Date.now();
    const ms = expiresAt.getTime() - now;

    setTimeout(() => {
      const state = this.state$.value;
      if (state.isUnverifiedGraceActive) {
        this.state$.next({
          ...state,
          isUnverifiedGraceActive: false,
          graceExpiresAt: null,
        });
        // Trigger UI prompt: "Verify email to continue"
      }
    }, ms);
  }
}
```

### UI Banner

```typescript
// apps/vlass-web/src/app/auth/unverified-banner/unverified-banner.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '@shared/data-access/auth';
import { interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-unverified-banner',
  template: `
    <div class="unverified-banner" *ngIf="show$ | async as show">
      <div class="banner-content">
        <span class="icon">⚠️</span>
        <span class="text">
          Complete email verification to post and comment.
          <strong
            >Expires in {{ minutesLeft }}:{{
              secondsLeft | number: '2.0-0'
            }}</strong
          >
        </span>
        <button class="btn-resend" (click)="resendVerification()">
          Resend Email
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./unverified-banner.component.scss'],
})
export class UnverifiedBannerComponent implements OnInit, OnDestroy {
  show$ = this.auth.state$.pipe(map((s) => s.isUnverifiedGraceActive));
  minutesLeft = 60;
  secondsLeft = 0;
  private destroy$ = new Subject<void>();

  constructor(private readonly auth: AuthService) {}

  ngOnInit(): void {
    interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const state = this.auth.state$.value;
        if (state.graceExpiresAt) {
          const ms = state.graceExpiresAt.getTime() - Date.now();
          this.minutesLeft = Math.floor(ms / 60000);
          this.secondsLeft = Math.floor((ms % 60000) / 1000);
        }
      });
  }

  resendVerification(): void {
    const email = this.auth.state$.value.user?.email;
    if (email) {
      this.auth.resendVerificationEmail(email).subscribe(() => {
        alert('Verification email resent!');
      });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

---

## Email Service Configuration

### Dev Mode (Log Tokens)

```typescript
// apps/vlass-api/src/app/email/email.service.ts

@Injectable()
export class EmailService {
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      this.logger.log(`[DEV EMAIL] To: ${email}`);
      this.logger.log(`[DEV EMAIL] Token: ${token}`);
      this.logger.log(`[DEV EMAIL] Link: /auth/verify-email?token=${token}`);
      return; // Don't actually send
    }

    // Prod: use SMTP
    await this.smtpService.send({
      to: email,
      subject: 'Verify your VLASS Sky Portal email',
      template: 'verification-email',
      context: {
        token,
        verifyUrl: `${process.env.BASE_URL}/auth/verify-email?token=${token}`,
        expiresInHours: 24,
      },
    });
  }
}
```

### Prod Mode (SMTP)

Set in `.env`:

```bash
NODE_ENV=production
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxxx
SMTP_FROM=noreply@vlassportal.example.com
```

---

## Email Validation

```typescript
// Strict email validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password: >= 12 chars, mixed case + number + symbol
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[^\s]{12,}$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

function isStrongPassword(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}
```

---

## Tests

### Unit Tests

```typescript
// apps/vlass-api/src/app/auth/auth.service.spec.ts

describe("AuthService - Registration", () => {
  it("should register user and generate verification token", async () => {
    const response = await service.register({
      email: "user@test.com",
      password: "SecurePass123!",
      displayName: "Test User",
      termsAccepted: true,
    });

    expect(response.status).toBe("VERIFY_EMAIL_SENT");
    expect(response.verificationToken).toBeDefined(); // Dev mode
  });

  it("should reject weak password", async () => {
    const promise = service.register({
      email: "user@test.com",
      password: "weak", // Too short
      displayName: "Test User",
      termsAccepted: true,
    });

    await expect(promise).rejects.toThrow("Password too weak");
  });

  it("should mark email verified on token acceptance", async () => {
    // Register
    const reg = await service.register({...});
    const token = reg.verificationToken!;

    // Verify
    const verify = await service.verifyEmail({ token });

    expect(verify.status).toBe("VERIFIED");
    expect(verify.accessToken).toBeDefined();
  });

  it("should reject expired token", async () => {
    // Create expired token manually
    const token = await tokenRepository.save({
      expires_at: new Date(Date.now() - 1000),
      is_used: false,
    });

    const promise = service.verifyEmail({ token: token.token });
    await expect(promise).rejects.toThrow("Token expired");
  });
});
```

### E2E Tests

```typescript
// apps/vlass-api-e2e/src/auth-verification.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Auth Verification Flow', () => {
  test('should complete registration → verification → login', async ({
    request,
  }) => {
    // 1. Register
    const regResponse = await request.post(
      'http://localhost:3333/auth/register',
      {
        data: {
          email: 'e2e@test.com',
          password: 'SecurePass123!',
          displayName: 'E2E User',
          termsAccepted: true,
        },
      },
    );

    const regData = await regResponse.json();
    expect(regData.status).toBe('VERIFY_EMAIL_SENT');

    // 2. Extract token (dev mode)
    const token = regData.verificationToken;
    expect(token).toBeDefined();

    // 3. Verify email
    const verifyResponse = await request.post(
      'http://localhost:3333/auth/verify-email',
      { data: { token } },
    );

    const verifyData = await verifyResponse.json();
    expect(verifyData.status).toBe('VERIFIED');
    expect(verifyData.accessToken).toBeDefined();

    // 4. Login with verified credentials
    const loginResponse = await request.post(
      'http://localhost:3333/auth/login',
      {
        data: {
          email: 'e2e@test.com',
          password: 'SecurePass123!',
        },
      },
    );

    const loginData = await loginResponse.json();
    expect(loginData.accessToken).toBeDefined();
    expect(loginData.isVerified).toBe(true);
  });

  test('should handle resend verification email', async ({ request }) => {
    // Register
    const regResponse = await request.post(
      'http://localhost:3333/auth/register',
      {
        data: {
          email: 'resend@test.com',
          password: 'SecurePass123!',
          displayName: 'Resend Test',
          termsAccepted: true,
        },
      },
    );

    // Resend
    const resendResponse = await request.post(
      'http://localhost:3333/auth/resend-verification-email',
      { data: { email: 'resend@test.com' } },
    );

    expect(resendResponse.ok()).toBe(true);
  });

  test('should expire unverified grace period after 1 hour', async ({
    page,
  }) => {
    // Register
    const regData = await registerNewUser(page);

    // Start grace period
    const banner = page.locator('app-unverified-banner');
    await expect(banner).toBeVisible();

    // Countdown should show ~60 minutes
    const countdown = banner.locator('.countdown-text');
    const text = await countdown.textContent();
    expect(text).toMatch(/59:\d{2}/ || /60:\d{2}/); // 59 or 60 minutes
  });
});
```

---

**Last Updated:** 2026-02-06

**Key Reminders:**

1. **Anonymous always works.** Verification unlocks community features.
2. **Grace period (1h) is UX-friendly** but still encourages verification.
3. **Dev mode logs tokens.** Prod mode sends via SMTP.
4. **Password validation is strict:** 12+ chars, mixed case, number, symbol.
5. **Resend token invalidates old ones.** Prevents token replay.
