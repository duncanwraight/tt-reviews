// TT-243: equipment-import job detail page.
//
// Bookmarkable, refreshable, shareable progress page. The selection
// page (admin.import._index.tsx) 302s here as soon as it's queued
// `sendBatch` calls, so the operator never has to keep that tab open
// to watch a long import.
//
// Polling shape: `useRevalidator()` re-runs this route's loader on a
// 1s interval while the job's `finished_at` is null. Once finished,
// polling stops and the page becomes a permanent summary card.
// Bypasses the dedicated JSON endpoint that TT-238 used — the
// loader IS the JSON endpoint, and React Router serves the
// .data response automatically on revalidation. One file, one
// query, no separate resource route to keep in sync.

import { useEffect } from "react";
import { Link, useRevalidator } from "react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import type { Route } from "./+types/admin.import.jobs.$jobId";
import { ensureAdminLoader } from "~/lib/admin/middleware.server";
import { formatDateTime, formatRelativeTime } from "~/lib/date";

interface JobItemRow {
  slug: string;
  productName: string;
  status: "success" | "failed";
  message: string | null;
  createdAt: string;
}

interface JobDetail {
  id: string;
  total: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
  finishedAt: string | null;
  items: JobItemRow[];
}

export function meta({ data }: Route.MetaArgs) {
  const finished = data && "job" in data ? data.job.finishedAt !== null : true;
  return [
    {
      title: finished
        ? "Import Job | Admin | TT Reviews"
        : "Importing… | Admin | TT Reviews",
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { supabaseAdmin } = gate;

  const { data: job, error } = await supabaseAdmin
    .from("equipment_import_jobs")
    .select("id, total, success_count, failed_count, created_at, finished_at")
    .eq("id", params.jobId)
    .maybeSingle();

  if (error || !job) {
    throw new Response("Not found", { status: 404 });
  }

  // Most-recent items first. Cap at 1000 so a giant import doesn't
  // blow the response — anything over that is the failures view
  // territory and we can paginate later if it ever matters in
  // practice.
  const { data: items } = await supabaseAdmin
    .from("equipment_import_job_items")
    .select("slug, product_name, status, message, created_at")
    .eq("job_id", params.jobId)
    .order("created_at", { ascending: false })
    .limit(1000);

  const detail: JobDetail = {
    id: job.id as string,
    total: job.total as number,
    successCount: job.success_count as number,
    failedCount: job.failed_count as number,
    createdAt: job.created_at as string,
    finishedAt: (job.finished_at as string | null) ?? null,
    items: (
      (items ?? []) as Array<{
        slug: string;
        product_name: string;
        status: "success" | "failed";
        message: string | null;
        created_at: string;
      }>
    ).map(row => ({
      slug: row.slug,
      productName: row.product_name,
      status: row.status,
      message: row.message,
      createdAt: row.created_at,
    })),
  };

  return { job: detail };
}

export default function AdminImportJobDetail({
  loaderData,
}: Route.ComponentProps) {
  const { job } = loaderData;
  const revalidator = useRevalidator();
  const finished = job.finishedAt !== null;

  // 1s revalidator tick while the job is open. The consumer's
  // max_concurrency=2 means rows land in pairs — slower than 1s
  // would feel laggy, faster would hammer the loader unnecessarily.
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => {
      if (revalidator.state === "idle") void revalidator.revalidate();
    }, 1000);
    return () => clearInterval(id);
  }, [finished, revalidator]);

  const processed = job.successCount + job.failedCount;
  const percent = Math.min(
    100,
    Math.round((processed / Math.max(job.total, 1)) * 100)
  );

  const successes = job.items.filter(i => i.status === "success");
  const failures = job.items.filter(i => i.status === "failed");

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Equipment Import</h2>
          <p className="text-sm text-gray-600 mt-1">
            Started {formatDateTime(job.createdAt)} ·{" "}
            <span className="text-gray-500">
              {formatRelativeTime(job.createdAt)}
            </span>
          </p>
        </div>
        <Link
          to="/admin/import/jobs"
          className="text-sm text-purple-600 hover:text-purple-800"
        >
          ← All imports
        </Link>
      </header>

      <section
        className={`rounded-lg border p-5 ${
          !finished
            ? "bg-blue-50 border-blue-200"
            : job.failedCount > 0
              ? "bg-amber-50 border-amber-200"
              : "bg-green-50 border-green-200"
        }`}
        data-testid="admin-import-job-status"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {!finished ? (
              <Loader2
                className="size-5 text-blue-600 animate-spin"
                aria-hidden
              />
            ) : job.failedCount > 0 ? (
              <XCircle className="size-5 text-amber-600" aria-hidden />
            ) : (
              <CheckCircle2 className="size-5 text-green-600" aria-hidden />
            )}
            <div>
              <h3 className="font-semibold text-gray-900">
                {finished
                  ? job.failedCount > 0
                    ? "Finished with errors"
                    : "Finished"
                  : "Importing…"}
              </h3>
              <p
                className="text-sm text-gray-700"
                data-testid="admin-import-job-progress"
              >
                {processed} of {job.total} processed
                {" · "}
                {job.successCount} imported
                {" · "}
                {job.failedCount} failed
                {finished && job.finishedAt
                  ? ` · finished ${formatRelativeTime(job.finishedAt)}`
                  : null}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 w-full bg-white/60 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 transition-all ${
              !finished
                ? "bg-blue-500"
                : job.failedCount > 0
                  ? "bg-amber-500"
                  : "bg-green-500"
            }`}
            style={{ width: `${percent}%` }}
            data-testid="admin-import-job-progress-bar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            role="progressbar"
          />
        </div>
      </section>

      {failures.length > 0 && (
        <section data-testid="admin-import-job-failures">
          <header className="mb-2">
            <h3 className="text-lg font-semibold text-gray-900">
              Failures ({failures.length})
            </h3>
          </header>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {failures.map(item => (
                  <tr
                    key={`fail-${item.slug}`}
                    data-testid={`admin-import-job-failure-${item.slug}`}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {item.productName}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-700">
                      {item.message ?? "(no message)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section data-testid="admin-import-job-items">
        <header className="mb-2">
          <h3 className="text-lg font-semibold text-gray-900">
            Imported ({successes.length})
          </h3>
        </header>
        {successes.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-6 text-center text-sm text-gray-500">
            {finished
              ? "No items were imported in this run."
              : "Waiting for the first item to land…"}
          </div>
        ) : (
          <ul className="bg-white rounded-lg shadow divide-y divide-gray-200">
            {successes.map(item => (
              <li
                key={`ok-${item.slug}`}
                className="px-4 py-2 flex items-center justify-between gap-3 text-sm"
                data-testid={`admin-import-job-item-${item.slug}`}
              >
                <Link
                  to={`/equipment/${item.slug}`}
                  className="font-medium text-gray-900 hover:text-purple-700"
                >
                  {item.productName}
                </Link>
                <span className="text-xs text-gray-500 tabular-nums">
                  {formatRelativeTime(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
