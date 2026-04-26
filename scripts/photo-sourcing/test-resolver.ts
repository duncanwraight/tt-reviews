// Live smoke test for the Brave Image Search resolver. Hits Brave for
// real (rate-limited at 1 req/s), prints what each TEST_MANUFACTURERS
// sample resolved to, and exits 0 even on partial failure — purely
// diagnostic. The actual algorithm and unit coverage live in
// `app/lib/photo-sourcing/brave.server.ts` /
// `app/lib/photo-sourcing/__tests__/brave.test.ts`.
//
// Usage:
//   node --experimental-strip-types scripts/photo-sourcing/test-resolver.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServiceClient } from "./lib/db.ts";
import {
  buildBraveQuery,
  braveImageSearchRaw,
  evalCandidate,
  pickBest,
  type EquipmentSeed,
} from "../../app/lib/photo-sourcing/brave.server.ts";

const TEST_MANUFACTURERS = [
  "Butterfly",
  "Stiga",
  "Yasaka",
  "Donic",
  "Tibhar",
  "Xiom",
  "Victas",
  "Nittaku",
  "DHS",
  "Yinhe (Galaxy/Milkyway)",
  "Sauer & Troger",
  "Dr. Neubauer",
  "SpinLord",
  "Metall TT",
];

function loadBraveKey(): string {
  if (process.env.BRAVE_SEARCH_API_KEY) return process.env.BRAVE_SEARCH_API_KEY;
  const path = resolve(process.cwd(), ".dev.vars");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error("BRAVE_SEARCH_API_KEY not set and .dev.vars not readable");
  }
  const match = raw.match(/^BRAVE_SEARCH_API_KEY=(.+)$/m);
  if (!match) {
    throw new Error("BRAVE_SEARCH_API_KEY not present in .dev.vars");
  }
  return match[1].trim();
}

const BRAVE_KEY = loadBraveKey();
const BRAVE_GAP_MS = 1100;
let lastBraveAt = 0;

async function rateLimitedSearch(query: string) {
  const wait = lastBraveAt + BRAVE_GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastBraveAt = Date.now();
  return braveImageSearchRaw(query, BRAVE_KEY);
}

async function pickSamples(): Promise<EquipmentSeed[]> {
  const supabase = createServiceClient();
  const samples: EquipmentSeed[] = [];
  for (const manufacturer of TEST_MANUFACTURERS) {
    const { data, error } = await supabase
      .from("equipment")
      .select("slug, name, manufacturer, category")
      .eq("manufacturer", manufacturer)
      .order("name", { ascending: true })
      .limit(1);
    if (error) {
      process.stderr.write(`  warn: ${manufacturer} → ${error.message}\n`);
      continue;
    }
    if (data && data.length > 0) samples.push(data[0] as EquipmentSeed);
    else process.stderr.write(`  warn: no rows for ${manufacturer}\n`);
  }
  return samples;
}

function shorten(url: string, max = 88): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 3)}...`;
}

async function main(): Promise<void> {
  const samples = await pickSamples();
  process.stdout.write(`Testing ${samples.length} items.\n\n`);

  let trailing = 0;
  let loose = 0;
  let unresolved = 0;
  for (const item of samples) {
    const query = buildBraveQuery(item);
    process.stdout.write(`---\n`);
    process.stdout.write(
      `${item.manufacturer} — ${item.name} (${item.category})\n`
    );
    process.stdout.write(`  query: "${query}"\n`);

    let results;
    try {
      results = await rateLimitedSearch(query);
    } catch (err) {
      process.stdout.write(`  brave error: ${(err as Error).message}\n\n`);
      unresolved += 1;
      continue;
    }
    if (results.length === 0) {
      process.stdout.write(`  no Brave image results\n\n`);
      unresolved += 1;
      continue;
    }

    const evaluated = results.map(r => evalCandidate(item, r));
    const tCount = evaluated.filter(c => c.match === "trailing").length;
    const lCount = evaluated.filter(c => c.match === "loose").length;
    const noProd = evaluated.filter(c => c.match === "no-product").length;
    const noManu = evaluated.filter(c => c.match === "no-manufacturer").length;
    process.stdout.write(
      `  candidates: ${tCount} trailing, ${lCount} loose, ${noProd} no-product, ${noManu} no-manufacturer\n`
    );

    const accepted = evaluated.filter(
      c => c.match === "trailing" || c.match === "loose"
    );
    for (const c of accepted.slice(0, 4)) {
      const tag = c.match === "trailing" ? "★" : "·";
      process.stdout.write(
        `    ${tag} [${c.tierLabel}] ${shorten(c.result.imageUrl ?? "")}\n`
      );
    }

    const best = pickBest(evaluated);
    if (best) {
      if (best.match === "trailing") {
        trailing += 1;
        process.stdout.write(
          `  → pick (trailing): [${best.tierLabel}] ${shorten(best.result.imageUrl ?? "")}\n`
        );
      } else {
        loose += 1;
        process.stdout.write(
          `  → pick (loose):    [${best.tierLabel}] ${shorten(best.result.imageUrl ?? "")}\n`
        );
      }
    } else {
      unresolved += 1;
      process.stdout.write(`  → unresolved (no product+manufacturer match)\n`);
    }
    process.stdout.write("\n");
  }

  process.stdout.write(
    `Summary: ${trailing} trailing pick, ${loose} loose pick, ${unresolved} unresolved (of ${samples.length}).\n`
  );
}

main().catch(err => {
  process.stderr.write(`test-resolver failed: ${(err as Error).message}\n`);
  process.exit(1);
});
