// TT-243/TT-244: producer-side enqueue helper for the equipment importer.
//
// TT-243 swapped the legacy serial `queue.send` loop for `queue.sendBatch`
// in chunks of SEND_BATCH_MAX (Cloudflare's per-call cap is 100) to dodge
// the 50-subrequest cap on Workers Free. TT-244 then closed three
// stuck-job holes that survived:
//
//   * Slug dedupe (TT-244 case 1). revspin's listing can contain two
//     entries that collapse to the same `generateSlug(product.name)` —
//     e.g. variant pages with identical (manufacturer, name) on revspin's
//     side. The consumer's `recordItem` swallows 23505 on
//     UNIQUE(job_id, slug) intentionally (Cloudflare same-message
//     redelivery), so the second collision silently drops the counter.
//     The job sits at `total > processed` forever. Fix: dedupe by
//     generated slug here so the queue only carries one message per slug
//     and `total` matches the unique-insert reality.
//
//   * Total reconcile (TT-244 case 3). If a sendBatch chunk throws
//     mid-loop, `enqueued < products.length`. The trigger needs
//     `total = enqueued` to fire `finished_at`; we issue one followup
//     update to lower total. Safe because the trigger fires on every
//     items INSERT and re-checks the threshold.
//
//   * Attempts counter (TT-244 case 2). Each message carries `attempts: 0`
//     so the consumer can implement body-level retry tracking and write a
//     `failed` job_items row on final exhaustion rather than letting the
//     message die silently in the DLQ.

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
  // How many products were dropped at the dedupe step (input - unique).
  // Surfaced for diagnostics but not currently shown to the operator;
  // the job-detail page will simply show `total = unique count`.
  duplicatesDropped: number;
  // How many messages actually shipped onto the queue.
  enqueued: number;
  // Non-fatal errors from individual chunks. The DLQ catches consumer-
  // side failures separately; this surfaces producer-side hiccups
  // (Payload Too Large, transient Queue errors).
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

  // Dedupe by generated slug. Keep first occurrence; later collisions
  // would be silently dropped by the consumer's recordItem(23505) path
  // anyway — better to never enqueue them than to leak job_items
  // accounting.
  const seen = new Set<string>();
  const uniqueProducts: Array<{ product: RevspinProduct; slug: string }> = [];
  for (const product of products) {
    const slug = generateSlug(product.name);
    if (seen.has(slug)) continue;
    seen.add(slug);
    uniqueProducts.push({ product, slug });
  }
  const duplicatesDropped = products.length - uniqueProducts.length;

  const { data: job, error: jobError } = await supabase
    .from("equipment_import_jobs")
    .insert({ created_by: userId, total: uniqueProducts.length })
    .select("id")
    .single();

  if (jobError || !job) {
    return {
      status: "error",
      message: jobError?.message ?? "Failed to create import job",
    };
  }

  const jobId = job.id as string;

  const messages: Array<{ body: EquipmentImportMessage }> = uniqueProducts.map(
    ({ product, slug }) => ({
      body: {
        job_id: jobId,
        slug,
        product,
        subcategoryOverride,
        attempts: 0,
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

  // Total reconcile (TT-244 case 3). If a chunk dropped, the job row
  // still claims the full unique count. Lower it so the trigger can
  // flip finished_at once the surviving messages drain. We don't roll
  // back the inserted job — partial runs are still valuable, and
  // chunkErrors surfaces what was lost for re-click triage.
  if (enqueued < uniqueProducts.length) {
    const updateResult = await supabase
      .from("equipment_import_jobs")
      .update({ total: enqueued })
      .eq("id", jobId);
    if (updateResult.error) {
      chunkErrors.push(
        `reconcile total to ${enqueued} failed: ${updateResult.error.message}`
      );
    }
  }

  return {
    status: "ok",
    jobId,
    duplicatesDropped,
    enqueued,
    chunkErrors,
  };
}

function chunkMessages<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
