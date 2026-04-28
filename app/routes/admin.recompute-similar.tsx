import type { Route } from "./+types/admin.recompute-similar";
import { data, redirect } from "react-router";
import { ensureAdminAction } from "~/lib/admin/middleware.server";
import { recomputeSimilarEquipment } from "~/lib/equipment/recompute-similar.server";
import { Logger, createLogContext } from "~/lib/logger.server";

export async function loader() {
  // No UI on this route — direct GETs bounce to the admin dashboard.
  return redirect("/admin");
}

export async function action({ request, context }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  const ctxLog = createLogContext("admin.recompute-similar", {
    userId: user.id,
  });

  try {
    const result = await recomputeSimilarEquipment(supabaseAdmin, ctxLog);
    return data(
      {
        success: true as const,
        equipmentProcessed: result.equipmentProcessed,
        pairsWritten: result.pairsWritten,
        durationMs: result.durationMs,
        runStart: result.runStart,
      },
      { headers: sbServerClient.headers }
    );
  } catch (err) {
    Logger.error(
      "admin.recompute-similar.failed",
      ctxLog,
      err instanceof Error ? err : undefined
    );
    return data(
      {
        success: false as const,
        error: err instanceof Error ? err.message : "Recompute failed",
      },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}
