// Backfill ittfid + birth_year and reformat highest_rating across the
// 52 seed players in supabase/seed.sql (TT-210 — pre-wipe seed
// curation child of TT-191).
//
// What it does:
//   1. Parse the two `INSERT INTO players (...)` blocks (active top-25
//      men + top-25 women block, and the TT-157 retired pair).
//   2. Resolve each player's ittfid: for active players, by lifting it
//      out of the existing `image_source_url = '...?playerId=N'`
//      UPDATE blocks; for retired players (Ma Long + Sámsonov) from a
//      hardcoded override map.
//   3. For each ittfid, call fetchIttfProfile() to get birth_year +
//      Career Best peak rank/year, format highest_rating as
//      'WR<n> (<year>)'. Fall back to the existing 'WR<n>' value (no
//      year) when ITTF didn't publish a Career Best line.
//   4. Rewrite the two INSERT blocks in-place with the new canonical
//      column list (adds `ittfid` after `slug`, `birth_year` after
//      `birth_country`).
//
// Idempotent: re-running with the same live ITTF responses leaves
// supabase/seed.sql byte-identical. Verifiable via `git diff
// --exit-code supabase/seed.sql`.
//
// Network: one ITTF GET per player (52 total) paced at >=1s/req by
// fetchIttfProfile. Expect ~1 minute end-to-end.
//
// Usage:
//   node --experimental-strip-types scripts/seed-player-data.ts

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  fetchIttfProfile,
  type IttfProfile,
} from "../app/lib/players/ittf-profile.server.ts";

const SEED_SQL = resolve(process.cwd(), "supabase/seed.sql");

// Retired players that aren't in the active WTT roster. Verified
// 2026-05-14 by hitting the ITTF profile page directly.
const RETIRED_ITTFID_OVERRIDES: Record<string, number> = {
  "ma-long": 105649,
  "vladimir-samsonov": 108246,
};

const ACTIVE_BLOCK_HEADER =
  "-- Insert players - Top 25 Men's Singles from ITTF Rankings 2025 Week #24 (most are shakehand attackers)";
const RETIRED_BLOCK_HEADER =
  "-- TT-157: Retired/historical players, used by Discord search integration";

const CANONICAL_COLUMNS = [
  "name",
  "slug",
  "ittfid",
  "highest_rating",
  "active_years",
  "active",
  "birth_country",
  "birth_year",
  "represents",
  "playing_style",
  "gender",
] as const;

type ColumnName = (typeof CANONICAL_COLUMNS)[number];

interface SeedRow {
  values: Record<ColumnName, string>; // raw SQL literals, e.g. "'LIN Shidong'", "true", "NULL"
}

interface PlayerBlock {
  startLineIndex: number; // index of the `INSERT INTO players (...) VALUES` line
  endLineIndex: number; // index of the closing `;` line
  columns: string[]; // existing column list, parsed from the INSERT header
  items: BlockItem[];
}

type BlockItem =
  | { kind: "row"; row: ParsedRow }
  | { kind: "comment"; text: string };

interface ParsedRow {
  rawValues: string[]; // one entry per existing column
  trailingChar: "," | ";"; // line terminator after the closing paren
}

function splitSqlLiterals(inner: string): string[] {
  // Split a parenthesised CSV of SQL literals (strings, bools, ints,
  // NULL). String literals may contain commas; we tokenise by
  // walking and respecting single-quote pairs. Escaped single quotes
  // ('') inside strings are handled by allowing toggling on '' to be
  // treated as a literal character (skipping forward two chars).
  const tokens: string[] = [];
  let depth = 0; // paren depth (in case of nested function calls — unlikely here)
  let inString = false;
  let buf = "";
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (inString) {
      buf += ch;
      if (ch === "'") {
        // Escaped quote: '' inside a string literal
        if (inner[i + 1] === "'") {
          buf += inner[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      buf += ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      buf += ch;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      buf += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      tokens.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) tokens.push(buf.trim());
  return tokens;
}

function parseColumnList(headerLine: string): string[] {
  const match = headerLine.match(/INSERT INTO players\s*\(([^)]+)\)\s*VALUES/i);
  if (!match) {
    throw new Error(`Could not parse column list from: ${headerLine}`);
  }
  return match[1].split(",").map(c => c.trim());
}

function parseValueRow(line: string): ParsedRow {
  // Lines look like: ('A', 'b', 'WR1', '2019-present', true, 'CHN', ...) ,
  // or ending in `;` for the last row. Whitespace-tolerant.
  const trimmed = line.trim();
  const lastChar = trimmed.slice(-1);
  if (lastChar !== "," && lastChar !== ";") {
    throw new Error(`Row missing trailing , or ;: ${line}`);
  }
  const innerStart = trimmed.indexOf("(");
  const innerEnd = trimmed.lastIndexOf(")");
  if (innerStart < 0 || innerEnd < 0) {
    throw new Error(`Row missing parens: ${line}`);
  }
  const inner = trimmed.slice(innerStart + 1, innerEnd);
  const rawValues = splitSqlLiterals(inner);
  return { rawValues, trailingChar: lastChar };
}

function parseBlock(lines: string[], headerLine: string): PlayerBlock {
  const headerIdx = lines.findIndex(l => l.trim() === headerLine.trim());
  if (headerIdx < 0) {
    throw new Error(`Block header not found: ${headerLine}`);
  }
  const insertIdx = lines.findIndex(
    (l, i) => i > headerIdx && /^INSERT INTO players\s*\(/i.test(l)
  );
  if (insertIdx < 0) {
    throw new Error(`INSERT line not found after header: ${headerLine}`);
  }
  const columns = parseColumnList(lines[insertIdx]);

  const items: BlockItem[] = [];
  let endIdx = insertIdx;
  let lastWasRow = false;
  for (let i = insertIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    // Tolerate intra-block comments and blank lines (the men's-women's
    // split has a `-- Top 25 Women's...` comment between row groups
    // that we want to preserve on round-trip). Blank lines are
    // dropped — comments are kept. The block ends at the `;`
    // terminator, not the first non-row line.
    if (trimmed === "") {
      endIdx = i;
      continue;
    }
    if (trimmed.startsWith("--")) {
      items.push({ kind: "comment", text: trimmed });
      endIdx = i;
      continue;
    }
    if (!trimmed.startsWith("(")) {
      break;
    }
    const row = parseValueRow(line);
    items.push({ kind: "row", row });
    lastWasRow = true;
    endIdx = i;
    if (row.trailingChar === ";") break;
  }
  const rowItems = items.filter(
    (it): it is { kind: "row"; row: ParsedRow } => it.kind === "row"
  );
  if (rowItems.length === 0) {
    throw new Error(`No rows found in block: ${headerLine}`);
  }
  if (!lastWasRow || rowItems[rowItems.length - 1].row.trailingChar !== ";") {
    throw new Error(`Block did not terminate with ; : ${headerLine}`);
  }
  return { startLineIndex: insertIdx, endLineIndex: endIdx, columns, items };
}

function unquote(literal: string): string {
  if (literal.length >= 2 && literal.startsWith("'") && literal.endsWith("'")) {
    return literal.slice(1, -1).replace(/''/g, "'");
  }
  return literal;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildSeedRow(parsed: ParsedRow, columns: string[]): SeedRow {
  const map: Partial<Record<ColumnName, string>> = {};
  for (let i = 0; i < columns.length; i += 1) {
    const col = columns[i];
    if ((CANONICAL_COLUMNS as readonly string[]).includes(col)) {
      map[col as ColumnName] = parsed.rawValues[i];
    }
  }
  return { values: map as Record<ColumnName, string> };
}

function extractIttfidsFromImageUpdates(seed: string): Map<string, number> {
  // Pattern: image_source_url = '...?playerId=N' ... WHERE slug = '...'
  const map = new Map<string, number>();
  const re =
    /image_source_url\s*=\s*'[^']*playerId=(\d+)[^']*'[\s\S]*?WHERE slug\s*=\s*'([a-z0-9-]+)'/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seed)) !== null) {
    map.set(m[2], Number(m[1]));
  }
  return map;
}

function formatHighestRating(existing: string, profile: IttfProfile): string {
  if (profile.peak_world_rank != null && profile.peak_rank_year != null) {
    return `WR${profile.peak_world_rank} (${profile.peak_rank_year})`;
  }
  return unquote(existing);
}

function renderRow(
  row: SeedRow,
  ittfid: number,
  profile: IttfProfile,
  trailingChar: "," | ";"
): string {
  const next: Record<ColumnName, string> = { ...row.values };
  next.ittfid = String(ittfid);
  next.birth_year =
    profile.birth_year != null ? String(profile.birth_year) : "NULL";
  next.highest_rating = quote(
    formatHighestRating(row.values.highest_rating, profile)
  );
  const cells = CANONICAL_COLUMNS.map(col => next[col]).join(", ");
  return `(${cells})${trailingChar}`;
}

function renderInsertHeader(): string {
  return `INSERT INTO players (${CANONICAL_COLUMNS.join(", ")}) VALUES`;
}

interface RenderedBlock {
  block: PlayerBlock;
  lines: string[]; // replacement lines from startLineIndex..endLineIndex
}

async function enrichBlock(
  block: PlayerBlock,
  ittfidsBySlug: Map<string, number>
): Promise<RenderedBlock> {
  const newLines: string[] = [renderInsertHeader()];
  for (const item of block.items) {
    if (item.kind === "comment") {
      newLines.push(item.text);
      continue;
    }
    const parsed = item.row;
    const row = buildSeedRow(parsed, block.columns);
    const slug = unquote(row.values.slug);
    const ittfid = ittfidsBySlug.get(slug) ?? RETIRED_ITTFID_OVERRIDES[slug];
    if (!ittfid) {
      throw new Error(
        `No ittfid for slug "${slug}" — add to RETIRED_ITTFID_OVERRIDES or commit a seed image first`
      );
    }
    const profile = await fetchIttfProfile(ittfid);
    const line = renderRow(row, ittfid, profile, parsed.trailingChar);
    newLines.push(line);
    process.stdout.write(
      `  ${slug.padEnd(28)} ittfid=${String(ittfid).padEnd(7)} birth=${
        profile.birth_year ?? "null"
      } peak=${
        profile.peak_world_rank ?? "null"
      }/${profile.peak_rank_year ?? "null"}\n`
    );
  }
  return { block, lines: newLines };
}

function spliceBlocks(seed: string, rendered: RenderedBlock[]): string {
  const lines = seed.split("\n");
  // Sort by startLineIndex descending so earlier splices don't shift
  // later indices.
  const sorted = [...rendered].sort(
    (a, b) => b.block.startLineIndex - a.block.startLineIndex
  );
  for (const r of sorted) {
    lines.splice(
      r.block.startLineIndex,
      r.block.endLineIndex - r.block.startLineIndex + 1,
      ...r.lines
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const seed = readFileSync(SEED_SQL, "utf8");
  const lines = seed.split("\n");

  const activeBlock = parseBlock(lines, ACTIVE_BLOCK_HEADER);
  const retiredBlock = parseBlock(lines, RETIRED_BLOCK_HEADER);
  const countRows = (b: PlayerBlock) =>
    b.items.filter(it => it.kind === "row").length;
  const totalRows = countRows(activeBlock) + countRows(retiredBlock);
  process.stdout.write(
    `Parsed ${countRows(activeBlock)} active + ${countRows(retiredBlock)} retired = ${totalRows} player rows.\n`
  );

  const ittfidsBySlug = extractIttfidsFromImageUpdates(seed);
  process.stdout.write(
    `Found ${ittfidsBySlug.size} ittfids in image_source_url updates.\n`
  );

  process.stdout.write("\nActive players:\n");
  const activeRendered = await enrichBlock(activeBlock, ittfidsBySlug);

  process.stdout.write("\nRetired players:\n");
  const retiredRendered = await enrichBlock(retiredBlock, ittfidsBySlug);

  const next = spliceBlocks(seed, [activeRendered, retiredRendered]);
  if (next === seed) {
    process.stdout.write("\nseed.sql unchanged — nothing to write.\n");
    return;
  }
  writeFileSync(SEED_SQL, next, "utf8");
  process.stdout.write(`\nWrote ${SEED_SQL}\n`);
}

main().catch(err => {
  process.stderr.write(`seed-player-data failed: ${(err as Error).message}\n`);
  process.exit(1);
});
