// Equipment importer queue consumer (TT-238). The admin /admin/import
// page used to do all N product inserts inline in a single Worker
// invocation; with two subrequests per product (SELECT-then-INSERT)
// the 50-subrequest cap on Cloudflare Workers Free meant ~25 was the
// hard ceiling and a 1000-product Andro K9 import surfaced as 1000+
// failures. Now the action enqueues one message per product onto
// EQUIPMENT_IMPORT_QUEUE; this module is the consumer, called from
// workers/app.ts.
//
// Per-message subrequest budget (well under 50):
//   1. INSERT equipment ON CONFLICT (slug) DO NOTHING — 1 subrequest.
//      We use upsert-style semantics so a Cloudflare-internal retry of
//      the same message after the first attempt already wrote the row
//      doesn't double-count or error.
//   2. INSERT equipment_import_job_items — 1 subrequest. UNIQUE
//      (job_id, slug) makes this idempotent against retries too; the
//      DB-side trigger keeps the job's success_count / failed_count
//      counters in lockstep.
//
// Cloudflare's max_retries=3 on this queue handles transient DB
// blips; the job_items.UNIQUE(job_id, slug) constraint is the
// idempotency barrier so retries can't double-count.

import type { SupabaseClient } from "@supabase/supabase-js";

import { stripManufacturerPrefix } from "../equipment";
import type { RevspinProduct } from "../revspin.server";

// TT-244 case 2: body-level retry budget. The Cloudflare-queue
// max_retries=3 also exists but is opaque (we can't observe it from
// within the handler), so we keep our own counter on the message body.
// Match the value to wrangler.toml's max_retries so behaviour stays
// consistent if Cloudflare's retry policy ever drops us to the DLQ
// before our counter has tripped.
export const EQUIPMENT_IMPORT_MAX_ATTEMPTS = 3;

export function computeEquipmentImportRetryDelaySeconds(
  attempts: number
): number {
  // Exponential backoff in minutes, capped at 60. Matches the photo-
  // and spec-sourcing queues. attempts=1 → 2m, 2 → 4m, 3 → 8m.
  const minutes = Math.min(60, 2 ** attempts);
  return minutes * 60;
}

export type RetryDecision =
  | { kind: "retry"; attempts: number; delaySeconds: number }
  | { kind: "final_fail"; attempts: number };

export function decideEquipmentImportRetry(
  message: EquipmentImportMessage
): RetryDecision {
  const attempts = (message.attempts ?? 0) + 1;
  if (attempts >= EQUIPMENT_IMPORT_MAX_ATTEMPTS) {
    return { kind: "final_fail", attempts };
  }
  return {
    kind: "retry",
    attempts,
    delaySeconds: computeEquipmentImportRetryDelaySeconds(attempts),
  };
}

export interface EquipmentImportMessage {
  job_id: string;
  // Pre-generated client-side so the consumer doesn't need to re-derive
  // (cheap, but threads the same value through both the equipment row
  // and the job_items row, so a single grep on slug ties them together).
  slug: string;
  // Full RevspinProduct so the consumer is self-contained and doesn't
  // have to re-fetch from revspin.net. RevspinProduct.specifications is
  // ~1-3KB per product — well under Cloudflare Queue's 128KB message cap.
  product: RevspinProduct;
  // Override applied to all products in this job (or null to use the
  // product's parsed subcategory). Same semantics as the previous
  // inline action.
  subcategoryOverride: string | null;
  // TT-244 case 2: body-level attempts counter. Consumer increments
  // on uncaught throw and re-enqueues until attempts >= max_retries,
  // then writes a `failed` job_items row instead of letting the
  // message die silently in the DLQ.
  attempts?: number;
}

export type ProcessEquipmentImportOutcome =
  | { status: "inserted" }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

interface RecordItemArgs {
  jobId: string;
  slug: string;
  productName: string;
  status: "success" | "failed";
  message: string | null;
}

async function recordItem(
  supabase: SupabaseClient,
  args: RecordItemArgs
): Promise<void> {
  // Idempotent: UNIQUE(job_id, slug) on equipment_import_job_items
  // means a Cloudflare retry of the same message hits a 23505 here
  // which we treat as already-recorded. We deliberately don't surface
  // that as an error to the outer outcome — the first write counted.
  const { error } = await supabase.from("equipment_import_job_items").insert({
    job_id: args.jobId,
    slug: args.slug,
    product_name: args.productName,
    status: args.status,
    message: args.message,
  });
  if (error && error.code !== "23505") {
    throw new Error(`failed to record item: ${error.message}`);
  }
}

// TT-244 case 2: write the final-failure job_items row after the
// consumer has exhausted its retry budget. Called from workers/app.ts
// when `decideEquipmentImportRetry` returns "final_fail". Same shape
// as the per-item error path so the trigger increments failed_count
// and the job can finish — no silent counter leak via DLQ.
export async function recordEquipmentImportFinalFailure(
  supabase: SupabaseClient,
  message: EquipmentImportMessage,
  error: Error,
  attempts: number
): Promise<void> {
  await recordItem(supabase, {
    jobId: message.job_id,
    slug: message.slug,
    productName: message.product.name,
    status: "failed",
    message: `Exhausted ${attempts} attempts: ${error.message}`,
  });
}

export async function processOneEquipmentImport(
  supabase: SupabaseClient,
  message: EquipmentImportMessage
): Promise<ProcessEquipmentImportOutcome> {
  const { job_id, slug, product, subcategoryOverride } = message;
  const subcategory = subcategoryOverride || product.subcategory || null;
  const displayName = product.name;

  // INSERT ... ON CONFLICT (slug) DO NOTHING via PostgREST. supabase-js
  // doesn't expose ON CONFLICT DO NOTHING directly, so we use upsert
  // with the slug conflict target and ignoreDuplicates=true (which maps
  // to ON CONFLICT DO NOTHING server-side). returning='minimal' keeps
  // the response small.
  const { error: insertError, count } = await supabase.from("equipment").upsert(
    {
      name: stripManufacturerPrefix(product.name, product.manufacturer),
      slug,
      manufacturer: product.manufacturer,
      category: product.category,
      subcategory,
      specifications: product.specifications,
    },
    {
      onConflict: "slug",
      ignoreDuplicates: true,
      count: "exact",
    }
  );

  if (insertError) {
    const errMessage = insertError.message;
    await recordItem(supabase, {
      jobId: job_id,
      slug,
      productName: displayName,
      status: "failed",
      message: errMessage,
    });
    return { status: "error", message: errMessage };
  }

  // upsert with ignoreDuplicates returns count=0 when the conflict
  // path was taken (row already existed); count=1 when a row was
  // inserted. Treat 0 as a soft skip — the import flow's contract is
  // "import what isn't there yet", so duplicate slugs in a fresh import
  // run are still a successful no-op from the operator's perspective,
  // not a failure that should be flagged red in the UI.
  if (count === 0) {
    await recordItem(supabase, {
      jobId: job_id,
      slug,
      productName: displayName,
      status: "failed",
      message: "Already exists",
    });
    return { status: "skipped", reason: "Already exists" };
  }

  await recordItem(supabase, {
    jobId: job_id,
    slug,
    productName: displayName,
    status: "success",
    message: null,
  });
  return { status: "inserted" };
}
