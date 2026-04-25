// Manifest read/write helpers. The manifest is the human-review
// artifact between scan and apply, so the format is committed JSON
// with stable keys and field ordering — diffs between scan runs need
// to be small enough to read.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const MANIFEST_VERSION = 1;

export type EntityKind = "player" | "equipment";

export interface ManifestCandidate {
  source: "wikidata-p18" | "enwiki-pageimage" | "wtt-headshot";
  filename: string;
  url: string;
  // For Commons: the file page on commons.wikimedia.org. For WTT:
  // the player profile page on worldtabletennis.com.
  filePageUrl: string;
  width: number | null;
  height: number | null;
  mime: string | null;
  size: number | null;
  license: string | null;
  licenseUrl: string | null;
  artistHtml: string | null;
  credit: string | null;
  attributionRequired: boolean;
  restrictions: string | null;
  freeLicense: boolean;
}

export interface ManifestEntry {
  id: string;
  kind: EntityKind;
  slug: string;
  name: string;
  wikidataId: string | null;
  enwikiUrl: string | null;
  candidates: ManifestCandidate[];
  // Filename of the chosen candidate, or null. Preserved across scan
  // runs so reviewer decisions stick.
  chosen: string | null;
  // Free-text reviewer notes. Preserved across scan runs.
  notes: string | null;
  // True when no candidate could be discovered. Drives reviewer
  // visibility ("show me what's missing").
  unresolved: boolean;
}

export interface Manifest {
  version: number;
  generatedAt: string;
  entries: Record<string, ManifestEntry>;
}

export function loadManifest(path: string): Manifest | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Manifest;
    if (parsed.version !== MANIFEST_VERSION) {
      throw new Error(
        `Manifest version mismatch: got ${parsed.version}, expected ${MANIFEST_VERSION}`
      );
    }
    return parsed;
  } catch (err) {
    throw new Error(
      `Failed to read manifest at ${path}: ${(err as Error).message}`
    );
  }
}

export function saveManifest(path: string, manifest: Manifest): void {
  mkdirSync(dirname(path), { recursive: true });
  // Sort entries by slug for deterministic diffs.
  const sorted: Record<string, ManifestEntry> = {};
  for (const slug of Object.keys(manifest.entries).sort()) {
    sorted[slug] = manifest.entries[slug];
  }
  const out: Manifest = { ...manifest, entries: sorted };
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n", "utf8");
}

// When merging fresh scan results onto a previous manifest we keep
// reviewer state (`chosen`, `notes`) but only if the choice is still
// represented in the new candidate list — otherwise the reviewer's
// pick is gone (file deleted on Commons, license changed, etc.) and
// we surface that via `notes`.
export function mergeEntry(
  prev: ManifestEntry | undefined,
  next: ManifestEntry
): ManifestEntry {
  if (!prev) return next;

  const prevChosenStillPresent =
    prev.chosen !== null &&
    next.candidates.some(c => c.filename === prev.chosen);

  if (prevChosenStillPresent) {
    return { ...next, chosen: prev.chosen, notes: prev.notes };
  }

  if (prev.chosen !== null) {
    const previousNote = prev.notes ?? "";
    const staleNote = `Previously chosen "${prev.chosen}" is no longer in candidates.`;
    return {
      ...next,
      chosen: null,
      notes: previousNote ? `${previousNote}\n${staleNote}` : staleNote,
    };
  }

  return { ...next, notes: prev.notes };
}
