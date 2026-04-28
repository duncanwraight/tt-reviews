import { readFileSync } from "node:fs";

/**
 * Loads `.dev.vars` into `process.env` before any spec runs so e2e tests
 * can reach the same Discord bot credentials the dev server uses (currently
 * the alerts spec polls Discord with these). CI sets the values directly
 * via the workflow heredoc; this picks them up locally without forcing
 * developers to export anything by hand.
 *
 * Existing `process.env` values always win — never overwrite an explicit
 * export.
 */
export default async function globalSetup() {
  let contents: string;
  try {
    contents = readFileSync(".dev.vars", "utf8");
  } catch {
    return;
  }

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq);
    const value = line.slice(eq + 1);
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
