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
