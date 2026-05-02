import type { SupabaseClient } from "@supabase/supabase-js";

const SUBMISSION_STATUSES = [
  "pending",
  "awaiting_second_approval",
  "approved",
  "rejected",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

type SubmissionKey = keyof AdminDashboardCounts["byStatus"];

const SUBMISSION_KEYS: readonly SubmissionKey[] = [
  "equipmentSubmissions",
  "equipmentEdits",
  "playerSubmissions",
  "playerEdits",
  "equipmentReviews",
  "videoSubmissions",
  "playerEquipmentSetups",
];

export type StatusCounts = Record<SubmissionStatus, number>;

export interface AdminDashboardCounts {
  totals: {
    equipmentSubmissions: number;
    equipmentEdits: number;
    playerSubmissions: number;
    playerEdits: number;
    equipmentReviews: number;
    videoSubmissions: number;
    playerEquipmentSetups: number;
    equipment: number;
    players: number;
  };
  byStatus: {
    equipmentSubmissions: StatusCounts;
    equipmentEdits: StatusCounts;
    playerSubmissions: StatusCounts;
    playerEdits: StatusCounts;
    equipmentReviews: StatusCounts;
    videoSubmissions: StatusCounts;
    playerEquipmentSetups: StatusCounts;
  };
}

export function emptyDashboardCounts(): AdminDashboardCounts {
  return {
    totals: {
      equipmentSubmissions: 0,
      equipmentEdits: 0,
      playerSubmissions: 0,
      playerEdits: 0,
      equipmentReviews: 0,
      videoSubmissions: 0,
      playerEquipmentSetups: 0,
      equipment: 0,
      players: 0,
    },
    byStatus: {
      equipmentSubmissions: emptyStatusCounts(),
      equipmentEdits: emptyStatusCounts(),
      playerSubmissions: emptyStatusCounts(),
      playerEdits: emptyStatusCounts(),
      equipmentReviews: emptyStatusCounts(),
      videoSubmissions: emptyStatusCounts(),
      playerEquipmentSetups: emptyStatusCounts(),
    },
  };
}

function emptyStatusCounts(): StatusCounts {
  return {
    pending: 0,
    awaiting_second_approval: 0,
    approved: 0,
    rejected: 0,
  };
}

interface RpcShape {
  totals?: Partial<AdminDashboardCounts["totals"]>;
  byStatus?: {
    [K in SubmissionKey]?: Partial<StatusCounts>;
  };
}

/**
 * Fetch admin dashboard counts in a single PostgREST round-trip via the
 * `get_admin_dashboard_counts` SECURITY DEFINER RPC. Replaces the previous
 * 37-subrequest fan-out (7 tables × 4 statuses + 7 totals + 2 content totals).
 *
 * The RPC returns a JSONB blob shaped to match `AdminDashboardCounts` exactly,
 * with every (key × status) cell padded to zero so the caller can rely on the
 * shape without merging an empty template. We still merge defensively against
 * `emptyDashboardCounts()` so a partially-shaped response (e.g. an RPC failure
 * captured at the loader's `.catch()`) doesn't leak `undefined` into render.
 *
 * Caller is responsible for using an admin/service-role client; the RPC is
 * EXECUTE-granted only to service_role.
 */
export async function getAdminDashboardCounts(
  supabase: SupabaseClient
): Promise<AdminDashboardCounts> {
  const { data, error } = await supabase.rpc("get_admin_dashboard_counts");
  if (error) throw new Error(error.message);

  const merged = emptyDashboardCounts();
  const payload = (data ?? {}) as RpcShape;

  if (payload.totals) {
    for (const key of Object.keys(merged.totals) as Array<
      keyof AdminDashboardCounts["totals"]
    >) {
      const v = payload.totals[key];
      if (typeof v === "number") merged.totals[key] = v;
    }
  }

  if (payload.byStatus) {
    for (const key of SUBMISSION_KEYS) {
      const cell = payload.byStatus[key];
      if (!cell) continue;
      for (const status of SUBMISSION_STATUSES) {
        const v = cell[status];
        if (typeof v === "number") merged.byStatus[key][status] = v;
      }
    }
  }

  return merged;
}
