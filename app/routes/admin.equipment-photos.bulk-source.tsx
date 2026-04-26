import type { Route } from "./+types/admin.equipment-photos.bulk-source";
import { data, redirect } from "react-router";
import { ensureAdminAction } from "~/lib/admin/middleware.server";
import { Logger, createLogContext } from "~/lib/logger.server";
import { bulkSourcePhotos } from "~/lib/photo-sourcing/bulk.server";
import type { SourcingEnv } from "~/lib/photo-sourcing/source.server";

// POST /admin/equipment-photos/bulk-source — drains one chunk of
// unimaged equipment through the per-item pipeline. The admin UI
// re-submits until the response says `remaining === 0`.

export function loader() {
  throw new Response("not found", { status: 404 });
}

export async function action({ request, context }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  const env = context.cloudflare.env as unknown as Partial<SourcingEnv> & {
    IMAGE_BUCKET?: R2Bucket;
  };
  if (!env.BRAVE_SEARCH_API_KEY || !env.IMAGE_BUCKET) {
    return data(
      { error: "photo sourcing not configured" },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  try {
    const result = await bulkSourcePhotos(
      supabaseAdmin,
      env.IMAGE_BUCKET,
      env as SourcingEnv,
      user.id
    );
    Logger.info(
      "bulk-source completed",
      createLogContext("admin-equipment-photos-bulk-source", {
        userId: user.id,
      }),
      result as unknown as Record<string, unknown>
    );
    if (request.headers.get("accept")?.includes("application/json")) {
      return data(result, { headers: sbServerClient.headers });
    }
    return redirect("/admin/equipment-photos", {
      headers: sbServerClient.headers,
    });
  } catch (err) {
    Logger.error(
      "bulk-source failed",
      createLogContext("admin-equipment-photos-bulk-source", {
        userId: user.id,
      }),
      err instanceof Error ? err : undefined
    );
    return data(
      { error: err instanceof Error ? err.message : "bulk source failed" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}
