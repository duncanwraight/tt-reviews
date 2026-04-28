import type { Route } from "./+types/admin.equipment.$slug.upload-photo";
import { data, redirect } from "react-router";
import { ensureAdminAction } from "~/lib/admin/middleware.server";
import {
  uploadEquipmentImage,
  UploadValidationError,
} from "~/lib/photo-sourcing/upload.server";
import { Logger, createLogContext } from "~/lib/logger.server";

// POST /admin/equipment/:slug/upload-photo — TT-99 admin direct-upload.
// Mirrors admin.equipment.$slug.toggle-trim's shape: GET redirects to
// the public detail page so a stray GET lands somewhere sensible; POST
// is admin-gated + CSRF-checked via ensureAdminAction. Multipart-only.

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
    IMAGE_BUCKET?: R2Bucket;
  };
  if (!env.IMAGE_BUCKET) {
    return data(
      { error: "R2 bucket not bound" },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  const formData = await request.formData();
  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return data(
      { error: "no file provided" },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  const { data: row, error: lookupError } = await supabaseAdmin
    .from("equipment")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (lookupError) {
    Logger.error(
      "upload-photo lookup failed",
      createLogContext("admin-equipment-upload-photo", {
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
    const result = await uploadEquipmentImage(supabaseAdmin, env.IMAGE_BUCKET, {
      equipmentId: (row as { id: string }).id,
      slug,
      file,
    });
    Logger.info(
      "upload-photo completed",
      createLogContext("admin-equipment-upload-photo", {
        slug,
        userId: user.id,
      }),
      { imageKey: result.image_key, replacedKey: result.replacedKey }
    );
    return redirect(`/equipment/${slug}`, {
      headers: sbServerClient.headers,
    });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return data(
        { error: err.message },
        { status: 400, headers: sbServerClient.headers }
      );
    }
    Logger.error(
      "upload-photo failed",
      createLogContext("admin-equipment-upload-photo", {
        slug,
        userId: user.id,
      }),
      err instanceof Error ? err : undefined
    );
    return data(
      { error: err instanceof Error ? err.message : "upload failed" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}
