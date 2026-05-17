// TT-238: JSON status endpoint the /admin/import page polls while an
// equipment-import job is in flight. Returns the job's total + counts
// + finished_at sentinel, plus the list of failed items so the UI
// can surface them inline once the run is done (matches the previous
// inline-import UX of "X imported, Y failed, here's what failed").
//
// Admin-only. No CSRF: this is a read-only GET; the producer in
// admin.import.tsx already gated the write at the action layer.

import { data, redirect } from "react-router";

import type { Route } from "./+types/admin.import.job.$jobId";
import { createSupabaseAdminClient } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";

interface JobStatusResponse {
  jobId: string;
  total: number;
  successCount: number;
  failedCount: number;
  finished: boolean;
  failures: Array<{ slug: string; productName: string; message: string }>;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }
  if (user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  const supabase = createSupabaseAdminClient(context);

  const { data: job, error: jobError } = await supabase
    .from("equipment_import_jobs")
    .select("id, total, success_count, failed_count, finished_at")
    .eq("id", params.jobId)
    .maybeSingle();

  if (jobError || !job) {
    return data(
      { error: "Job not found" },
      { status: 404, headers: sbServerClient.headers }
    );
  }

  // Pull only failed items so the response stays small. Successes
  // are implied by `success_count`; no need to render them as a list.
  const { data: failedItems } = await supabase
    .from("equipment_import_job_items")
    .select("slug, product_name, message")
    .eq("job_id", params.jobId)
    .eq("status", "failed")
    .order("created_at", { ascending: true });

  const response: JobStatusResponse = {
    jobId: job.id as string,
    total: job.total as number,
    successCount: job.success_count as number,
    failedCount: job.failed_count as number,
    finished: job.finished_at !== null,
    failures: (
      (failedItems ?? []) as Array<{
        slug: string;
        product_name: string;
        message: string | null;
      }>
    ).map(row => ({
      slug: row.slug,
      productName: row.product_name,
      message: row.message ?? "",
    })),
  };

  return data(response, { headers: sbServerClient.headers });
}
