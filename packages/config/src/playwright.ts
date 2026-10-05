import { defineConfig, devices } from '@playwright/test';
import type { PlaywrightTestConfig } from '@playwright/test';

export type PlaywrightBrowser = 'chromium' | 'firefox' | 'webkit' | 'mobile-chrome' | 'mobile-safari';

export interface CreatePlaywrightConfigOptions {
  /**
   * Test directory path. Defaults to "./tests/e2e".
   */
  testDir?: string;

  /**
   * Base URL for tests. Defaults to process.env.BASE_URL || "http://localhost:8000".
   */
  baseURL?: string;

  /**
   * Browsers to test against.
   * Defaults to ["chromium", "firefox", "webkit", "mobile-chrome", "mobile-safari"].
   */
  browsers?: PlaywrightBrowser[];

  /**
   * Number of retries. Defaults to 2 in CI, 1 locally.
   */
  retries?: number;

  /**
   * Number of parallel workers. Defaults to 1.
   */
  workers?: number;

  /**
   * Global test timeout in ms. Defaults to 60000.
   */
  timeout?: number;

  /**
   * Run tests fully in parallel. Defaults to false.
   */
  fullyParallel?: boolean;

  /**
   * Reporter to use. Defaults to "html".
   */
  reporter?: PlaywrightTestConfig['reporter'];

  /**
   * Run in headless mode. Defaults to true.
   */
  headless?: boolean;

  /**
   * Trace collection strategy. Defaults to "on-first-retry".
   */
  trace?: 'on' | 'off' | 'on-first-retry' | 'on-all-retries' | 'retain-on-failure' | 'retain-on-first-failure';

  /**
   * Screenshot strategy. Defaults to "only-on-failure".
   */
  screenshot?: 'on' | 'off' | 'only-on-failure';

  /**
   * Navigation timeout in ms. Defaults to 30000.
   */
  navigationTimeout?: number;

  /**
   * Action timeout in ms (clicks, fills, etc). Defaults to 10000.
   */
  actionTimeout?: number;

  /**
   * Forbid test.only in CI. Defaults to true when process.env.CI is set.
   */
  forbidOnly?: boolean;

  /**
   * Web server configuration to start before tests.
   */
  webServer?: PlaywrightTestConfig['webServer'];

  /**
   * Path to a module that is run once before all test files.
   * Useful for global setup like generating auth tokens.
   */
  globalSetup?: string;

  /**
   * Glob patterns or regexps matching files to ignore.
   * Defaults to undefined (no ignore).
   */
  testIgnore?: PlaywrightTestConfig['testIgnore'];

  /**
   * Override projects entirely (ignores the browsers option when provided).
   */
  projects?: PlaywrightTestConfig['projects'];

  /**
   * Additional shared use options merged with defaults.
   */
  use?: PlaywrightTestConfig['use'];
}

const chromiumSandboxArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];

function browserToProject(browser: PlaywrightBrowser): NonNullable<PlaywrightTestConfig['projects']>[number] {
  switch (browser) {
    case 'chromium':
      return {
        name: 'chromium',
        use: {
          ...devices['Desktop Chrome'],
          launchOptions: { args: chromiumSandboxArgs },
        },
      };
    case 'firefox':
      return {
        name: 'firefox',
        use: {
          ...devices['Desktop Firefox'],
          launchOptions: { args: chromiumSandboxArgs },
        },
      };
    case 'webkit':
      return {
        name: 'webkit',
        use: { ...devices['Desktop Safari'] },
      };
    case 'mobile-chrome':
      return {
        name: 'Mobile Chrome',
        use: {
          ...devices['Pixel 5'],
          launchOptions: { args: chromiumSandboxArgs },
        },
      };
    case 'mobile-safari':
      return {
        name: 'Mobile Safari',
        use: { ...devices['iPhone 12'] },
      };
  }
}

/**
 * Creates a shared Playwright configuration for workspace apps.
 *
 * This abstracts away the boilerplate multi-browser Playwright config,
 * providing sensible defaults for CI/local environments, browser projects,
 * timeouts, and trace/screenshot settings.
 *
 * @example
 * ```ts
 * // apps/<app>/playwright.config.ts
 * import { createPlaywrightConfig } from "@repo/config/playwright";
 *
 * export default createPlaywrightConfig();
 * ```
 *
 * @example
 * ```ts
 * // Custom configuration
 * import { createPlaywrightConfig } from "@repo/config/playwright";
 *
 * export default createPlaywrightConfig({
 *   testDir: "./tests",
 *   browsers: ["chromium", "firefox"],
 *   webServer: {
 *     command: "pnpm dev --port 3000",
 *     url: "http://localhost:3000",
 *     reuseExistingServer: true,
 *   },
 * });
 * ```
 */
export function createPlaywrightConfig(options: CreatePlaywrightConfigOptions = {}): PlaywrightTestConfig {
  const isCI = !!process.env.CI;
  const {
    testDir = './tests/e2e',
    baseURL = process.env.BASE_URL || 'http://localhost:8000',
    browsers = ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'],
    retries = isCI ? 2 : 1,
    workers = 1,
    timeout = 60000,
    fullyParallel = false,
    reporter = 'html',
    headless = true,
    trace = 'on-first-retry',
    screenshot = 'only-on-failure',
    navigationTimeout = 30000,
    actionTimeout = 10000,
    forbidOnly = isCI,
    webServer,
    globalSetup,
    testIgnore,
    projects,
    use,
  } = options;

  return defineConfig({
    testDir,
    fullyParallel,
    forbidOnly,
    retries,
    workers,
    reporter,
    timeout,
    use: {
      baseURL,
      trace,
      screenshot,
      navigationTimeout,
      actionTimeout,
      headless,
      ...use,
    },
    projects: projects ?? browsers.map(browserToProject),
    ...(webServer ? { webServer } : {}),
    ...(globalSetup ? { globalSetup } : {}),
    ...(testIgnore ? { testIgnore } : {}),
  });
}
