import type { Route } from "./+types/admin.equipment.$slug.toggle-trim";
import { data, redirect } from "react-router";
import { ensureAdminAction } from "~/lib/admin/middleware.server";
import { toggleEquipmentTrim } from "~/lib/photo-sourcing/review.server";
import { Logger, createLogContext } from "~/lib/logger.server";

// POST /admin/equipment/:slug/toggle-trim — TT-88 manual force-trim
// toggle. Flips equipment.image_trim_kind between 'border' and NULL,
// also clearing 'auto' (admin override wins). Redirects back to the
// public equipment detail page so the admin can immediately eyeball
// the result. GET redirects too, so a failed POST that doesn't
// redirect lands on a sensible page.

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

  const { data: row, error: lookupError } = await supabaseAdmin
    .from("equipment")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (lookupError) {
    Logger.error(
      "toggle-trim lookup failed",
      createLogContext("admin-equipment-toggle-trim", {
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
    const result = await toggleEquipmentTrim(
      supabaseAdmin,
      (row as { id: string }).id
    );
    Logger.info(
      "toggle-trim completed",
      createLogContext("admin-equipment-toggle-trim", {
        slug,
        userId: user.id,
      }),
      { next: result.next ?? null }
    );
    return redirect(`/equipment/${slug}`, {
      headers: sbServerClient.headers,
    });
  } catch (err) {
    Logger.error(
      "toggle-trim failed",
      createLogContext("admin-equipment-toggle-trim", {
        slug,
        userId: user.id,
      }),
      err instanceof Error ? err : undefined
    );
    return data(
      { error: err instanceof Error ? err.message : "toggle failed" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}
