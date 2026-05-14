import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applyPlayerProposal,
  rejectPlayerProposal,
} from "../player-proposal-applier.server";
import type { R2PutBucket } from "~/lib/players/photo.server";
import type { MergedPlayer } from "~/lib/players/types";

afterEach(() => {
  vi.restoreAllMocks();
});

interface ProposalRow {
  id: string;
  ittfid: number;
  merged: MergedPlayer;
  status: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  applied_player_id?: string | null;
}

interface FakeDb {
  proposals: ProposalRow[];
  players: Array<{ id: string; name: string; slug: string; ittfid: number }>;
}

function makeSupabase(db: FakeDb): SupabaseClient {
  let nextPlayerId = 1;

  return {
    from(table: string): any {
      if (table === "player_proposals") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, val: string) {
                return {
                  maybeSingle() {
                    const row = db.proposals.find(p => p.id === val);
                    return Promise.resolve({
                      data: row ?? null,
                      error: null,
                    });
                  },
                };
              },
            };
          },
          update(patch: Partial<ProposalRow>) {
            return {
              eq(_col1: string, val1: string) {
                const apply = (extraFilter?: (p: ProposalRow) => boolean) => {
                  const row = db.proposals.find(
                    p => p.id === val1 && (extraFilter ? extraFilter(p) : true)
                  );
                  if (!row) return { data: null, error: null };
                  Object.assign(row, patch);
                  return { data: null, error: null };
                };
                return {
                  eq(_col2: string, val2: string) {
                    return Promise.resolve(apply(p => p.status === val2));
                  },
                  then(resolve: (v: unknown) => unknown) {
                    return Promise.resolve(apply()).then(resolve);
                  },
                };
              },
            };
          },
        };
      }

      if (table === "players") {
        return {
          insert(row: { name: string; slug: string; ittfid: number }) {
            return {
              select(_cols: string) {
                return {
                  single() {
                    if (db.players.some(p => p.slug === row.slug)) {
                      return Promise.resolve({
                        data: null,
                        error: { code: "23505", message: "slug exists" },
                      });
                    }
                    const inserted = {
                      id: `player-${nextPlayerId++}`,
                      name: row.name,
                      slug: row.slug,
                      ittfid: row.ittfid,
                    };
                    db.players.push(inserted);
                    return Promise.resolve({
                      data: { id: inserted.id, slug: inserted.slug },
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

function makeBucket(): R2PutBucket {
  return { async put() {} };
}

function fetchImage(status: number): typeof fetch {
  return vi.fn(async () => {
    if (status >= 400) return new Response("nope", { status });
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
      status,
      headers: { "content-type": "image/jpeg" },
    });
  }) as unknown as typeof fetch;
}

function makeMerged(overrides: Partial<MergedPlayer> = {}): MergedPlayer {
  return {
    ittfid: 132473,
    name: "Lin Shidong",
    represents: "CHN",
    gender: "M",
    handedness: "right",
    grip: "shakehand",
    birth_year: 2003,
    player_kind: "professional",
    headshot_url: "https://wtt.example/lin.jpg",
    wtt_profile_url:
      "https://www.worldtabletennis.com/playerDescription?playerId=132473",
    ittf_profile_url: "https://results.ittf.link/.../132473",
    per_field_source: {},
    ...overrides,
  };
}

describe("applyPlayerProposal", () => {
  it("materialises a players row + flips proposal to applied", async () => {
    const db: FakeDb = {
      proposals: [
        {
          id: "prop-1",
          ittfid: 132473,
          merged: makeMerged(),
          status: "pending_review",
        },
      ],
      players: [],
    };
    const supabase = makeSupabase(db);

    const result = await applyPlayerProposal(
      supabase,
      makeBucket(),
      "prop-1",
      "admin-uid",
      fetchImage(200)
    );

    expect(result.ok).toBe(true);
    expect(result.playerSlug).toBe("lin-shidong");
    expect(db.players).toHaveLength(1);
    expect(db.proposals[0]).toMatchObject({
      status: "applied",
      reviewed_by: "admin-uid",
      applied_player_id: db.players[0].id,
    });
  });

  it("refuses to apply a proposal that isn't pending_review", async () => {
    const db: FakeDb = {
      proposals: [
        {
          id: "prop-1",
          ittfid: 1,
          merged: makeMerged(),
          status: "applied",
        },
      ],
      players: [],
    };
    const result = await applyPlayerProposal(
      makeSupabase(db),
      makeBucket(),
      "prop-1",
      "admin-uid",
      fetchImage(200)
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not pending_review/);
    expect(db.players).toHaveLength(0);
  });

  it("returns an error when the proposal is missing", async () => {
    const result = await applyPlayerProposal(
      makeSupabase({ proposals: [], players: [] }),
      makeBucket(),
      "nope",
      "admin-uid",
      fetchImage(200)
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/);
  });

  it("applies even when the headshot retry fails (image_key stays null)", async () => {
    const db: FakeDb = {
      proposals: [
        {
          id: "prop-1",
          ittfid: 1,
          merged: makeMerged({
            headshot_url: "https://wtt.example/missing.jpg",
          }),
          status: "pending_review",
        },
      ],
      players: [],
    };
    const result = await applyPlayerProposal(
      makeSupabase(db),
      makeBucket(),
      "prop-1",
      "admin-uid",
      fetchImage(404)
    );

    expect(result.ok).toBe(true);
    expect(db.players).toHaveLength(1);
  });

  it("retries with ittfid-suffixed slug on collision", async () => {
    const db: FakeDb = {
      proposals: [
        {
          id: "prop-1",
          ittfid: 999,
          merged: makeMerged({ name: "Wang Hao", ittfid: 999 }),
          status: "pending_review",
        },
      ],
      players: [
        { id: "p-old", name: "Wang Hao", slug: "wang-hao", ittfid: 50 },
      ],
    };
    const result = await applyPlayerProposal(
      makeSupabase(db),
      makeBucket(),
      "prop-1",
      "admin-uid",
      fetchImage(200)
    );

    expect(result.ok).toBe(true);
    expect(result.playerSlug).toBe("wang-hao-999");
  });
});

describe("rejectPlayerProposal", () => {
  it("marks a pending proposal rejected", async () => {
    const db: FakeDb = {
      proposals: [
        {
          id: "prop-1",
          ittfid: 1,
          merged: makeMerged(),
          status: "pending_review",
        },
      ],
      players: [],
    };

    const result = await rejectPlayerProposal(
      makeSupabase(db),
      "prop-1",
      "admin-uid"
    );

    expect(result.ok).toBe(true);
    expect(db.proposals[0].status).toBe("rejected");
    expect(db.proposals[0].reviewed_by).toBe("admin-uid");
  });

  it("is a no-op on an already-applied proposal (status guard)", async () => {
    const db: FakeDb = {
      proposals: [
        {
          id: "prop-1",
          ittfid: 1,
          merged: makeMerged(),
          status: "applied",
        },
      ],
      players: [],
    };

    const result = await rejectPlayerProposal(
      makeSupabase(db),
      "prop-1",
      "admin-uid"
    );

    expect(result.ok).toBe(true);
    expect(db.proposals[0].status).toBe("applied");
  });
});
