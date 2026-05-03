// Spec-sourcing cron handler (TT-149). Called from workers/app.ts's
// scheduled() handler on the `0 */6 * * *` trigger. One job: pick a
// batch of equipment due for spec sourcing and enqueue one queue
// message per row.
//
// Subrequest budget: enqueue uses one PostgREST RPC call (pick_spec_
// source_batch) + N queue.send() calls. With BATCH_SIZE=20 that's 21
// subrequests per cron tick — well under the 50/invocation cap on
// the Cloudflare Workers Free plan (CLAUDE.md "50-subrequest cap").

import type { SupabaseClient } from "@supabase/supabase-js";

import { Logger, type LogContext } from "../logger.server";
import type { SpecSourceMessage } from "./types";

const DEFAULT_BATCH_SIZE = 20;

export interface SpecSourceQueueProducer {
  send(
    message: SpecSourceMessage,
    options?: { delaySeconds?: number }
  ): Promise<unknown>;
}

interface PickedRow {
  equipment_id: string;
  slug: string;
  brand: string;
  name: string;
  category: string | null;
  subcategory: string | null;
}

export interface EnqueueResult {
  picked: number;
  enqueued: number;
}

export interface EnqueueOptions {
  batchSize?: number;
}

// Pure orchestrator — pulls due rows via the SECURITY DEFINER RPC
// and enqueues one message per row. The supabase client must be a
// service-role client; the RPC is granted EXECUTE only to that role.
export async function enqueueSpecSourceBatch(
  supabase: SupabaseClient,
  queue: SpecSourceQueueProducer,
  ctxLog: LogContext,
  options: EnqueueOptions = {}
): Promise<EnqueueResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  const { data, error } = await supabase.rpc("pick_spec_source_batch", {
    p_limit: batchSize,
  });

  if (error) {
    Logger.error(
      "spec-sourcing.enqueue.rpc-failed",
      ctxLog,
      new Error(error.message)
    );
    throw new Error(`pick_spec_source_batch failed: ${error.message}`);
  }

  const rows = (data as PickedRow[] | null) ?? [];
  if (rows.length === 0) {
    Logger.info("spec-sourcing.enqueue.empty", ctxLog, { picked: 0 });
    return { picked: 0, enqueued: 0 };
  }

  let enqueued = 0;
  for (const row of rows) {
    try {
      await queue.send({
        equipmentId: row.equipment_id,
        slug: row.slug,
        brand: row.brand,
        name: row.name,
        category: row.category,
        subcategory: row.subcategory,
        attempts: 0,
      });
      enqueued++;
    } catch (err) {
      Logger.error(
        "spec-sourcing.enqueue.send-failed",
        ctxLog,
        err instanceof Error ? err : new Error(String(err))
      );
      // Continue past single-message send failures — the cron will
      // re-pick the same row on the next tick because we haven't
      // stamped specs_sourced_at yet.
    }
  }

  Logger.info("spec-sourcing.enqueue.done", ctxLog, {
    picked: rows.length,
    enqueued,
  });
  return { picked: rows.length, enqueued };
}
