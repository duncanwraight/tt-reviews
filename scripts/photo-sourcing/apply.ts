// Apply step for the photo-sourcing pipeline (TT-36).
//
// Reads the manifest, downloads each chosen Commons image, normalises
// it (webp, ≤1024px on the long edge, EXIF stripped) and writes:
//   - supabase/seed-images/<kind>/<slug>.webp        (committed binary)
//   - supabase/seed-images/credits.sql               (idempotent UPDATE)
//
// It also splices the same UPDATE statements into supabase/seed.sql
// between BEGIN/END PHOTO-SOURCING-CREDITS markers, so a fresh
// `supabase db reset` re-applies attribution without needing psql
// `\ir` (which the supabase CLI seed runner does not support). Local
// R2 contents are loaded by load-fixtures.sh — this script does not
// talk to R2.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  loadManifest,
  type Manifest,
  type ManifestCandidate,
  type ManifestEntry,
} from "./lib/manifest.ts";

const MANIFEST_PATH = resolve(
  process.cwd(),
  "scripts/photo-sourcing/manifest.json"
);
const SEED_IMAGES_DIR = resolve(process.cwd(), "supabase/seed-images");
const CREDITS_SQL = resolve(SEED_IMAGES_DIR, "credits.sql");
const SEED_SQL = resolve(process.cwd(), "supabase/seed.sql");
const SEED_BEGIN_MARKER = "-- BEGIN PHOTO-SOURCING-CREDITS";
const SEED_END_MARKER = "-- END PHOTO-SOURCING-CREDITS";

const MAX_DIMENSION = 1024;
const WEBP_QUALITY = 82;
const USER_AGENT =
  "tt-reviews-photo-sourcer/0.1 (+https://tabletennis.reviews; duncan@wraight-consulting.co.uk)";

interface AppliedRow {
  kind: ManifestEntry["kind"];
  slug: string;
  imageKey: string;
  imageEtag: string;
  creditText: string | null;
  creditLink: string | null;
  licenseShort: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
}

async function main(): Promise<void> {
  const manifest = loadManifest(MANIFEST_PATH);
  if (!manifest) {
    throw new Error(`No manifest at ${MANIFEST_PATH}. Run scan.ts first.`);
  }

  const targets = collectTargets(manifest);
  if (targets.length === 0) {
    process.stdout.write("Nothing to apply: no entries with `chosen` set.\n");
    return;
  }

  process.stdout.write(`Applying ${targets.length} entries...\n`);
  mkdirSync(SEED_IMAGES_DIR, { recursive: true });

  const applied: AppliedRow[] = [];
  for (const { entry, candidate } of targets) {
    process.stdout.write(`  ${entry.kind}/${entry.slug} ← ${candidate.url}\n`);
    const row = await processOne(entry, candidate);
    applied.push(row);
  }

  writeCreditsSql(applied);
  process.stdout.write(`\nWrote ${applied.length} rows to ${CREDITS_SQL}\n`);

  spliceIntoSeedSql(applied);
  process.stdout.write(
    `Spliced ${applied.length} rows between PHOTO-SOURCING-CREDITS markers in ${SEED_SQL}\n`
  );
}

interface Target {
  entry: ManifestEntry;
  candidate: ManifestCandidate;
}

function collectTargets(manifest: Manifest): Target[] {
  const targets: Target[] = [];
  for (const entry of Object.values(manifest.entries)) {
    if (!entry.chosen) continue;
    const candidate = entry.candidates.find(c => c.filename === entry.chosen);
    if (!candidate) continue;
    // Free-licensed Commons → always OK. WTT → OK under the documented
    // takedown-contact posture. Anything else (a non-free Commons file
    // a reviewer overrode to) is rejected to keep the apply step from
    // silently shipping unattributed images.
    const allowed =
      candidate.freeLicense || candidate.source === "wtt-headshot";
    if (!allowed) {
      process.stderr.write(
        `  skip ${entry.slug}: chosen "${entry.chosen}" has no free license\n`
      );
      continue;
    }
    targets.push({ entry, candidate });
  }
  return targets;
}

async function processOne(
  entry: ManifestEntry,
  candidate: ManifestCandidate
): Promise<AppliedRow> {
  const buffer = await downloadImage(candidate.url);
  const kindDir = resolve(SEED_IMAGES_DIR, entry.kind);
  mkdirSync(kindDir, { recursive: true });
  const outPath = resolve(kindDir, `${entry.slug}.webp`);

  const normalised = await sharp(buffer)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  writeFileSync(outPath, normalised);

  const imageKey = `${entry.kind}/${entry.slug}/seed.webp`;
  // Short SHA-1 of the normalised webp. We append this as ?v= on the
  // rendered image URL so the browser cache busts when content changes
  // even though the deterministic R2 key stays the same. 12 hex chars
  // ≈ 48 bits — vastly more than enough collision-resistance for ~50
  // entries.
  const imageEtag = createHash("sha1")
    .update(normalised)
    .digest("hex")
    .slice(0, 12);

  return {
    kind: entry.kind,
    slug: entry.slug,
    imageKey,
    imageEtag,
    creditText: extractCreditText(candidate.artistHtml ?? candidate.credit),
    creditLink: extractCreditLink(candidate.artistHtml),
    licenseShort: candidate.license,
    licenseUrl: candidate.licenseUrl,
    sourceUrl: candidate.filePageUrl,
  };
}

// upload.wikimedia.org returns 429 once we burst more than ~1 req/s
// per IP. We pace downloads at the same 1s gap as API calls and back
// off on 429 / 5xx. The Retry-After header is honoured when present.
const DOWNLOAD_MIN_GAP_MS = 1000;
let lastDownloadAt = 0;

async function downloadImage(url: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wait = lastDownloadAt + DOWNLOAD_MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastDownloadAt = Date.now();

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.ok) {
      return Buffer.from(await res.arrayBuffer());
    }
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`Download ${url} → ${res.status}`);
    }
    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    const backoff = Math.max(retryAfter * 1000, 2000 * Math.pow(2, attempt));
    process.stderr.write(
      `  retry ${attempt + 1}/4 after ${backoff}ms (status ${res.status})\n`
    );
    await new Promise(r => setTimeout(r, backoff));
  }
  throw new Error(`Download ${url} → exhausted retries`);
}

// Commons returns artist as a small HTML blob. We want the visible
// text only — no nested tags, no CSS. A plain regex strip is safer
// (and dependency-free) than pulling in a DOM parser for a one-off.
function extractCreditText(html: string | null): string | null {
  if (!html) return null;
  const stripped = html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > 0 ? stripped : null;
}

function extractCreditLink(html: string | null): string | null {
  if (!html) return null;
  const match = html.match(/href=["']([^"']+)["']/);
  if (!match) return null;
  let href = match[1];
  if (href.startsWith("//")) href = `https:${href}`;
  if (!/^https?:\/\//i.test(href)) return null;
  return href;
}

function writeCreditsSql(rows: AppliedRow[]): void {
  const lines: string[] = [
    "-- Generated by scripts/photo-sourcing/apply.ts. Do not edit by hand.",
    "-- Re-run `node --experimental-strip-types scripts/photo-sourcing/apply.ts`",
    "-- to regenerate. See TT-36.",
    "",
  ];

  const byKind: Record<string, AppliedRow[]> = {};
  for (const row of rows) {
    (byKind[row.kind] ??= []).push(row);
  }

  for (const kind of Object.keys(byKind).sort()) {
    const table = kind === "player" ? "players" : "equipment";
    lines.push(`-- ${table}`);
    for (const row of byKind[kind].sort((a, b) =>
      a.slug.localeCompare(b.slug)
    )) {
      lines.push(buildUpdateStatement(table, row));
    }
    lines.push("");
  }

  writeFileSync(CREDITS_SQL, lines.join("\n"), "utf8");
}

function buildUpdateStatement(table: string, row: AppliedRow): string {
  const set = [
    `image_key = ${sql(row.imageKey)}`,
    `image_etag = ${sql(row.imageEtag)}`,
    `image_credit_text = ${sql(row.creditText)}`,
    `image_credit_link = ${sql(row.creditLink)}`,
    `image_license_short = ${sql(row.licenseShort)}`,
    `image_license_url = ${sql(row.licenseUrl)}`,
    `image_source_url = ${sql(row.sourceUrl)}`,
  ].join(",\n  ");
  return `UPDATE ${table} SET\n  ${set}\nWHERE slug = ${sql(row.slug)};`;
}

function sql(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

// Replace the block between BEGIN/END PHOTO-SOURCING-CREDITS markers
// in supabase/seed.sql with the same UPDATE statements we wrote to
// credits.sql. The supabase CLI seed runner does not support psql
// `\ir`, so the credits have to be inlined to survive `db reset`.
function spliceIntoSeedSql(rows: AppliedRow[]): void {
  const seed = readFileSync(SEED_SQL, "utf8");
  const begin = seed.indexOf(SEED_BEGIN_MARKER);
  const end = seed.indexOf(SEED_END_MARKER);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      `Markers not found in ${SEED_SQL}. Add:\n  ${SEED_BEGIN_MARKER}\n  ${SEED_END_MARKER}`
    );
  }

  const block = [
    SEED_BEGIN_MARKER,
    "-- Auto-generated by scripts/photo-sourcing/apply.ts (TT-36). Do not",
    "-- edit by hand — re-run `npm run sourcing:apply` to refresh this block.",
    "-- Pairs with normalised webps under supabase/seed-images/.",
    "",
  ];

  const byKind: Record<string, AppliedRow[]> = {};
  for (const row of rows) (byKind[row.kind] ??= []).push(row);

  for (const kind of Object.keys(byKind).sort()) {
    const table = kind === "player" ? "players" : "equipment";
    block.push(`-- ${table}`);
    for (const row of byKind[kind].sort((a, b) =>
      a.slug.localeCompare(b.slug)
    )) {
      block.push(buildUpdateStatement(table, row));
    }
    block.push("");
  }

  block.push(SEED_END_MARKER);

  const before = seed.slice(0, begin);
  const after = seed.slice(end + SEED_END_MARKER.length);
  writeFileSync(SEED_SQL, before + block.join("\n") + after, "utf8");
}

main().catch(err => {
  process.stderr.write(`apply failed: ${(err as Error).message}\n`);
  process.exit(1);
});
