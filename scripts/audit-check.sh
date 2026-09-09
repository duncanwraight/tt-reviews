#!/usr/bin/env bash
# Dependency-vulnerability gate for CI.
#
# Wraps `npm audit --audit-level=high` so that a small, explicitly
# documented set of advisories can be allowed through while everything
# else still fails the build. `npm audit` has no native ignore list —
# the only knobs are `--audit-level` (blunt: silences an entire
# severity band) and `--omit=dev` (wrong: build-time supply chain is
# in scope here). Hence this wrapper.
#
# Adding to ALLOW is a security decision, not a convenience. Each entry
# needs: the GHSA id(s), why the vulnerable code path is unreachable in
# this app, whether a fix exists upstream, and a review date. If a fix
# exists, take the fix instead of allowlisting it.
#
# Usage:
#   ./scripts/audit-check.sh            # gate on high + critical (default)
#   AUDIT_LEVEL=critical ./scripts/audit-check.sh
#
# Exits 0 when nothing above the threshold remains outside ALLOW,
# 1 otherwise (printing the offending advisories).

set -euo pipefail

AUDIT_LEVEL="${AUDIT_LEVEL:-high}"

# Advisory ids (npm's numeric `source`, stable across runs) that are
# knowingly tolerated. Keep the rationale next to the id.
ALLOW=(
  # GHSA-jmr9-qjv8-65gv — extract-zip unvalidated symlink path traversal
  # GHSA-7pqw-9j4j-h8q3 — extract-zip arbitrary file write via symlink entries
  #
  # Chain: @cloudflare/puppeteer -> @puppeteer/browsers -> extract-zip.
  # Both advisories are about extracting an untrusted ZIP archive.
  # @puppeteer/browsers extracts archives only when it downloads a local
  # Chromium; the deployed Worker drives Browser Rendering through the
  # `BROWSER` binding (app/lib/browser-fetch.server.ts) and never
  # downloads or extracts anything. No fixed extract-zip exists —
  # latest (2.0.1) is the flagged version, and npm's only suggested
  # "fix" is downgrading @cloudflare/puppeteer to 0.0.11, which drops
  # the Browser Rendering API that TT-245 depends on.
  #
  # Review: 2026-12-09 — drop these the moment extract-zip ships a fix.
  1139346
  1193685
)

audit_json="$(npm audit --json 2>/dev/null || true)"

if [ -z "$audit_json" ]; then
  echo "audit-check: npm audit produced no output" >&2
  exit 1
fi

printf '%s' "$audit_json" | AUDIT_LEVEL="$AUDIT_LEVEL" ALLOW="${ALLOW[*]}" node -e '
const allow = new Set((process.env.ALLOW || "").split(/\s+/).filter(Boolean));
const level = process.env.AUDIT_LEVEL || "high";
const rank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const threshold = rank[level];

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error("audit-check: could not parse npm audit --json output");
    process.exit(1);
  }

  // Flatten to one entry per advisory, deduped by npm`s numeric source id.
  const found = new Map();
  for (const [pkg, v] of Object.entries(data.vulnerabilities || {})) {
    for (const via of v.via || []) {
      if (typeof via !== "object" || via.source == null) continue;
      if ((rank[via.severity] ?? 0) < threshold) continue;
      if (!found.has(via.source)) {
        found.set(via.source, { ...via, packages: new Set() });
      }
      found.get(via.source).packages.add(pkg);
    }
  }

  const blocking = [];
  const allowed = [];
  for (const [source, a] of found) {
    (allow.has(String(source)) ? allowed : blocking).push(a);
  }

  for (const a of allowed) {
    console.log(`allowed  ${a.severity.padEnd(8)} ${a.name} — ${a.title} (${a.source})`);
  }

  // A stale allowlist entry is a smell, not a failure: it usually means a
  // fix landed and the entry should be deleted. Surface it loudly.
  for (const id of allow) {
    if (!found.has(Number(id))) {
      console.log(`STALE    allowlist entry ${id} matches no current advisory — remove it from scripts/audit-check.sh`);
    }
  }

  if (blocking.length === 0) {
    console.log(`\naudit-check: no un-allowlisted ${level}+ advisories.`);
    process.exit(0);
  }

  console.error(`\naudit-check: ${blocking.length} ${level}+ advisor${blocking.length === 1 ? "y" : "ies"} must be fixed or explicitly allowlisted:\n`);
  for (const a of blocking) {
    console.error(`  ${a.severity.padEnd(8)} ${a.name} (${a.source})`);
    console.error(`    ${a.title}`);
    console.error(`    ${a.url}`);
    console.error(`    via: ${[...a.packages].join(", ")}`);
  }
  console.error("\nFix with `npm update` / an `overrides` entry where a patched version exists.");
  console.error("Only allowlist when no fix exists AND the vulnerable path is unreachable here.");
  process.exit(1);
});
'
