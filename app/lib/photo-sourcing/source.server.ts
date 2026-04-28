// Sourcing pipeline: Brave resolver → fetch image bytes → upload to
// R2 → insert candidate rows. Pure orchestration; the resolver, R2
// bucket, and Supabase client are all injected so the route action
// stays thin and the service is unit-testable.
//
// Why R2 (not Cloudflare Images storage): we already pay for R2 for
// player photos, and Cloudflare Image Resizing applies the variant
// transformations on read from any source — no need for a separate
// image store. See docs/IMAGES.md for the render path.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveBraveCandidates,
  type EquipmentSeed,
  type ResolvedCandidate,
} from "./brave.server";

const DEFAULT_LIMIT = 6;
const DOWNLOAD_TIMEOUT_MS = 8000;

const DOWNLOAD_USER_AGENT =
  "tt-reviews-photo-sourcer/0.1 (+https://tabletennis.reviews; duncan@wraight-consulting.co.uk)";

export interface SourcingEnv {
  BRAVE_SEARCH_API_KEY: string;
}

export interface SourcedCandidate {
  id: string;
  r2_key: string;
  source_url: string | null;
  image_source_host: string | null;
  source_label: string | null;
  match_kind: "trailing" | "loose";
  tier: number;
  width: number | null;
  height: number | null;
}

export interface SourcingResult {
  status: "sourced" | "already-imaged" | "no-candidates";
  equipment: { id: string; slug: string; name: string };
  candidates: SourcedCandidate[];
  // Set when status === "sourced"; reflects what got inserted (after
  // de-duplication against existing pending candidates for this row).
  insertedCount: number;
}

// Minimal R2 surface so the lib doesn't depend on the cloudflare-
// workers types in test contexts. The real R2Bucket binding satisfies
// this shape.
export interface R2PutBucket {
  put(
    key: string,
    body: ArrayBuffer | Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<unknown>;
}

export interface SourcingDeps {
  // Default `fetch` works in Workers + node; injected so tests can stub.
  fetchImpl?: typeof fetch;
  // Defaults to the lib's resolver; overridable for tests.
  resolve?: (
    item: EquipmentSeed,
    apiKey: string,
    options: { limit?: number; fetchImpl?: typeof fetch }
  ) => Promise<ResolvedCandidate[]>;
  // Defaults to a UUID; overridable for tests so candidate keys are
  // deterministic.
  randomId?: () => string;
}

interface EquipmentRow {
  id: string;
  slug: string;
  name: string;
  manufacturer: string;
  category: string;
  image_key: string | null;
}

async function fetchImageBytes(
  url: string,
  fetchImpl: typeof fetch
): Promise<{ bytes: ArrayBuffer; contentType: string | null } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": DOWNLOAD_USER_AGENT, Accept: "image/*" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) return null;
    return { bytes, contentType: res.headers.get("content-type") };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extensionFromContentType(
  ct: string | null,
  fallbackUrl: string
): string {
  const fromCt = (ct ?? "").split(";")[0].trim().toLowerCase();
  if (fromCt === "image/jpeg" || fromCt === "image/jpg") return "jpg";
  if (fromCt === "image/png") return "png";
  if (fromCt === "image/webp") return "webp";
  if (fromCt === "image/gif") return "gif";
  // Fall back to URL extension.
  try {
    const u = new URL(fallbackUrl);
    const m = u.pathname.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/);
    if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  } catch {
    // ignore
  }
  return "bin";
}

function defaultRandomId(): string {
  // crypto.randomUUID() is available in both Workers and modern node.
  return crypto.randomUUID();
}

// Source candidates for one equipment row. Orchestrates: short-circuit
// when image already chosen → resolve via Brave → for each candidate
// download bytes (skip on failure), upload to R2 under
// equipment/<slug>/cand/<uuid>.<ext>, dedupe against existing pending
// rows by source_url, insert. Updates equipment.image_sourcing_attempted_at
// on completion so bulk-source (TT-53) doesn't pick the row up again.
export async function sourcePhotosForEquipment(
  supabase: SupabaseClient,
  bucket: R2PutBucket,
  env: SourcingEnv,
  slug: string,
  options: { limit?: number; deps?: SourcingDeps } = {}
): Promise<SourcingResult> {
  const deps = options.deps ?? {};
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolve = deps.resolve ?? resolveBraveCandidates;
  const randomId = deps.randomId ?? defaultRandomId;

  const { data: equipment, error: equipmentError } = await supabase
    .from("equipment")
    .select("id, slug, name, manufacturer, category, image_key")
    .eq("slug", slug)
    .maybeSingle();

  if (equipmentError) {
    throw new Error(`equipment lookup failed: ${equipmentError.message}`);
  }
  if (!equipment) {
    throw new Error(`equipment not found: ${slug}`);
  }

  const row = equipment as EquipmentRow;

  if (row.image_key) {
    const { data: existing } = await supabase
      .from("equipment_photo_candidates")
      .select("*")
      .eq("equipment_id", row.id)
      .is("picked_at", null);
    return {
      status: "already-imaged",
      equipment: { id: row.id, slug: row.slug, name: row.name },
      candidates: (existing ?? []) as SourcedCandidate[],
      insertedCount: 0,
    };
  }

  const limit = options.limit ?? DEFAULT_LIMIT;
  const resolved = await resolve(
    {
      slug: row.slug,
      name: row.name,
      manufacturer: row.manufacturer,
      category: row.category,
    },
    env.BRAVE_SEARCH_API_KEY,
    { limit, fetchImpl }
  );

  if (resolved.length === 0) {
    await supabase
      .from("equipment")
      .update({ image_sourcing_attempted_at: new Date().toISOString() })
      .eq("id", row.id);
    return {
      status: "no-candidates",
      equipment: { id: row.id, slug: row.slug, name: row.name },
      candidates: [],
      insertedCount: 0,
    };
  }

  const { data: existingRows } = await supabase
    .from("equipment_photo_candidates")
    .select("source_url")
    .eq("equipment_id", row.id)
    .is("picked_at", null);
  const seenUrls = new Set(
    ((existingRows as Array<{ source_url: string | null }> | null) ?? [])
      .map(r => r.source_url)
      .filter((u): u is string => !!u)
  );

  // Pre-filter dedupe: drop candidates whose pageUrl matches an existing
  // pending row, AND drop within-list duplicates (keep first). The
  // original loop did this incrementally via `seenUrls.add` mid-iter —
  // doing it up-front lets us run downloads in parallel without losing
  // dedupe semantics.
  const dedupSeen = new Set(seenUrls);
  const filtered = resolved.filter(candidate => {
    if (!candidate.pageUrl) return true;
    if (dedupSeen.has(candidate.pageUrl)) return false;
    dedupSeen.add(candidate.pageUrl);
    return true;
  });

  type Insert = Omit<SourcedCandidate, "id"> & { equipment_id: string };

  // Parallel downloads + R2 PUTs. `resolved` is already capped at
  // DEFAULT_LIMIT (6 by default) so Promise.all bounds the concurrency
  // naturally. randomId() is called only after a successful download to
  // preserve the original "no UUID burned for failed downloads" order.
  const outcomes = await Promise.all(
    filtered.map(async (candidate): Promise<Insert | null> => {
      const downloaded = await fetchImageBytes(candidate.imageUrl, fetchImpl);
      if (!downloaded) return null;

      const ext = extensionFromContentType(
        downloaded.contentType,
        candidate.imageUrl
      );
      const r2Key = `equipment/${row.slug}/cand/${randomId()}.${ext}`;

      try {
        await bucket.put(r2Key, downloaded.bytes, {
          httpMetadata: {
            contentType: downloaded.contentType ?? "application/octet-stream",
          },
          customMetadata: {
            equipment_id: row.id,
            equipment_slug: row.slug,
            source_label: candidate.tierLabel,
            source_host: candidate.host,
            uploadedAt: new Date().toISOString(),
          },
        });
      } catch {
        return null;
      }

      return {
        equipment_id: row.id,
        r2_key: r2Key,
        source_url: candidate.pageUrl,
        image_source_host: candidate.host || null,
        source_label: candidate.tierLabel,
        match_kind: candidate.match,
        tier: candidate.tier,
        width: null,
        height: null,
      };
    })
  );

  const inserts = outcomes.filter((o): o is Insert => o !== null);

  let candidates: SourcedCandidate[] = [];
  if (inserts.length > 0) {
    const { data: insertedRows, error: insertError } = await supabase
      .from("equipment_photo_candidates")
      .insert(inserts)
      .select("*");
    if (insertError) {
      throw new Error(`candidate insert failed: ${insertError.message}`);
    }
    candidates = (insertedRows ?? []) as SourcedCandidate[];
  }

  await supabase
    .from("equipment")
    .update({ image_sourcing_attempted_at: new Date().toISOString() })
    .eq("id", row.id);

  return {
    status: "sourced",
    equipment: { id: row.id, slug: row.slug, name: row.name },
    candidates,
    insertedCount: candidates.length,
  };
}
