import type { Route } from "./+types/admin.equipment.$slug.requeue-specs";
import { data, redirect } from "react-router";

import { ensureAdminAction } from "~/lib/admin/middleware.server";
import { Logger, createLogContext } from "~/lib/logger.server";
import {
  requeueOneEquipmentSpecs,
  type SpecSourceQueue,
} from "~/lib/spec-sourcing/requeue-one.server";
import type { SpecSourceMessage } from "~/lib/spec-sourcing/types";

// POST /admin/equipment/:slug/requeue-specs — TT-166. Admin button on
// /equipment/:slug. Wipes the existing proposal + cooldown stamps for
// one equipment row and enqueues a single spec-source message so the
// queue consumer picks it up immediately. GETs redirect home so a
// failed POST that didn't redirect lands on a sensible page.

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
    SPEC_SOURCE_QUEUE?: { send: Queue<SpecSourceMessage>["send"] };
  };
  if (!env.SPEC_SOURCE_QUEUE) {
    return data(
      { error: "queue binding missing" },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  const { data: row, error: lookupError } = await supabaseAdmin
    .from("equipment")
    .select("id, slug, manufacturer, name, category, subcategory")
    .eq("slug", slug)
    .maybeSingle();
  if (lookupError) {
    Logger.error(
      "requeue-specs lookup failed",
      createLogContext("admin-equipment-requeue-specs", {
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
    await requeueOneEquipmentSpecs(
      supabaseAdmin,
      env.SPEC_SOURCE_QUEUE as SpecSourceQueue,
      row as Parameters<typeof requeueOneEquipmentSpecs>[2]
    );
    Logger.info(
      "requeue-specs completed",
      createLogContext("admin-equipment-requeue-specs", {
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
      "requeue-specs failed",
      createLogContext("admin-equipment-requeue-specs", {
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
