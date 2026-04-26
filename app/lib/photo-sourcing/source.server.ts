// Sourcing pipeline: Brave resolver → fetch image bytes → upload to
// Cloudflare Images → insert candidate rows. Pure orchestration; the
// resolver, CF Images helpers, and Supabase client are all injected so
// the route action stays thin and the service is unit-testable.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveBraveCandidates,
  type EquipmentSeed,
  type ResolvedCandidate,
} from "./brave.server";
import {
  uploadImageToCloudflare,
  type CloudflareImagesEnv,
  type CloudflareImageUploadResult,
} from "../images/cloudflare";

const DEFAULT_LIMIT = 6;
const DOWNLOAD_TIMEOUT_MS = 8000;

const DOWNLOAD_USER_AGENT =
  "tt-reviews-photo-sourcer/0.1 (+https://tabletennis.reviews; duncan@wraight-consulting.co.uk)";

export interface SourcingEnv extends CloudflareImagesEnv {
  BRAVE_SEARCH_API_KEY: string;
}

export interface SourcedCandidate {
  id: string;
  cf_image_id: string;
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

export interface SourcingDeps {
  // Default `fetch` works in Workers + node; injected so tests can stub.
  fetchImpl?: typeof fetch;
  // Defaults to the lib's resolver; overridable for tests.
  resolve?: (
    item: EquipmentSeed,
    apiKey: string,
    options: { limit?: number; fetchImpl?: typeof fetch }
  ) => Promise<ResolvedCandidate[]>;
  // Defaults to the lib's CF Images upload; overridable for tests.
  upload?: (
    env: CloudflareImagesEnv,
    bytes: ArrayBuffer | Uint8Array | Blob,
    options?: {
      filename?: string;
      contentType?: string;
      metadata?: Record<string, string>;
    }
  ) => Promise<CloudflareImageUploadResult>;
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

function filenameFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last && /\.[a-z0-9]+$/i.test(last)) return last;
    return fallback;
  } catch {
    return fallback;
  }
}

// Source candidates for one equipment row. Orchestrates: short-circuit
// when image already chosen → resolve via Brave → for each candidate
// download bytes (skip on failure), upload to CF Images, dedupe against
// existing pending rows by source_url, insert. Updates
// equipment.image_sourcing_attempted_at on completion so bulk-source
// (TT-53) doesn't pick the row up again.
export async function sourcePhotosForEquipment(
  supabase: SupabaseClient,
  env: SourcingEnv,
  slug: string,
  options: { limit?: number; deps?: SourcingDeps } = {}
): Promise<SourcingResult> {
  const deps = options.deps ?? {};
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolve = deps.resolve ?? resolveBraveCandidates;
  const upload = deps.upload ?? uploadImageToCloudflare;

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

  const inserts: Array<
    Omit<SourcedCandidate, "id"> & { equipment_id: string }
  > = [];

  for (const candidate of resolved) {
    if (candidate.pageUrl && seenUrls.has(candidate.pageUrl)) continue;

    const downloaded = await fetchImageBytes(candidate.imageUrl, fetchImpl);
    if (!downloaded) continue;

    let uploaded;
    try {
      uploaded = await upload(env, downloaded.bytes, {
        filename: filenameFromUrl(candidate.imageUrl, "image"),
        contentType: downloaded.contentType ?? undefined,
        metadata: {
          equipment_id: row.id,
          equipment_slug: row.slug,
          source_label: candidate.tierLabel,
          source_host: candidate.host,
        },
      });
    } catch {
      continue;
    }

    inserts.push({
      equipment_id: row.id,
      cf_image_id: uploaded.id,
      source_url: candidate.pageUrl,
      image_source_host: candidate.host || null,
      source_label: candidate.tierLabel,
      match_kind: candidate.match,
      tier: candidate.tier,
      width: null,
      height: null,
    });

    if (candidate.pageUrl) seenUrls.add(candidate.pageUrl);
  }

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
