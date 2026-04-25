// Player photo discovery — TT-36.
//
// Reads players from the local Supabase, asks Wikidata for each player,
// pulls the P18 image (or falls back to enwiki pageimage) from Commons
// with full license metadata, and writes a reviewable manifest.
//
// Usage:
//   node --experimental-strip-types scripts/photo-sourcing/scan.ts
//   node --experimental-strip-types scripts/photo-sourcing/scan.ts --slug=lin-shidong
//
// Idempotent: rerunning preserves `chosen` / `notes` from the previous
// manifest; only candidate metadata is refreshed.

import { resolve } from "node:path";
import {
  createServiceClient,
  loadAllPlayers,
  type SeedPlayer,
} from "./lib/db.ts";
import {
  fetchCommonsImageInfo,
  fetchEnwikiPageImage,
  isFreeLicense,
  searchWikidataPlayer,
  type CommonsImageInfo,
  type WikidataEntity,
} from "./lib/wikimedia.ts";
import {
  loadManifest,
  mergeEntry,
  MANIFEST_VERSION,
  saveManifest,
  type Manifest,
  type ManifestCandidate,
  type ManifestEntry,
} from "./lib/manifest.ts";
import { findByName as findWttPlayer, wttProfileUrl } from "./lib/wtt.ts";

const MANIFEST_PATH = resolve(
  process.cwd(),
  "scripts/photo-sourcing/manifest.json"
);

interface CliOptions {
  slug: string | null;
  limit: number | null;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { slug: null, limit: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--slug=")) opts.slug = arg.slice("--slug=".length);
    else if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --limit: ${arg}`);
      }
      opts.limit = n;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: scan.ts [--slug=<slug>] [--limit=<n>]",
      "",
      "  --slug=<slug>   Process only the matching player (useful for retry).",
      "  --limit=<n>     Stop after n players (useful for testing).",
      "",
    ].join("\n")
  );
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  const supabase = createServiceClient();
  let players = await loadAllPlayers(supabase);
  if (opts.slug) {
    players = players.filter(p => p.slug === opts.slug);
    if (players.length === 0) {
      throw new Error(`No player found with slug=${opts.slug}`);
    }
  }
  if (opts.limit !== null) {
    players = players.slice(0, opts.limit);
  }

  const previous = loadManifest(MANIFEST_PATH);
  const previousEntries = previous?.entries ?? {};

  const next: Manifest = {
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    entries: { ...previousEntries },
  };

  let i = 0;
  for (const player of players) {
    i += 1;
    process.stdout.write(
      `[${i}/${players.length}] ${player.name} (${player.slug})\n`
    );
    const entry = await buildEntry(player);
    next.entries[player.slug] = mergeEntry(previousEntries[player.slug], entry);
  }

  saveManifest(MANIFEST_PATH, next);

  printSummary(next);
}

async function buildEntry(player: SeedPlayer): Promise<ManifestEntry> {
  const base: ManifestEntry = {
    id: player.id,
    kind: "player",
    slug: player.slug,
    name: player.name,
    wikidataId: null,
    enwikiUrl: null,
    candidates: [],
    chosen: null,
    notes: null,
    unresolved: true,
  };

  const candidates: ManifestCandidate[] = [];
  const seenFilenames = new Set<string>();
  const remember = (...names: Array<string | null>): void => {
    for (const n of names) if (n) seenFilenames.add(normalizeFilename(n));
  };

  let entity: WikidataEntity | null = null;
  try {
    entity = await searchWikidataPlayer(player.name);
  } catch (err) {
    base.notes = `Wikidata search failed: ${(err as Error).message}`;
  }

  if (entity) {
    base.wikidataId = entity.id;
    base.enwikiUrl = entity.enwikiUrl;

    if (entity.imageFilename) {
      const candidate = await commonsCandidate(
        entity.imageFilename,
        "wikidata-p18"
      );
      if (candidate) {
        candidates.push(candidate);
        remember(entity.imageFilename, candidate.filename);
      }
    }

    if (entity.enwikiTitle) {
      let pageImage: string | null = null;
      try {
        pageImage = await fetchEnwikiPageImage(entity.enwikiTitle);
      } catch {
        // Treat enwiki failure as non-fatal — we still might have P18.
      }
      if (pageImage && !seenFilenames.has(normalizeFilename(pageImage))) {
        const candidate = await commonsCandidate(pageImage, "enwiki-pageimage");
        if (
          candidate &&
          !seenFilenames.has(normalizeFilename(candidate.filename))
        ) {
          candidates.push(candidate);
          remember(pageImage, candidate.filename);
        }
      }
    }
  }

  // WTT fallback. We always *record* a WTT candidate so the manifest
  // shows it in the candidates list, but it only gets auto-picked when
  // no free-licensed Commons candidate exists. WTT photos have no
  // explicit license — we keep the legally-cleaner Commons photo where
  // we have one.
  try {
    const wtt = await findWttPlayer(player.name);
    if (wtt && wtt.headShot) {
      candidates.push({
        source: "wtt-headshot",
        filename: `wtt:${wtt.ittfid}`,
        url: wtt.headShot,
        filePageUrl: wttProfileUrl(wtt.ittfid),
        width: null,
        height: null,
        mime: null,
        size: null,
        license: null,
        licenseUrl: null,
        artistHtml: "World Table Tennis",
        credit: "World Table Tennis",
        attributionRequired: true,
        restrictions: null,
        freeLicense: false,
      });
    }
  } catch (err) {
    base.notes = base.notes
      ? `${base.notes}\nWTT lookup failed: ${(err as Error).message}`
      : `WTT lookup failed: ${(err as Error).message}`;
  }

  base.candidates = candidates;
  base.unresolved = candidates.length === 0;

  if (candidates.length === 0) {
    base.notes = base.notes ?? "No Wikimedia or WTT match.";
    return base;
  }

  // Auto-pick: prefer free-licensed Commons; fall back to WTT.
  const auto = pickBest(candidates);
  if (auto) base.chosen = auto.filename;

  return base;
}

async function commonsCandidate(
  filename: string,
  source: ManifestCandidate["source"]
): Promise<ManifestCandidate | null> {
  let info: CommonsImageInfo | null = null;
  try {
    info = await fetchCommonsImageInfo(filename);
  } catch {
    return null;
  }
  if (!info) return null;

  return {
    source,
    filename: info.filename,
    url: info.url,
    filePageUrl: info.filePageUrl,
    width: info.width,
    height: info.height,
    mime: info.mime,
    size: info.size,
    license: info.license,
    licenseUrl: info.licenseUrl,
    artistHtml: info.artistHtml,
    credit: info.credit,
    attributionRequired: info.attributionRequired,
    restrictions: info.restrictions,
    freeLicense: isFreeLicense(info.license),
  };
}

// Filenames returned by the various Commons/enwiki endpoints differ
// in space-vs-underscore and percent-encoding, so we compare on a
// canonical form before deciding two candidates are the same file.
function normalizeFilename(name: string): string {
  return decodeURIComponent(name.replace(/_/g, " ")).trim().toLowerCase();
}

function pickBest(candidates: ManifestCandidate[]): ManifestCandidate | null {
  // WTT first — consistent, current, official headshots give the player
  // pages a uniform look. Reviewer can override `chosen` to a Commons
  // candidate per row when they specifically want the free-licensed one.
  const wtt = candidates.find(c => c.source === "wtt-headshot");
  if (wtt) return wtt;

  // Fallback: highest-resolution free-licensed Commons candidate.
  // Used when a player isn't on the WTT roster (e.g. retired or
  // non-ranked players we may add to the seed later).
  const free = candidates.filter(c => c.freeLicense);
  if (free.length === 0) return null;
  return free.sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === "wikidata-p18" ? -1 : 1;
    }
    return (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0);
  })[0];
}

function printSummary(manifest: Manifest): void {
  const all = Object.values(manifest.entries);
  const total = all.length;
  const resolved = all.filter(e => !e.unresolved).length;
  const chosen = all.filter(e => e.chosen !== null).length;
  const unresolved = all.filter(e => e.unresolved);

  process.stdout.write(
    [
      "",
      `Manifest written to ${MANIFEST_PATH}`,
      `  ${resolved}/${total} entities have at least one candidate`,
      `  ${chosen}/${total} have an auto-picked image`,
      "",
    ].join("\n")
  );

  if (unresolved.length > 0) {
    process.stdout.write("Unresolved (no candidate):\n");
    for (const entry of unresolved) {
      process.stdout.write(`  - ${entry.slug} (${entry.name})\n`);
    }
  }
}

main().catch(err => {
  process.stderr.write(`scan failed: ${(err as Error).message}\n`);
  process.exit(1);
});
