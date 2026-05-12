import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applyPlayerProposal,
  rejectPlayerProposal,
} from "../player-proposal-applier.server";

// Hand-rolled Supabase stub mirroring player-submission-applier.server.test.ts.
// Covers the paths the applier exercises:
//   - from("player_proposals").select(cols).eq("id", X).single() → proposal | error
//   - from("players").insert(payload).select("id").single() → row | unique_violation
//   - from("player_proposals").update(payload).eq("id", X)   → captured (status flip)
//   - from("player_proposals").update(payload).eq("id", X).eq("status", "pending_review") → captured (reject)

interface StubState {
  proposal?: {
    id: string;
    ittfid: number;
    status: string;
    merged: Record<string, unknown>;
  };
  proposalReadError?: { message: string };
  // Sequence of insert outcomes per attempt. First entry = first call.
  insertOutcomes?: Array<
    { ok: true; id: string } | { ok: false; code?: string; message: string }
  >;
  updateError?: { message: string };
}

interface CapturedInsert {
  table: string;
  payload: Record<string, unknown>;
}

interface CapturedUpdate {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ col: string; value: unknown }>;
}

function makeStub(state: StubState) {
  const inserts: CapturedInsert[] = [];
  const updates: CapturedUpdate[] = [];
  const outcomes = [...(state.insertOutcomes ?? [])];

  function from(table: string) {
    if (table === "player_proposals") {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _value: string) {
              return {
                single: async () =>
                  state.proposalReadError
                    ? { data: null, error: state.proposalReadError }
                    : { data: state.proposal ?? null, error: null },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          const filters: Array<{ col: string; value: unknown }> = [];
          const builder = {
            eq(col: string, value: unknown) {
              filters.push({ col, value });
              const out = {
                eq(c2: string, v2: unknown) {
                  filters.push({ col: c2, value: v2 });
                  updates.push({ table, payload, filters });
                  return Promise.resolve({
                    data: null,
                    error: state.updateError ?? null,
                  });
                },
                then(resolve: (v: unknown) => unknown, reject?: unknown) {
                  updates.push({ table, payload, filters });
                  return Promise.resolve({
                    data: null,
                    error: state.updateError ?? null,
                  }).then(resolve, reject as never);
                },
              };
              return out;
            },
          };
          return builder;
        },
      };
    }
    if (table === "players") {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          return {
            select(_cols: string) {
              return {
                single: async () => {
                  const next = outcomes.shift();
                  if (!next) {
                    return {
                      data: null,
                      error: { message: "no more insert outcomes configured" },
                    };
                  }
                  if (next.ok) {
                    return { data: { id: next.id }, error: null };
                  }
                  return {
                    data: null,
                    error: { code: next.code, message: next.message },
                  };
                },
              };
            },
          };
        },
      };
    }
    throw new Error(`unexpected from(${table})`);
  }

  return { client: { from } as unknown as SupabaseClient, inserts, updates };
}

describe("applyPlayerProposal", () => {
  const baseProposal = {
    id: "prop-1",
    ittfid: 42,
    status: "pending_review",
    merged: {
      name: "Felix Lebrun",
      represents: "FRA",
      gender: "M" as const,
    },
  };

  it("inserts a player row, sets ittfid + slug, and flips proposal to applied", async () => {
    const stub = makeStub({
      proposal: baseProposal,
      insertOutcomes: [{ ok: true, id: "player-99" }],
    });

    const result = await applyPlayerProposal(stub.client, "prop-1", "admin-1");

    expect(result.ok).toBe(true);
    expect(result.player_id).toBe("player-99");
    expect(result.slug).toBe("felix-lebrun");

    expect(stub.inserts).toHaveLength(1);
    expect(stub.inserts[0]!.payload).toMatchObject({
      name: "Felix Lebrun",
      slug: "felix-lebrun",
      ittfid: 42,
      represents: "FRA",
      gender: "M",
      active: true,
    });

    expect(stub.updates).toHaveLength(1);
    expect(stub.updates[0]!.payload).toMatchObject({
      status: "applied",
      reviewed_by: "admin-1",
      applied_player_id: "player-99",
    });
  });

  it("retries with -2, -3 suffix on slug collisions", async () => {
    const stub = makeStub({
      proposal: baseProposal,
      insertOutcomes: [
        {
          ok: false,
          code: "23505",
          message:
            'duplicate key value violates unique constraint "players_slug_key"',
        },
        {
          ok: false,
          code: "23505",
          message:
            'duplicate key value violates unique constraint "players_slug_key"',
        },
        { ok: true, id: "player-50" },
      ],
    });

    const result = await applyPlayerProposal(stub.client, "prop-1", "admin-1");

    expect(result.ok).toBe(true);
    expect(result.slug).toBe("felix-lebrun-3");

    const insertedSlugs = stub.inserts.map(i => i.payload.slug);
    expect(insertedSlugs).toEqual([
      "felix-lebrun",
      "felix-lebrun-2",
      "felix-lebrun-3",
    ]);
  });

  it("returns error on a non-slug unique-violation (e.g. ittfid collision)", async () => {
    const stub = makeStub({
      proposal: baseProposal,
      insertOutcomes: [
        {
          ok: false,
          code: "23505",
          message:
            'duplicate key value violates unique constraint "players_ittfid_key"',
        },
      ],
    });

    const result = await applyPlayerProposal(stub.client, "prop-1", "admin-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/players_ittfid_key/);
  });

  it("rejects a proposal that isn't pending_review", async () => {
    const stub = makeStub({
      proposal: { ...baseProposal, status: "applied" },
    });

    const result = await applyPlayerProposal(stub.client, "prop-1", "admin-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/is applied/);
    expect(stub.inserts).toHaveLength(0);
  });

  it("rejects a proposal whose merged.name is empty", async () => {
    const stub = makeStub({
      proposal: { ...baseProposal, merged: {} },
    });

    const result = await applyPlayerProposal(stub.client, "prop-1", "admin-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/name is missing/);
  });
});

describe("rejectPlayerProposal", () => {
  it("updates status to rejected with reviewer metadata", async () => {
    const stub = makeStub({});
    const result = await rejectPlayerProposal(stub.client, "prop-1", "admin-1");
    expect(result.ok).toBe(true);
    expect(stub.updates[0]!.payload).toMatchObject({
      status: "rejected",
      reviewed_by: "admin-1",
    });
    expect(stub.updates[0]!.filters).toEqual([
      { col: "id", value: "prop-1" },
      { col: "status", value: "pending_review" },
    ]);
  });

  it("surfaces the supabase error verbatim", async () => {
    const stub = makeStub({ updateError: { message: "boom" } });
    const result = await rejectPlayerProposal(stub.client, "prop-1", "admin-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("boom");
  });
});
