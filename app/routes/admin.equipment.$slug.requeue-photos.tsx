import type { Route } from "./+types/admin.equipment.$slug.requeue-photos";
import { data, redirect } from "react-router";

import { ensureAdminAction } from "~/lib/admin/middleware.server";
import { Logger, createLogContext } from "~/lib/logger.server";
import type { PhotoSourceMessage } from "~/lib/photo-sourcing/queue.server";
import {
  requeueOneEquipmentPhotos,
  type PhotoSourceQueue,
} from "~/lib/photo-sourcing/requeue-one.server";

// POST /admin/equipment/:slug/requeue-photos — TT-166. Admin button on
// /equipment/:slug. Drops un-picked candidate rows + clears cooldown
// stamps for one equipment row, then enqueues a single photo-source
// message. The currently-picked row (and equipment.image_key) stays
// intact so the live image survives until a new candidate is picked.
// GETs redirect home so a failed POST that didn't redirect lands on a
// sensible page.

export function loader({ params }: Route.LoaderArgs) {
  return redirect(`/equipment/${params.slug}`);
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const slug = params.slug;
  if (!slug) {
    return data({ error: "missing slug" }, { status: 400 });
  }

  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  const env = context.cloudflare.env as unknown as {
    PHOTO_SOURCE_QUEUE?: { send: Queue<PhotoSourceMessage>["send"] };
  };
  if (!env.PHOTO_SOURCE_QUEUE) {
    return data(
      { error: "queue binding missing" },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  const { data: row, error: lookupError } = await supabaseAdmin
    .from("equipment")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (lookupError) {
    Logger.error(
      "requeue-photos lookup failed",
      createLogContext("admin-equipment-requeue-photos", {
        slug,
        userId: user.id,
      }),
      lookupError instanceof Error ? lookupError : undefined
    );
    return data(
      { error: "equipment lookup failed" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
  if (!row) {
    return data(
      { error: "equipment not found" },
      { status: 404, headers: sbServerClient.headers }
    );
  }

  try {
    await requeueOneEquipmentPhotos(
      supabaseAdmin,
      env.PHOTO_SOURCE_QUEUE as PhotoSourceQueue,
      row as Parameters<typeof requeueOneEquipmentPhotos>[2]
    );
    Logger.info(
      "requeue-photos completed",
      createLogContext("admin-equipment-requeue-photos", {
        slug,
        userId: user.id,
      }),
      { equipmentId: (row as { id: string }).id }
    );
    return redirect(`/equipment/${slug}`, {
      headers: sbServerClient.headers,
    });
  } catch (err) {
    Logger.error(
      "requeue-photos failed",
      createLogContext("admin-equipment-requeue-photos", {
        slug,
        userId: user.id,
      }),
      err instanceof Error ? err : undefined
    );
    return data(
      { error: err instanceof Error ? err.message : "requeue failed" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}
