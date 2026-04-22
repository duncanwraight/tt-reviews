import {
  defineConfig,
  devices,
  type ReporterDescription,
} from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_SMOKE_BASE_URL;

if (!BASE_URL) {
  throw new Error(
    "PLAYWRIGHT_SMOKE_BASE_URL must be set for the smoke suite (e.g. https://<version>.<worker>.<subdomain>.workers.dev)"
  );
}

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
  testDir: "./e2e-smoke",
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  workers: IS_CI ? 2 : undefined,
  reporter: IS_CI ? ciReporters : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
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
});
