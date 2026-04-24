import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubmissionType } from "../submissions/registry";

/**
 * Narrow shape of a row in the `moderator_approvals` table. Covers every
 * field the admin queue UI reads; wider fields are intentionally absent so
 * drift between the UI and the table stays visible in TypeScript.
 */
export interface ModeratorApproval {
  id: string;
  submission_id: string;
  submission_type: SubmissionType;
  moderator_id: string;
  action: "approved" | "rejected";
  source: string;
  created_at: string;
  moderator_notes?: string | null;
  rejection_category?: string | null;
  rejection_reason?: string | null;
}

/**
 * Fetch the latest rows from an admin submissions table, newest first.
 *
 * Returns the raw Supabase result shape so each caller can keep its own
 * error-handling convention (some return `{ rows: [] }`, one throws a 500).
 * `Row` is caller-supplied so the call site keeps its table's row type.
 */
export async function loadPendingQueue<Row extends { id: string }>(
  supabase: SupabaseClient,
  tableName: string,
  opts: { limit?: number; select?: string } = {}
): Promise<{ data: Row[] | null; error: unknown }> {
  const { limit = 50, select = "*" } = opts;
  const result = await supabase
    .from(tableName)
    .select(select)
    .order("created_at", { ascending: false })
    .limit(limit);
  return {
    data: (result.data as Row[] | null) ?? null,
    error: result.error ?? null,
  };
}

/**
 * Load `moderator_approvals` for a set of submission IDs, grouped by
 * `submission_id`. Replaces the hand-rolled reduce + `Record<string, any[]>`
 * cast each admin queue was doing. Empty input short-circuits without a
 * DB round-trip.
 */
export async function loadApprovalsForSubmissions(
  supabase: SupabaseClient,
  submissionType: SubmissionType,
  submissionIds: string[]
): Promise<Record<string, ModeratorApproval[]>> {
  if (submissionIds.length === 0) {
    return {};
  }
  const { data } = await supabase
    .from("moderator_approvals")
    .select("*")
    .eq("submission_type", submissionType)
    .in("submission_id", submissionIds);

  return (data ?? []).reduce<Record<string, ModeratorApproval[]>>(
    (acc, approval) => {
      const row = approval as ModeratorApproval;
      const bucket = acc[row.submission_id] ?? [];
      bucket.push(row);
      acc[row.submission_id] = bucket;
      return acc;
    },
    {}
  );
}
