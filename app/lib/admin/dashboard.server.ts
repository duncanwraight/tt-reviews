import type { SupabaseClient } from "@supabase/supabase-js";

const SUBMISSION_STATUSES = [
  "pending",
  "awaiting_second_approval",
  "approved",
  "rejected",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

const SUBMISSION_TABLES = [
  "equipment_submissions",
  "player_submissions",
  "player_edits",
  "equipment_reviews",
  "video_submissions",
  "player_equipment_setup_submissions",
] as const;
export type SubmissionTable = (typeof SUBMISSION_TABLES)[number];

type SubmissionKey = keyof AdminDashboardCounts["byStatus"];

const TABLE_KEY: Record<SubmissionTable, SubmissionKey> = {
  equipment_submissions: "equipmentSubmissions",
  player_submissions: "playerSubmissions",
  player_edits: "playerEdits",
  equipment_reviews: "equipmentReviews",
  video_submissions: "videoSubmissions",
  player_equipment_setup_submissions: "playerEquipmentSetups",
};

export type StatusCounts = Record<SubmissionStatus, number>;

export interface AdminDashboardCounts {
  totals: {
    equipmentSubmissions: number;
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

async function countWhereStatus(
  supabase: SupabaseClient,
  table: SubmissionTable,
  status: SubmissionStatus
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("status", status);
  return count ?? 0;
}

async function countAll(
  supabase: SupabaseClient,
  table: string
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

/**
 * Fetch admin dashboard counts using head-only count queries — no row data is
 * transferred. One query per (submission-table × status) plus one total per
 * submission table and per content table. All run in parallel.
 *
 * Caller is responsible for using an admin/service-role client; callers gating
 * on user role then calling this is the documented pattern.
 */
export async function getAdminDashboardCounts(
  supabase: SupabaseClient
): Promise<AdminDashboardCounts> {
  const statusJobs: Array<{
    table: SubmissionTable;
    status: SubmissionStatus;
    promise: Promise<number>;
  }> = [];
  for (const table of SUBMISSION_TABLES) {
    for (const status of SUBMISSION_STATUSES) {
      statusJobs.push({
        table,
        status,
        promise: countWhereStatus(supabase, table, status),
      });
    }
  }

  const submissionTotalJobs = SUBMISSION_TABLES.map(table => ({
    table,
    promise: countAll(supabase, table),
  }));

  const equipmentTotalPromise = countAll(supabase, "equipment");
  const playersTotalPromise = countAll(supabase, "players");

  const [statusResults, submissionTotalResults, equipmentTotal, playersTotal] =
    await Promise.all([
      Promise.all(statusJobs.map(j => j.promise)),
      Promise.all(submissionTotalJobs.map(j => j.promise)),
      equipmentTotalPromise,
      playersTotalPromise,
    ]);

  const counts = emptyDashboardCounts();
  statusJobs.forEach((job, i) => {
    counts.byStatus[TABLE_KEY[job.table]][job.status] = statusResults[i];
  });
  submissionTotalJobs.forEach((job, i) => {
    counts.totals[TABLE_KEY[job.table]] = submissionTotalResults[i];
  });
  counts.totals.equipment = equipmentTotal;
  counts.totals.players = playersTotal;

  return counts;
}
