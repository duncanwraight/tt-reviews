import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findSlugRedirect, recordSlugRedirect } from "../slug-redirects.server";

// Hand-rolled Supabase stub that returns canned responses per chain
// shape. The recordSlugRedirect path issues three calls in order
// (delete / update / upsert), so we capture them in an array and
// assert the exact sequence rather than the table state.

interface CapturedCall {
  table: string;
  op: "select" | "delete" | "update" | "upsert";
  payload?: unknown;
  match?: Record<string, unknown>;
  filters?: Array<[string, unknown]>;
}

interface StubOptions {
  // Response for the .maybeSingle() at the end of the SELECT chain.
  selectData?: Record<string, unknown> | null;
  selectError?: { message: string } | null;
  // Errors to inject on each write op (per-call).
  deleteError?: { message: string } | null;
  updateError?: { message: string } | null;
  upsertError?: { message: string } | null;
}

function makeClient(opts: StubOptions = {}) {
  const calls: CapturedCall[] = [];

  function from(table: string) {
    return {
      select(_cols: string) {
        const filters: Array<[string, unknown]> = [];
        const builder: Record<string, unknown> = {
          eq(col: string, value: unknown) {
            filters.push([col, value]);
            return builder;
          },
          maybeSingle: async () => {
            calls.push({ table, op: "select", filters });
            return {
              data: opts.selectData ?? null,
              error: opts.selectError ?? null,
            };
          },
        };
        return builder;
      },
      delete() {
        return {
          match(payload: Record<string, unknown>) {
            calls.push({ table, op: "delete", match: payload });
            return Promise.resolve({ error: opts.deleteError ?? null });
          },
        };
      },
      update(payload: Record<string, unknown>) {
        return {
          match(matchPayload: Record<string, unknown>) {
            calls.push({
              table,
              op: "update",
              payload,
              match: matchPayload,
            });
            return Promise.resolve({ error: opts.updateError ?? null });
          },
        };
      },
      upsert(payload: Record<string, unknown>, _options: unknown) {
        calls.push({ table, op: "upsert", payload });
        return Promise.resolve({ error: opts.upsertError ?? null });
      },
    };
  }

  return {
    client: { from } as unknown as SupabaseClient,
    calls,
  };
}

describe("findSlugRedirect", () => {
  it("returns the new_slug when a row exists", async () => {
    const stub = makeClient({ selectData: { new_slug: "butterfly-viscaria" } });
    const result = await findSlugRedirect(
      stub.client,
      "equipment",
      "old-viscaria"
    );
    expect(result).toBe("butterfly-viscaria");
    expect(stub.calls).toEqual([
      {
        table: "slug_redirects",
        op: "select",
        filters: [
          ["entity_type", "equipment"],
          ["old_slug", "old-viscaria"],
        ],
      },
    ]);
  });

  it("returns null when no row exists", async () => {
    const stub = makeClient({ selectData: null });
    const result = await findSlugRedirect(stub.client, "player", "missing");
    expect(result).toBeNull();
  });

  it("returns null when the row is missing new_slug", async () => {
    // Defensive — should never happen given the NOT NULL constraint
    // but the helper's contract is "string | null", not "throw".
    const stub = makeClient({ selectData: { unrelated: "x" } });
    const result = await findSlugRedirect(stub.client, "equipment", "x");
    expect(result).toBeNull();
  });
});

describe("recordSlugRedirect", () => {
  it("is a no-op when oldSlug === newSlug", async () => {
    const stub = makeClient();
    const result = await recordSlugRedirect(
      stub.client,
      "equipment",
      "same",
      "same",
      null
    );
    expect(result).toEqual({ ok: true });
    expect(stub.calls).toHaveLength(0);
  });

  it("issues delete → update → upsert in order", async () => {
    const stub = makeClient();
    const result = await recordSlugRedirect(
      stub.client,
      "equipment",
      "old-name",
      "new-name",
      "user-uuid"
    );

    expect(result).toEqual({ ok: true });
    expect(stub.calls).toHaveLength(3);

    // A) DELETE shadowing rows (any row whose old_slug is the new one).
    expect(stub.calls[0]).toEqual({
      table: "slug_redirects",
      op: "delete",
      match: { entity_type: "equipment", old_slug: "new-name" },
    });

    // B) UPDATE: collapse chains pointing at oldSlug to point at newSlug.
    expect(stub.calls[1]).toEqual({
      table: "slug_redirects",
      op: "update",
      payload: { new_slug: "new-name" },
      match: { entity_type: "equipment", new_slug: "old-name" },
    });

    // C) UPSERT the new redirect row with audit info.
    expect(stub.calls[2]).toEqual({
      table: "slug_redirects",
      op: "upsert",
      payload: {
        entity_type: "equipment",
        old_slug: "old-name",
        new_slug: "new-name",
        created_by: "user-uuid",
      },
    });
  });

  it("propagates a delete error and short-circuits", async () => {
    const stub = makeClient({ deleteError: { message: "rls denied" } });
    const result = await recordSlugRedirect(
      stub.client,
      "equipment",
      "a",
      "b",
      null
    );
    expect(result).toEqual({ ok: false, error: "rls denied" });
    // Only the delete attempt fired; later steps short-circuited.
    expect(stub.calls).toHaveLength(1);
  });

  it("propagates an update error and short-circuits", async () => {
    const stub = makeClient({ updateError: { message: "boom" } });
    const result = await recordSlugRedirect(
      stub.client,
      "equipment",
      "a",
      "b",
      null
    );
    expect(result).toEqual({ ok: false, error: "boom" });
    expect(stub.calls.map(c => c.op)).toEqual(["delete", "update"]);
  });

  it("propagates an upsert error", async () => {
    const stub = makeClient({ upsertError: { message: "unique violation" } });
    const result = await recordSlugRedirect(
      stub.client,
      "player",
      "a",
      "b",
      null
    );
    expect(result).toEqual({ ok: false, error: "unique violation" });
    expect(stub.calls.map(c => c.op)).toEqual(["delete", "update", "upsert"]);
  });

  it("accepts null createdBy (Discord moderation pathway)", async () => {
    const stub = makeClient();
    await recordSlugRedirect(stub.client, "equipment", "a", "b", null);
    const upsert = stub.calls.find(c => c.op === "upsert");
    expect(upsert?.payload).toMatchObject({ created_by: null });
  });
});
