import { SUPABASE_URL, SUPABASE_ANON_KEY, adminHeaders } from "./supabase";

export async function insertPendingEquipmentReview(params: {
  userId: string;
  equipmentId: string;
  reviewText: string;
  overallRating: number;
}): Promise<{ id: string }> {
  return insertEquipmentReview({ ...params, status: "pending" });
}

export async function insertApprovedEquipmentReview(params: {
  userId: string;
  equipmentId: string;
  reviewText: string;
  overallRating: number;
}): Promise<{ id: string }> {
  return insertEquipmentReview({ ...params, status: "approved" });
}

async function insertEquipmentReview(params: {
  userId: string;
  equipmentId: string;
  reviewText: string;
  overallRating: number;
  status: "pending" | "approved";
}): Promise<{ id: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/equipment_reviews`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: params.userId,
      equipment_id: params.equipmentId,
      status: params.status,
      overall_rating: params.overallRating,
      review_text: params.reviewText,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `insertEquipmentReview failed (${res.status}): ${await res.text()}`
    );
  }
  const rows = (await res.json()) as Array<{ id: string }>;
  return { id: rows[0].id };
}

export async function getEquipmentReviewStatus(
  reviewId: string
): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_reviews?id=eq.${reviewId}&select=status`,
    { headers: adminHeaders() }
  );
  if (!res.ok) {
    throw new Error(
      `getEquipmentReviewStatus failed (${res.status}): ${await res.text()}`
    );
  }
  const rows = (await res.json()) as Array<{ status: string }>;
  return rows[0]?.status ?? "missing";
}

export async function getFirstEquipment(): Promise<{
  id: string;
  slug: string;
  name: string;
}> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment?select=id,slug,name&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY } }
  );
  if (!res.ok) {
    throw new Error(`getFirstEquipment failed (${res.status})`);
  }
  const rows = (await res.json()) as Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  if (!rows[0]) throw new Error("No equipment seeded");
  return rows[0];
}

/**
 * Insert a row into moderator_approvals directly. Used by the admin
 * equipment-reviews queue spec to plant a prior approval and verify the
 * "Approval History" section renders — i.e. that the loader queries the
 * right submission_type. The BEFORE-INSERT trigger enforces that the
 * referenced submission exists in its typed table.
 */
export async function insertModeratorApproval(params: {
  submissionType: string;
  submissionId: string;
  moderatorId: string;
  action: "approved" | "rejected";
  source: "admin_ui" | "discord";
}): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/moderator_approvals`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({
      submission_type: params.submissionType,
      submission_id: params.submissionId,
      moderator_id: params.moderatorId,
      action: params.action,
      source: params.source,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `insertModeratorApproval failed (${res.status}): ${await res.text()}`
    );
  }
}

// Equipment-photo helpers (TT-48 / TT-56). The fixture pattern: pick an
// existing seeded equipment row, stash its current image_* state, blank
// it, plant N candidate rows, run the assertion, restore.

export interface EquipmentImageSnapshot {
  image_key: string | null;
  image_etag: string | null;
  image_credit_text: string | null;
  image_credit_link: string | null;
  image_license_short: string | null;
  image_license_url: string | null;
  image_source_url: string | null;
  image_skipped_at: string | null;
  image_sourcing_attempted_at: string | null;
}

const EQUIPMENT_IMAGE_COLUMNS =
  "image_key,image_etag,image_credit_text,image_credit_link,image_license_short,image_license_url,image_source_url,image_skipped_at,image_sourcing_attempted_at";

export async function snapshotEquipmentImage(
  equipmentId: string
): Promise<EquipmentImageSnapshot> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment?id=eq.${equipmentId}&select=${EQUIPMENT_IMAGE_COLUMNS}`,
    { headers: adminHeaders() }
  );
  if (!res.ok) {
    throw new Error(`snapshotEquipmentImage failed (${res.status})`);
  }
  const rows = (await res.json()) as EquipmentImageSnapshot[];
  if (!rows[0]) throw new Error(`equipment ${equipmentId} not found`);
  return rows[0];
}

export async function setEquipmentImage(
  equipmentId: string,
  patch: Partial<EquipmentImageSnapshot>
): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment?id=eq.${equipmentId}`,
    {
      method: "PATCH",
      headers: { ...adminHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) {
    throw new Error(
      `setEquipmentImage failed (${res.status}): ${await res.text()}`
    );
  }
}

export async function clearEquipmentImage(equipmentId: string): Promise<void> {
  await setEquipmentImage(equipmentId, {
    image_key: null,
    image_etag: null,
    image_credit_text: null,
    image_credit_link: null,
    image_license_short: null,
    image_license_url: null,
    image_source_url: null,
    image_skipped_at: null,
    image_sourcing_attempted_at: null,
  });
}

export async function deleteCandidatesForEquipment(
  equipmentId: string
): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_photo_candidates?equipment_id=eq.${equipmentId}`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `deleteCandidatesForEquipment failed (${res.status}): ${await res.text()}`
    );
  }
}

export interface CandidateInput {
  r2_key: string;
  source_url?: string | null;
  image_source_host?: string | null;
  source_label?: string | null;
  match_kind?: "trailing" | "loose";
  tier?: number;
}

export async function insertEquipmentPhotoCandidates(
  equipmentId: string,
  candidates: CandidateInput[]
): Promise<Array<{ id: string; r2_key: string }>> {
  const rows = candidates.map(c => ({
    equipment_id: equipmentId,
    r2_key: c.r2_key,
    source_url: c.source_url ?? null,
    image_source_host: c.image_source_host ?? null,
    source_label: c.source_label ?? "revspin",
    match_kind: c.match_kind ?? "trailing",
    tier: c.tier ?? 1,
  }));
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_photo_candidates`,
    {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(rows),
    }
  );
  if (!res.ok) {
    throw new Error(
      `insertEquipmentPhotoCandidates failed (${res.status}): ${await res.text()}`
    );
  }
  return (await res.json()) as Array<{ id: string; r2_key: string }>;
}

export async function getCandidatesForEquipment(
  equipmentId: string
): Promise<Array<{ id: string; r2_key: string; picked_at: string | null }>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_photo_candidates?equipment_id=eq.${equipmentId}&select=id,r2_key,picked_at`,
    { headers: adminHeaders() }
  );
  if (!res.ok) {
    throw new Error(
      `getCandidatesForEquipment failed (${res.status}): ${await res.text()}`
    );
  }
  return res.json() as Promise<
    Array<{ id: string; r2_key: string; picked_at: string | null }>
  >;
}

export async function getPendingEquipmentSubmissions(userId: string): Promise<
  Array<{
    id: string;
    name: string;
    manufacturer: string;
    category: string;
    subcategory: string | null;
    specifications: Record<string, unknown>;
    status: string;
  }>
> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_submissions?user_id=eq.${userId}&select=id,name,manufacturer,category,subcategory,specifications,status`,
    { headers: adminHeaders() }
  );
  if (!res.ok) {
    throw new Error(`getPendingEquipmentSubmissions failed (${res.status})`);
  }
  return res.json() as Promise<
    Array<{
      id: string;
      name: string;
      manufacturer: string;
      category: string;
      subcategory: string | null;
      specifications: Record<string, unknown>;
      status: string;
    }>
  >;
}

export async function getPendingEquipmentReviews(userId: string): Promise<
  Array<{
    id: string;
    overall_rating: number | string;
    review_text: string | null;
    status: string;
  }>
> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_reviews?user_id=eq.${userId}&status=eq.pending&select=id,overall_rating,review_text,status`,
    { headers: adminHeaders() }
  );
  if (!res.ok) {
    throw new Error(`getPendingEquipmentReviews failed (${res.status})`);
  }
  return res.json() as Promise<
    Array<{
      id: string;
      overall_rating: number | string;
      review_text: string | null;
      status: string;
    }>
  >;
}
