// Producer-side tests for runImport (TT-204).
//
// Producer no longer processes candidates inline — it dedupes against
// existing players + proposals, optionally backfills legacy seed-row
// ittfids via a single RPC, inserts one `pending_review` proposal
// stub per truly-new ittfid, and `sendBatch`-es queue messages onto
// `player-import-queue`. The consumer (processOnePlayerImport, tested
// separately) does ITTF enrich / R2 upload / completeness gate.
//
// What's covered here:
//   - happy-path enqueue with the right summary shape
//   - dedupe paths: ittfid match, existing proposal, ambiguous name
//   - bulk ittfid backfill RPC (success + failure rollback)
//   - sendBatch failure surfaces a summary error without spuriously
//     dropping skipped_existing
//   - re-running while a proposal exists is a no-op (zero messages
//     enqueued)
//
// What's NOT covered here (lives in queue.server.test.ts):
//   - auto_apply / queued_for_review terminal outcomes
//   - ITTF fetch / R2 upload / merge / slug-collision retry

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { runImport, type PlayerImportQueueProducer } from "../importer.server";
import { __resetIttfRateLimitForTests } from "../ittf-profile.server";
import { __resetRosterCacheForTests } from "../roster.server";
import type { R2PutBucket } from "../photo.server";
import type { PlayerImportMessage } from "../queue.server";

beforeEach(() => {
  __resetRosterCacheForTests();
  __resetIttfRateLimitForTests();
});

interface FakeDb {
  players: Array<{
    id: string;
    name: string;
    slug: string;
    ittfid: number | null;
  }>;
  proposals: Array<{
    id: string;
    ittfid: number;
    status: string;
    merged: Record<string, unknown>;
    candidates: Record<string, unknown>;
    run_log: unknown[];
  }>;
  proposalInsertFail?: { ittfid: number; message: string };
  backfillRpcFail?: string;
  backfillRpcCalls?: Array<{
    pairs: Array<{ player_id: string; ittfid: number }>;
  }>;
}

function makeSupabase(db: FakeDb): SupabaseClient {
  let nextProposalId = 1;

  return {
    from(table: string): any {
      if (table === "players") {
        return {
          select(_cols: string) {
            return Promise.resolve({
              data: db.players.map(p => ({
                id: p.id,
                name: p.name,
                ittfid: p.ittfid,
              })),
              error: null,
            });
          },
        };
      }

      if (table === "player_proposals") {
        return {
          select(_cols: string) {
            return Promise.resolve({
              data: db.proposals.map(p => ({ ittfid: p.ittfid })),
              error: null,
            });
          },
          insert(row: {
            ittfid: number;
            merged: Record<string, unknown>;
            candidates: Record<string, unknown>;
            status: string;
            run_log: unknown[];
          }) {
            const shouldFail =
              db.proposalInsertFail?.ittfid === row.ittfid
                ? db.proposalInsertFail
                : null;
            const responseFn = () => {
              if (shouldFail) {
                return Promise.resolve({
                  data: null,
                  error: { message: shouldFail.message },
                });
              }
              const inserted = {
                id: `proposal-${nextProposalId++}`,
                ittfid: row.ittfid,
                status: row.status,
                merged: row.merged,
                candidates: row.candidates,
                run_log: row.run_log,
              };
              db.proposals.push(inserted);
              return Promise.resolve({
                data: { id: inserted.id },
                error: null,
              });
            };
            return {
              select(_cols: string) {
                return {
                  single() {
                    return responseFn();
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (name === "backfill_player_ittfids") {
        const pairs = (args?.p_pairs ?? []) as Array<{
          player_id: string;
          ittfid: number;
        }>;
        if (db.backfillRpcCalls) db.backfillRpcCalls.push({ pairs });
        if (db.backfillRpcFail) {
          return Promise.resolve({
            data: null,
            error: { message: db.backfillRpcFail },
          });
        }
        for (const pair of pairs) {
          const row = db.players.find(p => p.id === pair.player_id);
          if (row && row.ittfid === null) row.ittfid = pair.ittfid;
        }
        return Promise.resolve({ data: pairs.length, error: null });
      }
      throw new Error(`unexpected rpc: ${name}`);
    },
  } as unknown as SupabaseClient;
}

function makeBucket(): R2PutBucket {
  return {
    async put() {
      // Producer never touches R2 — only the consumer does. Any call
      // here is a regression.
      throw new Error("producer should not write to R2");
    },
  };
}

interface CapturedQueue extends PlayerImportQueueProducer {
  batches: Array<Array<{ body: PlayerImportMessage }>>;
  sendBatchError?: string;
}

function makeQueue(opts: { sendBatchError?: string } = {}): CapturedQueue {
  const batches: Array<Array<{ body: PlayerImportMessage }>> = [];
  return {
    batches,
    sendBatchError: opts.sendBatchError,
    async sendBatch(messages) {
      if (opts.sendBatchError) throw new Error(opts.sendBatchError);
      batches.push(messages as Array<{ body: PlayerImportMessage }>);
    },
  };
}

interface RosterEntry {
  ittfid: number;
  fullName: string;
  nationality: string;
  countryName: string;
  gender: string;
  age: number;
  ranking: string;
  headShot: string;
}

function makeFetch(roster: RosterEntry[]): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("GetPlayersListByFilters")) {
      return new Response(JSON.stringify(roster), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("unmatched fetch", { status: 500 });
  }) as unknown as typeof fetch;
}

describe("runImport (producer)", () => {
  it("enqueues one message per truly-new ittfid and inserts proposal stubs", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();
    const queue = makeQueue();

    const roster: RosterEntry[] = [
      {
        ittfid: 132473,
        fullName: "LIN Shidong",
        nationality: "CHN",
        countryName: "China",
        gender: "M",
        age: 21,
        ranking: "1",
        headShot: "https://wtt.example/lin.jpg",
      },
      {
        ittfid: 100200,
        fullName: "JANE Doe",
        nationality: "USA",
        countryName: "United States",
        gender: "F",
        age: 30,
        ranking: "50",
        headShot: "https://wtt.example/doe.jpg",
      },
    ];

    const summary = await runImport(supabase, bucket, queue, {
      deps: { fetchImpl: makeFetch(roster) },
    });

    expect(summary.queued_for_processing).toBe(2);
    expect(summary.skipped_existing).toBe(0);
    expect(summary.errors).toHaveLength(0);

    // Two proposal stubs inserted, status=pending_review, run_log
    // seeded with a roster_match entry per stub.
    expect(db.proposals).toHaveLength(2);
    for (const p of db.proposals) {
      expect(p.status).toBe("pending_review");
      expect(p.run_log).toHaveLength(1);
      expect((p.run_log[0] as { step: string }).step).toBe("roster_match");
    }

    // sendBatch called once with both messages.
    expect(queue.batches).toHaveLength(1);
    expect(queue.batches[0]).toHaveLength(2);
    const ittfids = queue.batches[0].map(m => m.body.ittfid).sort();
    expect(ittfids).toEqual([100200, 132473]);
    // Each message carries the proposal_id so the consumer can update
    // by primary key without re-resolving by ittfid.
    for (const msg of queue.batches[0]) {
      expect(msg.body.proposal_id).toBeTruthy();
      expect(msg.body.name).toBeTruthy();
      expect(msg.body.wtt_profile_url).toContain("worldtabletennis");
    }
  });

  it("skips candidates already linked to a player by ittfid", async () => {
    const db: FakeDb = {
      players: [
        { id: "p-1", name: "Lin Shidong", slug: "lin-shidong", ittfid: 132473 },
      ],
      proposals: [],
    };
    const supabase = makeSupabase(db);
    const queue = makeQueue();

    const roster: RosterEntry[] = [
      {
        ittfid: 132473,
        fullName: "LIN Shidong",
        nationality: "CHN",
        countryName: "China",
        gender: "M",
        age: 21,
        ranking: "1",
        headShot: "",
      },
    ];

    const summary = await runImport(supabase, makeBucket(), queue, {
      deps: { fetchImpl: makeFetch(roster) },
    });

    expect(summary.queued_for_processing).toBe(0);
    expect(summary.skipped_existing).toBe(1);
    expect(queue.batches).toHaveLength(0);
    expect(db.proposals).toHaveLength(0);
  });

  it("skips candidates that already have any proposal", async () => {
    const db: FakeDb = {
      players: [],
      proposals: [
        {
          id: "prop-1",
          ittfid: 500600,
          status: "rejected",
          merged: {},
          candidates: {},
          run_log: [],
        },
      ],
    };
    const supabase = makeSupabase(db);
    const queue = makeQueue();

    const roster: RosterEntry[] = [
      {
        ittfid: 500600,
        fullName: "Pat REJECTED",
        nationality: "ESP",
        countryName: "Spain",
        gender: "F",
        age: 28,
        ranking: "200",
        headShot: "",
      },
    ];

    const summary = await runImport(supabase, makeBucket(), queue, {
      deps: { fetchImpl: makeFetch(roster) },
    });

    expect(summary.queued_for_processing).toBe(0);
    expect(summary.skipped_existing).toBe(1);
    expect(queue.batches).toHaveLength(0);
  });

  it("flags ambiguity when two unlinked seed rows share the normalised name", async () => {
    const db: FakeDb = {
      players: [
        { id: "p-1", name: "Wang Hao", slug: "wang-hao", ittfid: null },
        { id: "p-2", name: "WANG Hao", slug: "wang-hao-second", ittfid: null },
      ],
      proposals: [],
    };
    const supabase = makeSupabase(db);
    const queue = makeQueue();

    const roster: RosterEntry[] = [
      {
        ittfid: 999,
        fullName: "WANG Hao",
        nationality: "CHN",
        countryName: "China",
        gender: "M",
        age: 40,
        ranking: "200",
        headShot: "",
      },
    ];

    const summary = await runImport(supabase, makeBucket(), queue, {
      deps: { fetchImpl: makeFetch(roster) },
    });

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].message).toMatch(/ambiguous/i);
    expect(summary.queued_for_processing).toBe(0);
    expect(queue.batches).toHaveLength(0);
    // Neither seed row was modified.
    expect(db.players.every(p => p.ittfid === null)).toBe(true);
  });

  it("backfills legacy seed-row ittfids via one RPC call (TT-203)", async () => {
    const db: FakeDb = {
      players: [
        { id: "p-1", name: "Wang Chuqin", slug: "wang-chuqin", ittfid: null },
        { id: "p-2", name: "Sun Yingsha", slug: "sun-yingsha", ittfid: null },
      ],
      proposals: [],
      backfillRpcCalls: [],
    };
    const supabase = makeSupabase(db);
    const queue = makeQueue();

    const roster: RosterEntry[] = [
      {
        ittfid: 121558,
        fullName: "WANG Chuqin",
        nationality: "CHN",
        countryName: "China",
        gender: "M",
        age: 25,
        ranking: "2",
        headShot: "",
      },
      {
        ittfid: 131163,
        fullName: "SUN Yingsha",
        nationality: "CHN",
        countryName: "China",
        gender: "F",
        age: 25,
        ranking: "1",
        headShot: "",
      },
    ];

    const summary = await runImport(supabase, makeBucket(), queue, {
      deps: { fetchImpl: makeFetch(roster) },
    });

    expect(summary.skipped_existing).toBe(2);
    expect(summary.queued_for_processing).toBe(0);
    expect(summary.errors).toHaveLength(0);
    expect(db.backfillRpcCalls).toHaveLength(1);
    expect(db.backfillRpcCalls?.[0].pairs).toHaveLength(2);
    expect(db.players.find(p => p.id === "p-1")?.ittfid).toBe(121558);
    expect(db.players.find(p => p.id === "p-2")?.ittfid).toBe(131163);
    // Nothing enqueued — those candidates are now linked, not new.
    expect(queue.batches).toHaveLength(0);
  });

  it("rolls back skipped_existing when the backfill RPC fails", async () => {
    const db: FakeDb = {
      players: [
        { id: "p-1", name: "Wang Chuqin", slug: "wang-chuqin", ittfid: null },
      ],
      proposals: [],
      backfillRpcFail: "Too many subrequests by single Worker invocation",
    };
    const supabase = makeSupabase(db);
    const queue = makeQueue();
    const roster: RosterEntry[] = [
      {
        ittfid: 121558,
        fullName: "WANG Chuqin",
        nationality: "CHN",
        countryName: "China",
        gender: "M",
        age: 25,
        ranking: "2",
        headShot: "",
      },
    ];

    const summary = await runImport(supabase, makeBucket(), queue, {
      deps: { fetchImpl: makeFetch(roster) },
    });

    expect(summary.skipped_existing).toBe(0);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].message).toMatch(/bulk ittfid backfill.*1 pairs/i);
    expect(queue.batches).toHaveLength(0);
  });

  it("surfaces a single summary error when sendBatch throws (no spurious queued_for_processing)", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    const supabase = makeSupabase(db);
    const queue = makeQueue({ sendBatchError: "Queue is full" });

    const roster: RosterEntry[] = [
      {
        ittfid: 132473,
        fullName: "LIN Shidong",
        nationality: "CHN",
        countryName: "China",
        gender: "M",
        age: 21,
        ranking: "1",
        headShot: "",
      },
    ];

    const summary = await runImport(supabase, makeBucket(), queue, {
      deps: { fetchImpl: makeFetch(roster) },
    });

    expect(summary.queued_for_processing).toBe(0);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].message).toMatch(/sendBatch/i);
    // Proposal stub was already inserted before the sendBatch — that's
    // intentional, the consumer can still pick the row up if the queue
    // recovers + a future re-run re-attempts the same ittfid. (The
    // dedupe pass blocks re-enqueue while the stub exists.)
    expect(db.proposals).toHaveLength(1);
  });

  it("re-running while proposals exist is a no-op", async () => {
    // First run: enqueues. Second run (same roster, proposals now
    // exist): dedupe skips them, no new messages.
    const db: FakeDb = { players: [], proposals: [] };
    const supabase = makeSupabase(db);
    const queue = makeQueue();
    const roster: RosterEntry[] = [
      {
        ittfid: 132473,
        fullName: "LIN Shidong",
        nationality: "CHN",
        countryName: "China",
        gender: "M",
        age: 21,
        ranking: "1",
        headShot: "",
      },
    ];

    await runImport(supabase, makeBucket(), queue, {
      deps: { fetchImpl: makeFetch(roster) },
    });
    __resetRosterCacheForTests();

    const second = await runImport(supabase, makeBucket(), queue, {
      deps: { fetchImpl: makeFetch(roster) },
    });

    expect(second.queued_for_processing).toBe(0);
    expect(second.skipped_existing).toBe(1);
    expect(queue.batches).toHaveLength(1); // Only the first run.
  });

  it("skips enqueuing for a candidate whose stub insert failed", async () => {
    // Two candidates; the first proposal-insert fails. The producer
    // surfaces the error but still enqueues the second candidate.
    const db: FakeDb = {
      players: [],
      proposals: [],
      proposalInsertFail: {
        ittfid: 132473,
        message: "unique constraint violation",
      },
    };
    const supabase = makeSupabase(db);
    const queue = makeQueue();
    const roster: RosterEntry[] = [
      {
        ittfid: 132473,
        fullName: "LIN Shidong",
        nationality: "CHN",
        countryName: "China",
        gender: "M",
        age: 21,
        ranking: "1",
        headShot: "",
      },
      {
        ittfid: 100200,
        fullName: "JANE Doe",
        nationality: "USA",
        countryName: "United States",
        gender: "F",
        age: 30,
        ranking: "50",
        headShot: "",
      },
    ];

    const summary = await runImport(supabase, makeBucket(), queue, {
      deps: { fetchImpl: makeFetch(roster) },
    });

    expect(summary.queued_for_processing).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].ittfid).toBe(132473);
    expect(queue.batches).toHaveLength(1);
    expect(queue.batches[0]).toHaveLength(1);
    expect(queue.batches[0][0].body.ittfid).toBe(100200);
  });
});
