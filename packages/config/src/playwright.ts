import { defineConfig, devices } from '@playwright/test';
import type { PlaywrightTestConfig } from '@playwright/test';

export type PlaywrightBrowser = 'chromium' | 'firefox' | 'webkit' | 'mobile-chrome' | 'mobile-safari';

type PlaywrightProject = NonNullable<PlaywrightTestConfig['projects']>[number];

/** The string trace modes Playwright accepts: 'on', 'off', 'on-first-retry', 'retain-on-failure', … */
type TraceMode = Extract<NonNullable<PlaywrightTestConfig['use']>['trace'], string>;

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
  trace?: TraceMode;

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

const browserProjects = {
  chromium: {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: { args: chromiumSandboxArgs },
    },
  },
  firefox: {
    name: 'firefox',
    use: {
      ...devices['Desktop Firefox'],
      launchOptions: { args: chromiumSandboxArgs },
    },
  },
  webkit: {
    name: 'webkit',
    use: { ...devices['Desktop Safari'] },
  },
  'mobile-chrome': {
    name: 'Mobile Chrome',
    use: {
      ...devices['Pixel 5'],
      launchOptions: { args: chromiumSandboxArgs },
    },
  },
  'mobile-safari': {
    name: 'Mobile Safari',
    use: { ...devices['iPhone 12'] },
  },
} satisfies Record<PlaywrightBrowser, PlaywrightProject>;

const browserToProject = (browser: PlaywrightBrowser): PlaywrightProject => browserProjects[browser];

/**
 * `process.env.BASE_URL`, unless it is unset or empty.
 */
const envBaseUrl = (): string => {
  const fromEnv = process.env.BASE_URL;
  return fromEnv === undefined || fromEnv === '' ? 'http://localhost:8000' : fromEnv;
};

const withDefaults = (options: CreatePlaywrightConfigOptions, isCI: boolean) => {
  const {
    testDir = './tests/e2e',
    baseURL = envBaseUrl(),
    browsers = ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'],
    retries = isCI ? 2 : 1,
    workers = 1,
    timeout = 60_000,
    fullyParallel = false,
    reporter = 'html',
    headless = true,
    trace = 'on-first-retry',
    screenshot = 'only-on-failure',
    navigationTimeout = 30_000,
    actionTimeout = 10_000,
    forbidOnly = isCI,
  } = options;
  return {
    testDir,
    baseURL,
    browsers,
    retries,
    workers,
    timeout,
    fullyParallel,
    reporter,
    headless,
    trace,
    screenshot,
    navigationTimeout,
    actionTimeout,
    forbidOnly,
  };
};

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
export const createPlaywrightConfig = (options: CreatePlaywrightConfigOptions = {}): PlaywrightTestConfig => {
  const isCI = process.env.CI !== undefined && process.env.CI !== '';
  const {
    testDir,
    baseURL,
    browsers,
    retries,
    workers,
    timeout,
    fullyParallel,
    reporter,
    headless,
    trace,
    screenshot,
    navigationTimeout,
    actionTimeout,
    forbidOnly,
  } = withDefaults(options, isCI);
  const { webServer, globalSetup, testIgnore, projects, use } = options;

  // Optional top-level keys, present only when the caller set them.
  const optional: PlaywrightTestConfig = {};
  if (webServer) {
    optional.webServer = webServer;
  }
  if (globalSetup !== undefined && globalSetup !== '') {
    optional.globalSetup = globalSetup;
  }
  if (testIgnore !== undefined && testIgnore !== '') {
    optional.testIgnore = testIgnore;
  }

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
    ...optional,
  });
};
