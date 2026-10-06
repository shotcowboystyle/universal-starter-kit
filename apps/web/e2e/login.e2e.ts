import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { expect, test } from '@playwright/test';
import type { Response } from '@playwright/test';

import { defaultEmail } from '@/constants/demo-data';

// Read the JSON file synchronously
const enMessages = JSON.parse(readFileSync(path.join(process.cwd(), 'messages', 'en.json'), 'utf-8'));

/**
 * Wait for API server to be ready
 * This helps diagnose timing issues in CI environments
 */
const waitForAPI = async (url: string, timeout = 30_000): Promise<void> => {
  const startTime = Date.now();
  let lastError: Error | null = null;

  console.log(`[Diagnostic] Waiting for API server at ${url}...`);

  while (Date.now() - startTime < timeout) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- polling must be sequential: each attempt waits on the previous one
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      lastError = new Error(`API returned ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    // Wait 500ms before retry
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling must be sequential: each attempt waits on the previous one
    await sleep(500);
  }

  throw new Error(
    `API server not ready after ${timeout}ms. Last error: ${lastError === null || lastError.message === '' ? 'Unknown' : lastError.message}`,
  );
};

const logAuthBody = async (response: Response): Promise<void> => {
  try {
    const body = await response.text();
    console.log(`[Diagnostic]   Body: ${body.slice(0, 200)}`);
  } catch {
    // Safe to continue: diagnostic logging only
    console.log(`[Diagnostic]   Body: (unable to read)`);
  }
};

test.describe.serial('SignInPage', () => {
  // Diagnostic: Wait for API to be ready before all tests
  // NOTE: This is a soft check with shorter timeout - tests will continue even if API is not ready
  test.beforeAll(async () => {
    const envApiUrl = process.env.NEXT_PUBLIC_API_URL;
    const apiUrl = envApiUrl === undefined || envApiUrl === '' ? 'http://localhost:3001' : envApiUrl;

    // Soft check: never throw, so tests continue even if the API is not ready
    try {
      await waitForAPI(`${apiUrl}/health`, 20_000);
      console.log('[Diagnostic] ✓ API health check passed');
    } catch (error) {
      console.warn('[Diagnostic] ⚠️ API health check failed:', error);
      console.warn('[Diagnostic] ⚠️ Tests will continue, but login may fail if API is not ready');
      console.warn('[Diagnostic] ⚠️ This is expected in CI if API takes longer to start than Next.js');
    }
  });

  test('should load the sign-in page', async ({ page }) => {
    // clear cookies
    await page.context().clearCookies();
    // Use domcontentloaded instead of load for dev mode compatibility
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const h1 = await page.locator('h1').textContent();
    expect(h1).toBe(enMessages.login.description);
  });

  test('should sign in with valid credentials', async ({ page }) => {
    // Diagnostic: Listen to all network requests
    const requests: {
      url: string;
      method: string;
      status: number;
      duration: number;
    }[] = [];
    const requestStartTimes = new Map<string, number>();

    page.on('request', (request) => {
      const url = request.url();
      requestStartTimes.set(url, Date.now());
    });

    page.on('response', (response) => {
      const url = response.url();
      const startTime = requestStartTimes.get(url) ?? Date.now();
      const duration = Date.now() - startTime;
      const status = response.status();

      requests.push({
        url,
        method: response.request().method(),
        status,
        duration,
      });

      // Log response body for auth-related requests
      if (url.includes('/auth/')) {
        void logAuthBody(response);
      }
    });

    page.on('console', (msg) => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
    });

    // Navigate to login page
    console.log('[Diagnostic] Navigating to /login');
    // Use domcontentloaded instead of load for dev mode compatibility
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    // Fill in email
    console.log(`[Diagnostic] Filling email: ${defaultEmail}`);
    await page.getByTestId('email-input').fill(defaultEmail);

    // Click submit button and wait for navigation
    console.log('[Diagnostic] Clicking submit button');
    const submitStart = Date.now();

    try {
      // Wait for navigation to complete after clicking submit
      await Promise.all([
        page.waitForURL(/^http:\/\/localhost:3000\/en\/boards(?:\?.*)?$/u, {
          timeout: 30_000,
          waitUntil: 'domcontentloaded',
        }),
        page.getByTestId('submit-button').click(),
      ]);

      const submitDuration = Date.now() - submitStart;
      console.log(`[Diagnostic] ✓ Navigation successful after ${submitDuration}ms`);
    } catch (error) {
      const currentUrl = page.url();
      console.error('[Diagnostic] ✗ Navigation failed');
      console.error(`[Diagnostic]   Current URL: ${currentUrl}`);
      console.error(`[Diagnostic]   Expected URL pattern: /^http:\\/\\/localhost:3000\\/en\\/boards(\\?.*)?$/`);
      console.error('[Diagnostic]   Network requests:');
      for (const req of requests) {
        console.error(`[Diagnostic]     ${req.method} ${req.url} - ${req.status} (${req.duration}ms)`);
      }

      // Take a screenshot for debugging
      await page.screenshot({
        path: 'test-results/login-failure.png',
        fullPage: true,
      });
      console.error('[Diagnostic]   Screenshot saved to test-results/login-failure.png');

      throw error;
    }
  });
});
