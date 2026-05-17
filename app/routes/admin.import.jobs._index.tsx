// TT-243: equipment-import recent jobs list.
//
// History/audit page for past imports. Mirrors the "Activity log"
// pattern from /admin/import-players (player importer). One row per
// job, status pill, link to detail. Useful when the operator wants
// to confirm what shipped last week, or jump back into a job page
// after navigating away mid-run.

import { Link } from "react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import type { Route } from "./+types/admin.import.jobs._index";
import { ensureAdminLoader } from "~/lib/admin/middleware.server";
import { formatDateTime, formatRelativeTime } from "~/lib/date";

interface JobRow {
  id: string;
  total: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
  finishedAt: string | null;
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Equipment Imports | Admin | TT Reviews" },
    {
      name: "description",
      content: "Recent equipment-import jobs and their status.",
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { supabaseAdmin } = gate;

  const { data: rows } = await supabaseAdmin
    .from("equipment_import_jobs")
    .select("id, total, success_count, failed_count, created_at, finished_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const jobs: JobRow[] = (
    (rows ?? []) as Array<{
      id: string;
      total: number;
      success_count: number;
      failed_count: number;
      created_at: string;
      finished_at: string | null;
    }>
  ).map(r => ({
    id: r.id,
    total: r.total,
    successCount: r.success_count,
    failedCount: r.failed_count,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  }));

  return { jobs };
}

type Lifecycle = "running" | "ok" | "with_errors" | "empty";

function classify(job: JobRow): Lifecycle {
  if (job.finishedAt === null) return "running";
  if (job.failedCount > 0) return "with_errors";
  if (job.successCount === 0) return "empty";
  return "ok";
}

export default function AdminImportJobsList({
  loaderData,
}: Route.ComponentProps) {
  const { jobs } = loaderData;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Equipment Imports
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Last 50 import jobs. Click a row for live progress or a final tally.
          </p>
        </div>
        <Link
          to="/admin/import"
          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700"
          data-testid="admin-import-jobs-new"
        >
          New import
        </Link>
      </header>

      {jobs.length === 0 ? (
        <div
          className="bg-gray-50 rounded-lg p-8 text-center text-sm text-gray-500"
          data-testid="admin-import-jobs-empty"
        >
          No import jobs yet. Start one from the New import button.
        </div>
      ) : (
        <ul
          className="bg-white rounded-lg shadow divide-y divide-gray-200"
          data-testid="admin-import-jobs-list"
        >
          {jobs.map(job => {
            const lifecycle = classify(job);
            return (
              <li
                key={job.id}
                className="px-4 py-3 flex items-center justify-between gap-3 text-sm"
                data-testid={`admin-import-jobs-row-${job.id}`}
              >
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  <LifecycleIcon lifecycle={lifecycle} />
                  <div className="min-w-0">
                    <Link
                      to={`/admin/import/jobs/${job.id}`}
                      className="font-medium text-gray-900 hover:text-purple-700"
                    >
                      {formatDateTime(job.createdAt)}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {job.successCount} imported · {job.failedCount} failed ·{" "}
                      {job.total} total
                    </div>
                  </div>
                </div>
                <div className="flex items-baseline gap-3 shrink-0">
                  <LifecyclePill lifecycle={lifecycle} />
                  <span className="text-xs text-gray-500 tabular-nums">
                    {formatRelativeTime(job.finishedAt ?? job.createdAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LifecycleIcon({ lifecycle }: { lifecycle: Lifecycle }) {
  if (lifecycle === "running") {
    return (
      <Loader2 className="size-4 text-blue-600 animate-spin" aria-hidden />
    );
  }
  if (lifecycle === "with_errors") {
    return <XCircle className="size-4 text-amber-600" aria-hidden />;
  }
  if (lifecycle === "empty") {
    return <XCircle className="size-4 text-gray-400" aria-hidden />;
  }
  return <CheckCircle2 className="size-4 text-green-600" aria-hidden />;
}

const PILL_DISPLAY: Record<Lifecycle, { label: string; cls: string }> = {
  running: { label: "Running", cls: "bg-blue-100 text-blue-800" },
  ok: { label: "Done", cls: "bg-green-100 text-green-800" },
  with_errors: {
    label: "Done · errors",
    cls: "bg-amber-100 text-amber-800",
  },
  empty: { label: "Empty", cls: "bg-gray-100 text-gray-700" },
};

function LifecyclePill({ lifecycle }: { lifecycle: Lifecycle }) {
  const { label, cls } = PILL_DISPLAY[lifecycle];
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider font-semibold rounded px-1.5 py-0.5 ${cls}`}
      data-testid={`admin-import-jobs-pill-${lifecycle}`}
    >
      {label}
    </span>
  );
}
