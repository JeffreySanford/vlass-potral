import { test, expect } from '@playwright/test';

function createFakeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'user-1', exp })).toString('base64url');
  const signature = 'test-signature';
  return `${header}.${payload}.${signature}`;
}

test('redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/landing');
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.locator('h1')).toContainText('Login');
  await expect(page.getByRole('button', { name: 'Personalize background' })).toBeVisible();
});

test('shows error for invalid credentials', async ({ page }) => {
  await page.route('**/auth/login', async (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType !== 'fetch' && resourceType !== 'xhr') {
      await route.continue();
      return;
    }

    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
        },
      });
      return;
    }

    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({ message: 'Invalid email or password' }),
    });
  });

  await page.goto('/auth/login');

  await page.locator('input[formcontrolname="email"]').fill('test@vlass.local');
  await page.locator('input[formcontrolname="password"]').fill('wrong');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.locator('h1')).toContainText('Login');
});

test('logs in and allows logout', async ({ page }) => {
  const token = createFakeJwt(Math.floor(Date.now() / 1000) + 3600);

  await page.route('**/auth/login', async (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType !== 'fetch' && resourceType !== 'xhr') {
      await route.continue();
      return;
    }

    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
        },
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({
        access_token: token,
        token_type: 'Bearer',
        user: {
          id: 'user-1',
          username: 'testuser',
          email: 'test@vlass.local',
          display_name: 'Test User',
          created_at: '2026-02-07T00:00:00.000Z',
        },
      }),
    });
  });

  await page.goto('/auth/login');
  await page.locator('input[formcontrolname="email"]').fill('test@vlass.local');
  await page.locator('input[formcontrolname="password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(/\/landing/);
  await expect(page.locator('h1')).toContainText('Welcome back, Test User');
  await expect(page.getByRole('heading', { name: 'Instant SSR First Paint', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Viewer, Permalinks, and Snapshots', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Community Research Notebook', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('registers a user and redirects to landing', async ({ page }) => {
  const token = createFakeJwt(Math.floor(Date.now() / 1000) + 3600);

  await page.route('**/auth/register', async (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType !== 'fetch' && resourceType !== 'xhr') {
      await route.continue();
      return;
    }

    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
        },
      });
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({
        access_token: token,
        token_type: 'Bearer',
        user: {
          id: 'user-2',
          username: 'newuser',
          email: 'new@vlass.local',
          display_name: 'newuser',
          created_at: '2026-02-07T00:00:00.000Z',
        },
      }),
    });
  });

  await page.goto('/auth/register');
  await page.locator('input[formcontrolname="username"]').fill('newuser');
  await page.locator('input[formcontrolname="email"]').fill('new@vlass.local');
  await page.locator('input[formcontrolname="password"]').fill('Password123!');
  await page.locator('input[formcontrolname="confirmPassword"]').fill('Password123!');
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page).toHaveURL(/\/landing/);
  await expect(page.locator('h1')).toContainText('Welcome back');
});

test('shows conflict errors on duplicate registration', async ({ page }) => {
  await page.route('**/auth/register', async (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType !== 'fetch' && resourceType !== 'xhr') {
      await route.continue();
      return;
    }

    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
        },
      });
      return;
    }

    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({ message: 'Email is already in use.' }),
    });
  });

  await page.goto('/auth/register');
  await page.locator('input[formcontrolname="username"]').fill('testuser');
  await page.locator('input[formcontrolname="email"]').fill('test@vlass.local');
  await page.locator('input[formcontrolname="password"]').fill('Password123!');
  await page.locator('input[formcontrolname="confirmPassword"]').fill('Password123!');
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page).toHaveURL(/\/auth\/register/);
  await expect(page.getByText('Email is already in use.')).toBeVisible();
});
