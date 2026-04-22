import { SUPABASE_URL, SUPABASE_ANON_KEY, adminHeaders } from "./supabase";

export async function insertPendingEquipmentReview(params: {
  userId: string;
  equipmentId: string;
  reviewText: string;
  overallRating: number;
}): Promise<{ id: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/equipment_reviews`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: params.userId,
      equipment_id: params.equipmentId,
      status: "pending",
      overall_rating: params.overallRating,
      review_text: params.reviewText,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `insertPendingEquipmentReview failed (${res.status}): ${await res.text()}`
    );
  }
  const rows = (await res.json()) as Array<{ id: string }>;
  return { id: rows[0].id };
}

/**
 * Record an admin approval directly in moderator_approvals via the service
 * role. The `update_submission_status` trigger flips the parent row's
 * status (admin_ui is single-approver complete per migration
 * 20260101120000).
 */
export async function recordAdminApproval(params: {
  submissionType: "review" | "equipment" | "player" | "player_edit" | "video";
  submissionId: string;
  moderatorId: string;
}): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/moderator_approvals`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({
      submission_type: params.submissionType,
      submission_id: params.submissionId,
      moderator_id: params.moderatorId,
      source: "admin_ui",
      action: "approved",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `recordAdminApproval failed (${res.status}): ${await res.text()}`
    );
  }
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
