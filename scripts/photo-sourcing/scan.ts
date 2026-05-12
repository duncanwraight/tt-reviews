// WTT sync scan — TT-36 (photos) + TT-200 (player import).
//
// One pass over the WTT roster does two jobs:
//
//   1. For every player already in the local DB, hunt up a headshot from
//      Wikidata + Commons + WTT and write candidate metadata to the
//      manifest. Same behaviour as the original photo-sourcing scan.
//
//   2. For every WTT roster entry NOT already in the local DB (matched
//      by ittfid first, then name), record a `kind: "new-player"`
//      manifest entry — name, country, gender from WTT + handedness,
//      grip, birth year scraped from the ITTF profile page. The reviewer
//      can flip `import` to "no" to skip individual rows.
//
// `apply.ts` reads the same manifest and turns it into seed.sql blocks
// (PLAYER-IMPORT inserts for new players, PHOTO-SOURCING-CREDITS image
// UPDATEs for existing + newly-imported players).
//
// Usage:
//   node --experimental-strip-types scripts/photo-sourcing/scan.ts
//   node --experimental-strip-types scripts/photo-sourcing/scan.ts --slug=lin-shidong
//   node --experimental-strip-types scripts/photo-sourcing/scan.ts --no-new-players
//
// Idempotent: rerunning preserves `chosen` / `notes` / `import` from the
// previous manifest; only candidate metadata + scraped fields refresh.

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
  type ProposedPlayer,
} from "./lib/manifest.ts";
import {
  findByName as findWttPlayerByName,
  loadRoster,
  wttProfileUrl,
  type WttPlayer,
} from "./lib/wtt.ts";
import { fetchIttfProfile } from "./lib/ittf.ts";

const MANIFEST_PATH = resolve(
  process.cwd(),
  "scripts/photo-sourcing/manifest.json"
);

interface CliOptions {
  slug: string | null;
  limit: number | null;
  newPlayers: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { slug: null, limit: null, newPlayers: true };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--slug=")) opts.slug = arg.slice("--slug=".length);
    else if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --limit: ${arg}`);
      }
      opts.limit = n;
    } else if (arg === "--no-new-players") {
      opts.newPlayers = false;
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
      "Usage: scan.ts [--slug=<slug>] [--limit=<n>] [--no-new-players]",
      "",
      "  --slug=<slug>      Process only the matching existing player.",
      "  --limit=<n>        Stop after n existing players (testing).",
      "  --no-new-players   Skip the WTT-roster-vs-DB discovery pass.",
      "                     Use when re-running purely to refresh photos.",
      "",
    ].join("\n")
  );
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  const supabase = createServiceClient();
  const allPlayers = await loadAllPlayers(supabase);
  let players = allPlayers;
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

  if (opts.newPlayers) {
    // Identify WTT-ranked roster entries that don't yet have a local
    // players row, scrape ITTF for handedness/grip/birth-year, and add
    // them to the manifest as `kind: "new-player"` rows. Reviewer
    // approves via `import: "yes"` (the default) per row.
    const newPlayerEntries = await discoverNewPlayers(allPlayers);
    for (const entry of newPlayerEntries) {
      next.entries[entry.slug] = mergeEntry(previousEntries[entry.slug], entry);
    }
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

  // WTT fallback. Prefer the ittfid we already have for this row; fall
  // back to name lookup for legacy rows that pre-date TT-196's ittfid
  // column.
  try {
    const wtt = await resolveWttForExisting(player);
    if (wtt && wtt.headShot) {
      candidates.push(buildWttCandidate(wtt));
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

  const auto = pickBest(candidates);
  if (auto) base.chosen = auto.filename;

  return base;
}

async function resolveWttForExisting(
  player: SeedPlayer
): Promise<WttPlayer | null> {
  if (player.ittfid !== null) {
    const roster = await loadRoster();
    return roster.find(r => r.ittfid === player.ittfid) ?? null;
  }
  return await findWttPlayerByName(player.name);
}

function buildWttCandidate(wtt: WttPlayer): ManifestCandidate {
  return {
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
  };
}

// Slug generation matches app/lib/revspin.server.ts:generateSlug — same
// rules so manually-created players from the public flow and importer-
// created players land on the same shape of slug.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Normalise a roster entry's full name into "Title-cased Words" so the
// players row reads naturally. WTT publishes ALL-CAPS surnames
// ("WANG Chuqin"); we want "Wang Chuqin".
function normaliseRosterName(fullName: string): string {
  const tokens = fullName.split(/\s+/).filter(t => t.length > 0);
  const cased = tokens.map(token => {
    if (token.length > 1 && token === token.toUpperCase()) {
      return token.charAt(0) + token.slice(1).toLowerCase();
    }
    return token;
  });
  return cased.join(" ");
}

function normaliseForDedupe(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeKey(name: string, represents: string | null): string {
  const country = (represents ?? "").toUpperCase().trim();
  return `${normaliseForDedupe(name)}|${country}`;
}

async function discoverNewPlayers(
  existing: SeedPlayer[]
): Promise<ManifestEntry[]> {
  const roster = await loadRoster();

  const knownIttfids = new Set<number>();
  const knownDedupeKeys = new Set<string>();
  const usedSlugs = new Set<string>();
  for (const p of existing) {
    if (p.ittfid !== null) knownIttfids.add(p.ittfid);
    knownDedupeKeys.add(dedupeKey(p.name, p.represents));
    usedSlugs.add(p.slug);
  }

  const newEntries: WttPlayer[] = [];
  for (const r of roster) {
    if (knownIttfids.has(r.ittfid)) continue;
    const displayName = normaliseRosterName(r.fullName);
    if (knownDedupeKeys.has(dedupeKey(displayName, r.nationality))) continue;
    newEntries.push(r);
  }

  if (newEntries.length === 0) {
    process.stdout.write("\nNo new WTT roster entries vs local DB.\n");
    return [];
  }

  process.stdout.write(
    `\nDiscovered ${newEntries.length} new WTT roster entries; fetching ITTF profiles...\n`
  );

  const results: ManifestEntry[] = [];
  let i = 0;
  for (const r of newEntries) {
    i += 1;
    const displayName = normaliseRosterName(r.fullName);
    const slug = uniqueSlug(slugify(displayName), usedSlugs);
    usedSlugs.add(slug);

    process.stdout.write(
      `  [${i}/${newEntries.length}] ${displayName} (${r.ittfid}) → ${slug}\n`
    );

    let handedness: "left" | "right" | null = null;
    let grip: "shakehand" | "penhold" | null = null;
    let birthYear: number | null = null;
    let ittfNote: string | null = null;
    try {
      const profile = await fetchIttfProfile(r.ittfid);
      handedness = profile.handedness;
      grip = profile.grip;
      birthYear = profile.birth_year;
    } catch (err) {
      ittfNote = `ITTF lookup failed: ${(err as Error).message}`;
    }

    const proposed: ProposedPlayer = {
      ittfid: r.ittfid,
      represents: r.nationality.length === 3 ? r.nationality : null,
      birth_country: null,
      gender: r.gender === "M" || r.gender === "F" ? r.gender : null,
      handedness,
      grip,
      birth_year: birthYear,
      active_years: null,
      highest_rating: null,
      wtt_profile_url: wttProfileUrl(r.ittfid),
    };

    const candidates: ManifestCandidate[] = [];
    if (r.headShot) candidates.push(buildWttCandidate(r));

    const entry: ManifestEntry = {
      id: `new-player:${r.ittfid}`,
      kind: "new-player",
      slug,
      name: displayName,
      wikidataId: null,
      enwikiUrl: null,
      candidates,
      chosen: candidates.length > 0 ? candidates[0].filename : null,
      notes: ittfNote,
      unresolved: candidates.length === 0,
      proposed,
      import: "yes",
    };
    results.push(entry);
  }

  return results;
}

function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`Slug collision exhausted for base="${base}"`);
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
  const wtt = candidates.find(c => c.source === "wtt-headshot");
  if (wtt) return wtt;

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
  const newPlayers = all.filter(e => e.kind === "new-player");
  const newPlayersToImport = newPlayers.filter(e => e.import === "yes");

  process.stdout.write(
    [
      "",
      `Manifest written to ${MANIFEST_PATH}`,
      `  ${resolved}/${total} entities have at least one candidate`,
      `  ${chosen}/${total} have an auto-picked image`,
      `  ${newPlayers.length} new-player entries (${newPlayersToImport.length} marked import: yes)`,
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
