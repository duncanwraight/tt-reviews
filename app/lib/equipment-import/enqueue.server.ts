// TT-243: producer-side enqueue helper for the equipment importer.
//
// TT-238 split the import into a producer (this) + consumer
// (queue.server.ts) but left the producer doing one `queue.send` per
// product. Each send is one Cloudflare subrequest, so anything over
// ~48 selected products blew past the 50-subrequest cap and the action
// 500ed mid-loop with only a partial batch on the queue. Same shape
// that bit TT-206 on the player importer.
//
// This helper inserts the equipment_import_jobs row, generates one
// message per product, and ships them via `queue.sendBatch` in chunks
// of SEND_BATCH_MAX (Cloudflare's per-call cap is 100). A 1000-product
// run is then 1 insert + 10 sendBatch calls = 11 subrequests, well
// under the cap. Per-chunk failures are reported but don't abort the
// remaining chunks — we'd rather get N-1 chunks shipped than throw
// the whole click away.

import type { SupabaseClient } from "@supabase/supabase-js";

import { generateSlug, type RevspinProduct } from "../revspin.server";
import type { EquipmentImportMessage } from "./queue.server";

// Cloudflare Queues `sendBatch` caps at 100 messages per call.
export const SEND_BATCH_MAX = 100;

export interface EquipmentImportQueueProducer {
  sendBatch(
    messages: Array<{ body: EquipmentImportMessage }>
  ): Promise<unknown>;
}

export interface EnqueueArgs {
  supabase: SupabaseClient;
  queue: EquipmentImportQueueProducer;
  userId: string;
  products: RevspinProduct[];
  subcategoryOverride: string | null;
}

export interface EnqueueSuccess {
  status: "ok";
  jobId: string;
  enqueued: number;
  // Non-fatal errors from individual chunks. The DLQ catches consumer-
  // side failures separately; this surfaces producer-side hiccups
  // (Payload Too Large, transient Queue errors) so the admin can
  // re-click after the page redirects to the job detail.
  chunkErrors: string[];
}

export interface EnqueueFailure {
  status: "error";
  message: string;
}

export type EnqueueOutcome = EnqueueSuccess | EnqueueFailure;

export async function enqueueEquipmentImport(
  args: EnqueueArgs
): Promise<EnqueueOutcome> {
  const { supabase, queue, userId, products, subcategoryOverride } = args;

  if (products.length === 0) {
    return { status: "error", message: "No products selected" };
  }

  const { data: job, error: jobError } = await supabase
    .from("equipment_import_jobs")
    .insert({ created_by: userId, total: products.length })
    .select("id")
    .single();

  if (jobError || !job) {
    return {
      status: "error",
      message: jobError?.message ?? "Failed to create import job",
    };
  }

  const jobId = job.id as string;

  const messages: Array<{ body: EquipmentImportMessage }> = products.map(
    product => ({
      body: {
        job_id: jobId,
        slug: generateSlug(product.name),
        product,
        subcategoryOverride,
      },
    })
  );

  const chunks = chunkMessages(messages, SEND_BATCH_MAX);
  let enqueued = 0;
  const chunkErrors: string[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    try {
      await queue.sendBatch(chunk);
      enqueued += chunk.length;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      chunkErrors.push(
        `chunk ${i + 1}/${chunks.length} (${chunk.length} messages): ${reason}`
      );
    }
  }

  return { status: "ok", jobId, enqueued, chunkErrors };
}

function chunkMessages<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
