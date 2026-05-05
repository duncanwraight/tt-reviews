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
import { type ResolvedCandidate } from "./brave.server";
import { braveProvider } from "./providers/brave";
import type { Provider } from "./providers/types";
import { recordPhotoEvent } from "./events.server";
import { Logger, createLogContext } from "../logger.server";

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
  status: "sourced" | "no-candidates";
  // image_key reflects the row state at the start of this sourcing run.
  // Consumers gate auto-pick on `image_key === null` so a row that
  // already has a published image (e.g. an admin-triggered re-queue
  // preserving the live image) lands in the review queue instead of
  // silently swapping the photo via pickCandidate's losers cleanup.
  equipment: {
    id: string;
    slug: string;
    name: string;
    image_key: string | null;
  };
  candidates: SourcedCandidate[];
  // Set when status === "sourced"; reflects what got inserted (after
  // de-duplication against existing pending candidates for this row).
  insertedCount: number;
  // Per-provider outcome status. Lets the queue consumer decide whether
  // a 'no-candidates' result is genuine (all providers said 'ok') or
  // transient (a provider was rate_limited / out_of_budget) and worth
  // re-queueing.
  providerStatuses: Array<{
    name: string;
    status: "ok" | "rate_limited" | "out_of_budget";
  }>;
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
  // Defaults to a UUID; overridable for tests so candidate keys are
  // deterministic.
  randomId?: () => string;
  // Event-log writer; defaults to recordPhotoEvent. Tests stub this to
  // assert which events fired without mocking the full Supabase chain.
  recordEvent?: typeof recordPhotoEvent;
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

// Source candidates for one equipment row. Resolve via providers → for
// each candidate download bytes (skip on failure), upload to R2 under
// equipment/<slug>/cand/<uuid>.<ext>, dedupe against existing pending
// rows by source_url, insert. Updates equipment.image_sourcing_attempted_at
// on completion so bulk-source (TT-53) doesn't pick the row up again.
//
// Pipeline state ("does this row need work?") is read from the candidate
// table, not encoded as a flag on the call. The cron path pre-filters
// `image_key IS NULL` before invoking this; the per-row admin re-queue
// path means "the admin asked, run it." Both cases want providers to
// run, so there's no image_key short-circuit here.
export async function sourcePhotosForEquipment(
  supabase: SupabaseClient,
  bucket: R2PutBucket,
  env: SourcingEnv,
  slug: string,
  options: {
    limit?: number;
    deps?: SourcingDeps;
    providers?: Provider[];
    triggeredBy?: string;
  } = {}
): Promise<SourcingResult> {
  const deps = options.deps ?? {};
  const fetchImpl = deps.fetchImpl ?? fetch;
  const randomId = deps.randomId ?? defaultRandomId;
  const recordEvent = deps.recordEvent ?? recordPhotoEvent;
  const providers = options.providers ?? [braveProvider];
  const triggeredBy = options.triggeredBy ?? "cron";

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

  await recordEvent(supabase, {
    equipmentId: row.id,
    eventKind: "sourcing_attempted",
    metadata: { triggered_by: triggeredBy },
  });

  const limit = options.limit ?? DEFAULT_LIMIT;
  const seed = {
    slug: row.slug,
    name: row.name,
    manufacturer: row.manufacturer,
    category: row.category,
  };

  // Run all providers in parallel; merge their candidate lists. Each
  // provider's status is logged but the overall pipeline still runs
  // as long as at least one returned 'ok' with candidates. TT-90 will
  // wire 'rate_limited'/'out_of_budget' into queue retry semantics
  // (re-queue with delay rather than swallow).
  const providerOutcomes = await Promise.all(
    providers.map(async p => {
      try {
        const result = await p.resolveCandidates(seed, env, {
          limit,
          fetchImpl,
        });
        return { name: p.name, ...result };
      } catch (err) {
        Logger.error(
          "provider resolve failed",
          createLogContext("photo-sourcing-provider", {
            provider: p.name,
            slug: row.slug,
          }),
          err instanceof Error ? err : undefined
        );
        return {
          name: p.name,
          status: "ok" as const,
          candidates: [] as ResolvedCandidate[],
        };
      }
    })
  );

  // Merge + dedupe by image URL (different providers may return the
  // same image). Trailing-match wins over loose; tier ascending wins
  // ties — same rule rankCandidates would apply, but applied here at
  // dedupe time so we keep the better classification when both hit.
  const byImageUrl = new Map<string, ResolvedCandidate>();
  for (const outcome of providerOutcomes) {
    for (const candidate of outcome.candidates) {
      const key = candidate.imageUrl;
      if (!key) continue;
      const existing = byImageUrl.get(key);
      if (!existing) {
        byImageUrl.set(key, candidate);
        continue;
      }
      const existingScore =
        (existing.match === "trailing" ? 0 : 1000) + existing.tier;
      const candidateScore =
        (candidate.match === "trailing" ? 0 : 1000) + candidate.tier;
      if (candidateScore < existingScore) {
        byImageUrl.set(key, candidate);
      }
    }
  }

  // Re-rank: trailing-first, then tier ascending. Stable.
  const merged = [...byImageUrl.values()].sort((a, b) => {
    const aTrail = a.match === "trailing" ? 0 : 1;
    const bTrail = b.match === "trailing" ? 0 : 1;
    if (aTrail !== bTrail) return aTrail - bTrail;
    return a.tier - b.tier;
  });

  const resolved = merged.slice(0, limit);

  const providerStatuses = providerOutcomes.map(o => ({
    name: o.name,
    status: o.status,
  }));
  const allProvidersOk = providerOutcomes.every(o => o.status === "ok");

  if (resolved.length === 0) {
    // Stamp attempted_at only when every provider returned 'ok' — i.e.,
    // we genuinely got back zero matches. If any provider was rate-
    // limited / out-of-budget, leave the column null so the queue can
    // re-run the row when budgets reset (TT-91 retry path).
    if (allProvidersOk) {
      await supabase
        .from("equipment")
        .update({ image_sourcing_attempted_at: new Date().toISOString() })
        .eq("id", row.id);
      await recordEvent(supabase, {
        equipmentId: row.id,
        eventKind: "no_candidates",
        metadata: { provider_outcomes: providerStatuses },
      });
    }
    return {
      status: "no-candidates",
      equipment: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        image_key: row.image_key,
      },
      candidates: [],
      insertedCount: 0,
      providerStatuses,
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

  if (candidates.length > 0) {
    await recordEvent(supabase, {
      equipmentId: row.id,
      eventKind: "candidates_found",
      metadata: {
        inserted_count: candidates.length,
        provider_outcomes: providerStatuses,
      },
    });
  }

  return {
    status: "sourced",
    equipment: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      image_key: row.image_key,
    },
    candidates,
    insertedCount: candidates.length,
    providerStatuses,
  };
}
