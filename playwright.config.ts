import {
  defineConfig,
  devices,
  type ReporterDescription,
} from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const IS_CI = !!process.env.CI;

const ciReporters: ReporterDescription[] = [
  ["github"],
  ["html", { open: "never" }],
];
if (process.env.PLAYWRIGHT_JSON_OUTPUT_NAME) {
  ciReporters.push([
    "json",
    { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME },
  ]);
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  // 2 workers; rate-limit / localStorage-sensitive specs declare per-file `mode: "serial"`.
  workers: IS_CI ? 2 : undefined,
  reporter: IS_CI ? ciReporters : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: IS_CI ? "retain-on-failure" : "off",
    screenshot: IS_CI ? "only-on-failure" : "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: `${BASE_URL}/e2e-health`,
    reuseExistingServer: !IS_CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // TT-92: makes the photo-sourcing factory return a stub provider
      // so e2e queue tests don't hit Brave. The factory's real-Brave
      // path is exercised by unit tests and by manual prod runs.
      TEST_SOURCING_PROVIDER: "true",
    },
  },
});
