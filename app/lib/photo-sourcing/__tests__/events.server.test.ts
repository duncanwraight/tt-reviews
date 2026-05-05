import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordPhotoEvent } from "../events.server";

vi.mock("../../logger.server", () => ({
  Logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  createLogContext: (id: string, extra?: Record<string, unknown>) => ({
    requestId: id,
    ...extra,
  }),
}));

import { Logger } from "../../logger.server";

function fakeSupabase(opts: { insertError?: string } = {}) {
  const inserts: Array<Record<string, unknown>> = [];
  const insert = vi.fn(async (payload: Record<string, unknown>) => {
    inserts.push(payload);
    if (opts.insertError) {
      return { error: { message: opts.insertError } };
    }
    return { error: null };
  });
  const client = {
    from(table: string) {
      if (table !== "equipment_photo_events") {
        throw new Error(`unexpected table: ${table}`);
      }
      return { insert };
    },
  } as unknown as SupabaseClient;
  return { client, inserts, insert };
}

describe("recordPhotoEvent", () => {
  it("inserts the event row with default actorId null and metadata {}", async () => {
    const { client, inserts } = fakeSupabase();

    await recordPhotoEvent(client, {
      equipmentId: "eq-1",
      eventKind: "sourcing_attempted",
    });

    expect(inserts).toEqual([
      {
        equipment_id: "eq-1",
        event_kind: "sourcing_attempted",
        actor_id: null,
        metadata: {},
      },
    ]);
  });

  it("forwards actorId and metadata when provided", async () => {
    const { client, inserts } = fakeSupabase();

    await recordPhotoEvent(client, {
      equipmentId: "eq-1",
      eventKind: "picked",
      actorId: "admin-uuid",
      metadata: { candidate_id: "c1", r2_key: "x.png" },
    });

    expect(inserts).toEqual([
      {
        equipment_id: "eq-1",
        event_kind: "picked",
        actor_id: "admin-uuid",
        metadata: { candidate_id: "c1", r2_key: "x.png" },
      },
    ]);
  });

  // The helper is called from inside admin actions, the queue
  // consumer, and the cron path. A failure here must NOT abort the
  // underlying step — the audit log is best-effort. Surface via
  // Logger.error so prod can detect repeated failures.
  it("logs and swallows insert errors instead of throwing", async () => {
    const { client } = fakeSupabase({ insertError: "permission denied" });

    await expect(
      recordPhotoEvent(client, {
        equipmentId: "eq-1",
        eventKind: "picked",
      })
    ).resolves.toBeUndefined();

    expect(Logger.error).toHaveBeenCalledWith(
      "photo.event.insert_failed",
      expect.objectContaining({
        equipmentId: "eq-1",
        eventKind: "picked",
      }),
      expect.any(Error)
    );
  });
});
