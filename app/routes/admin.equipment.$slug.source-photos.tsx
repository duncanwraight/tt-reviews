import type { Route } from "./+types/admin.equipment.$slug.source-photos";
import { data } from "react-router";
import { ensureAdminAction } from "~/lib/admin/middleware.server";
import { sourcePhotosForEquipment } from "~/lib/photo-sourcing/source.server";
import type { SourcingEnv } from "~/lib/photo-sourcing/source.server";
import { Logger, createLogContext } from "~/lib/logger.server";

// POST /admin/equipment/:slug/source-photos — kicks the Brave + R2
// pipeline for one equipment row. The admin queue (TT-52) and the
// bulk-source endpoint (TT-53) both call this.

export function loader() {
  throw new Response("not found", { status: 404 });
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const slug = params.slug;
  if (!slug) {
    return data({ error: "missing slug" }, { status: 400 });
  }

  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  const env = context.cloudflare.env as unknown as Partial<SourcingEnv> & {
    IMAGE_BUCKET?: R2Bucket;
  };
  if (!env.BRAVE_SEARCH_API_KEY) {
    Logger.error(
      "source-photos: missing BRAVE_SEARCH_API_KEY",
      createLogContext("admin-equipment-source-photos", {
        slug,
        userId: user.id,
      })
    );
    return data(
      { error: "photo sourcing not configured" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
  if (!env.IMAGE_BUCKET) {
    return data(
      { error: "R2 bucket not bound" },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  try {
    const result = await sourcePhotosForEquipment(
      supabaseAdmin,
      env.IMAGE_BUCKET,
      env as SourcingEnv,
      slug
    );
    Logger.info(
      "source-photos completed",
      createLogContext("admin-equipment-source-photos", {
        slug,
        userId: user.id,
      }),
      {
        status: result.status,
        equipmentId: result.equipment.id,
        insertedCount: result.insertedCount,
      }
    );
    return data(result, { headers: sbServerClient.headers });
  } catch (err) {
    Logger.error(
      "source-photos failed",
      createLogContext("admin-equipment-source-photos", {
        slug,
        userId: user.id,
      }),
      err instanceof Error ? err : undefined
    );
    return data(
      { error: err instanceof Error ? err.message : "sourcing failed" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}
