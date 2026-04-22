import { SUPABASE_URL, SUPABASE_ANON_KEY, adminHeaders } from "./supabase";

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
