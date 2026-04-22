import { config } from "dotenv";

// Load environment variables from .dev.vars for testing
config({ path: ".dev.vars" });

// Global test setup
global.fetch = global.fetch || fetch;

// Register @testing-library/jest-dom matchers in DOM-based test files.
// No-op in node-env tests (where `document` isn't defined) — the import
// itself is safe; jest-dom just won't be used.
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
}
