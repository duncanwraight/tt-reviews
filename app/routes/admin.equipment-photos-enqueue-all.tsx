import type { Route } from "./+types/admin.equipment-photos-enqueue-all";
import { data, redirect } from "react-router";
import { ensureAdminAction } from "~/lib/admin/middleware.server";
import { Logger, createLogContext } from "~/lib/logger.server";
import type { PhotoSourceMessage } from "~/lib/photo-sourcing/queue.server";

// POST /admin/equipment-photos-enqueue-all — TT-91. Walks the
// equipment table for rows that haven't been sourced yet (no
// image_key, not skipped, no prior attempt) and sends one queue
// message per row. Replaces the chunk-by-chunk "Source next chunk"
// admin click loop. Queue's the source of throughput now: one message
// per row, max_concurrency=1 in the consumer config so QPS stays
// within Brave's 1/s cap.
//
// Action-only: GETs redirect back to the queue UI rather than 404.

export function loader() {
  return redirect("/admin/equipment-photos");
}

export async function action({ request, context }: Route.ActionArgs) {
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

  // Pull a stable list of slugs first so we can report a deterministic
  // count back to the admin UI. Pagination would matter if the queue
  // gets huge — for now the equipment table is well under the ~5k
  // single-query limit Postgres will happily return.
  const { data: rows, error } = await supabaseAdmin
    .from("equipment")
    .select("slug")
    .is("image_key", null)
    .is("image_skipped_at", null)
    .is("image_sourcing_attempted_at", null)
    .order("category", { ascending: true })
    .order("manufacturer", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    Logger.error(
      "enqueue-all: list failed",
      createLogContext("admin-equipment-photos-enqueue-all", {
        userId: user.id,
      }),
      error instanceof Error ? error : undefined
    );
    return data(
      { error: "enqueue-all list failed" },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  const slugs = (rows ?? []).map(r => (r as { slug: string }).slug);
  // Send sequentially; queue.send is fast but the count can be in the
  // thousands. Promise.all would burst harder than necessary.
  let queued = 0;
  for (const slug of slugs) {
    try {
      await env.PHOTO_SOURCE_QUEUE.send({ slug });
      queued += 1;
    } catch (err) {
      Logger.error(
        "enqueue-all: send failed",
        createLogContext("admin-equipment-photos-enqueue-all", {
          userId: user.id,
          slug,
        }),
        err instanceof Error ? err : undefined
      );
    }
  }

  Logger.info(
    "enqueue-all: completed",
    createLogContext("admin-equipment-photos-enqueue-all", {
      userId: user.id,
    }),
    { queued, listSize: slugs.length }
  );

  if (request.headers.get("accept")?.includes("application/json")) {
    return data(
      { queued, total: slugs.length },
      { headers: sbServerClient.headers }
    );
  }
  return redirect("/admin/equipment-photos", {
    headers: sbServerClient.headers,
  });
}
