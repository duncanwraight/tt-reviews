import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { runImport } from "../importer.server";
import {
  __resetIttfRateLimitForTests,
  ittfProfileUrl,
} from "../ittf-profile.server";
import { __resetRosterCacheForTests } from "../roster.server";
import type { R2PutBucket } from "../photo.server";

beforeEach(() => {
  __resetRosterCacheForTests();
  __resetIttfRateLimitForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

interface FakeDb {
  players: Array<{
    id: string;
    name: string;
    slug: string;
    ittfid: number | null;
    playing_style?: string | null;
    birth_year?: number | null;
    highest_rating?: string | null;
  }>;
  proposals: Array<{
    id: string;
    ittfid: number;
    status: string;
    merged: Record<string, unknown>;
    candidates: Record<string, unknown>;
    applied_player_id: string | null;
  }>;
  playerInsertFail?: { times: number; code?: string; message?: string };
}

function makeSupabase(db: FakeDb): SupabaseClient {
  let nextPlayerId = 1;
  let nextProposalId = 1;
  let failureBudget = db.playerInsertFail?.times ?? 0;
  const failureCode = db.playerInsertFail?.code ?? "23505";
  const failureMessage = db.playerInsertFail?.message ?? "duplicate slug";

  return {
    from(table: string): any {
      if (table === "players") {
        return {
          // TT-202: importer reads all players (including null ittfid)
          // so the name-fallback dedupe can match seed rows that pre-
          // date the ittfid column.
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
          insert(row: {
            name: string;
            slug: string;
            ittfid: number;
            represents: string | null;
            gender: string | null;
            handedness: string | null;
            grip: string | null;
            playing_style?: string | null;
            birth_year?: number | null;
            highest_rating?: string | null;
            image_key: string;
          }) {
            const failNow = failureBudget > 0;
            return {
              select(_cols: string) {
                return {
                  single() {
                    if (failNow) {
                      failureBudget -= 1;
                      return Promise.resolve({
                        data: null,
                        error: { code: failureCode, message: failureMessage },
                      });
                    }
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
                      playing_style: row.playing_style ?? null,
                      birth_year: row.birth_year ?? null,
                      highest_rating: row.highest_rating ?? null,
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
          update(patch: { ittfid?: number }) {
            return {
              eq(_col1: string, val1: string) {
                return {
                  is(_col2: string, _val2: null) {
                    const row = db.players.find(p => p.id === val1);
                    if (row && row.ittfid === null && patch.ittfid != null) {
                      row.ittfid = patch.ittfid;
                    }
                    return Promise.resolve({ data: null, error: null });
                  },
                };
              },
            };
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
            applied_player_id?: string | null;
          }) {
            db.proposals.push({
              id: `proposal-${nextProposalId++}`,
              ittfid: row.ittfid,
              status: row.status,
              merged: row.merged,
              candidates: row.candidates,
              applied_player_id: row.applied_player_id ?? null,
            });
            return Promise.resolve({ data: null, error: null });
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

function makeBucket(): R2PutBucket & { puts: Array<{ key: string }> } {
  const puts: Array<{ key: string }> = [];
  return {
    puts,
    async put(key) {
      puts.push({ key });
    },
  };
}

const COMPLETE_ITTF_HTML = `
<td>
  Birth Year: <span class='notranslate'>1995</span><br/>
  Style: <span class='notranslate'>Right-Hand</span> <span class='notranslate'>Attack</span> (<span class='notranslate'>ShakeHand</span>)<br/>
</td>
`;

const UNKNOWN_ITTF_HTML = `
<td>
  Style: <span class='notranslate'>Unknown Handness</span> <span class='notranslate'>Unknown Style</span> (<span class='notranslate'>Unknown Grip</span>)<br/>
</td>
`;

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

interface FetchScenario {
  roster: RosterEntry[];
  ittf?: Record<number, { html: string; status?: number }>;
  photos?: Record<string, { status: number; bytes?: Uint8Array }>;
}

function makeFetch(scenario: FetchScenario): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("GetPlayersListByFilters")) {
      return new Response(JSON.stringify(scenario.roster), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.startsWith("https://results.ittf.link/")) {
      const match = url.match(/vw_profiles___player_id_raw=(\d+)/);
      const id = match ? Number(match[1]) : -1;
      const profile = scenario.ittf?.[id];
      if (!profile) {
        return new Response("not found", { status: 404 });
      }
      return new Response(profile.html, { status: profile.status ?? 200 });
    }

    const photo = scenario.photos?.[url];
    if (photo) {
      return new Response(photo.bytes ?? null, {
        status: photo.status,
        headers: { "content-type": "image/jpeg" },
      });
    }

    return new Response("unmatched fetch", { status: 500 });
  }) as unknown as typeof fetch;
}

describe("runImport", () => {
  it("auto-applies a complete candidate (handedness + grip + birth year + photo)", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

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
    ];

    const summary = await runImport(supabase, bucket, {
      deps: {
        fetchImpl: makeFetch({
          roster,
          ittf: { 132473: { html: COMPLETE_ITTF_HTML } },
          photos: {
            "https://wtt.example/lin.jpg": {
              status: 200,
              bytes: new Uint8Array([0xff, 0xd8, 0xff]),
            },
          },
        }),
      },
    });

    expect(summary.auto_applied).toBe(1);
    expect(summary.queued).toBe(0);
    expect(db.players).toHaveLength(1);
    expect(db.players[0]).toMatchObject({
      name: "Lin Shidong",
      slug: "lin-shidong",
      ittfid: 132473,
    });
    expect(db.proposals).toHaveLength(1);
    expect(db.proposals[0].status).toBe("auto_applied");
    expect(db.proposals[0].applied_player_id).toBe(db.players[0].id);
    expect(bucket.puts).toHaveLength(1);
    expect(bucket.puts[0].key).toBe("player/lin-shidong/headshot.jpg");
  });

  it("queues a candidate when ITTF returns Unknown handedness/grip", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const roster: RosterEntry[] = [
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

    const summary = await runImport(supabase, bucket, {
      deps: {
        fetchImpl: makeFetch({
          roster,
          ittf: { 100200: { html: UNKNOWN_ITTF_HTML } },
          photos: {
            "https://wtt.example/doe.jpg": {
              status: 200,
              bytes: new Uint8Array([0xff, 0xd8]),
            },
          },
        }),
      },
    });

    expect(summary.auto_applied).toBe(0);
    expect(summary.queued).toBe(1);
    expect(db.players).toHaveLength(0);
    expect(db.proposals).toHaveLength(1);
    expect(db.proposals[0].status).toBe("pending_review");
  });

  it("queues a candidate when the headshot URL 404s", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const roster: RosterEntry[] = [
      {
        ittfid: 200300,
        fullName: "Sam SMITH",
        nationality: "GBR",
        countryName: "Great Britain",
        gender: "M",
        age: 25,
        ranking: "100",
        headShot: "https://wtt.example/smith.jpg",
      },
    ];

    const summary = await runImport(supabase, bucket, {
      deps: {
        fetchImpl: makeFetch({
          roster,
          ittf: { 200300: { html: COMPLETE_ITTF_HTML } },
          photos: {
            "https://wtt.example/smith.jpg": { status: 404 },
          },
        }),
      },
    });

    expect(summary.auto_applied).toBe(0);
    expect(summary.queued).toBe(1);
    expect(bucket.puts).toHaveLength(0);
  });

  it("skips candidates already in players (matched by ittfid)", async () => {
    const db: FakeDb = {
      players: [
        { id: "p-1", name: "Lin Shidong", slug: "lin-shidong", ittfid: 132473 },
      ],
      proposals: [],
    };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

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
    ];

    const summary = await runImport(supabase, bucket, {
      deps: { fetchImpl: makeFetch({ roster }) },
    });

    expect(summary.auto_applied).toBe(0);
    expect(summary.queued).toBe(0);
    expect(summary.skipped_existing).toBe(1);
    expect(db.players).toHaveLength(1);
    expect(bucket.puts).toHaveLength(0);
  });

  it("skips candidates that already have a proposal in any status", async () => {
    const db: FakeDb = {
      players: [],
      proposals: [
        {
          id: "prop-1",
          ittfid: 500600,
          status: "rejected",
          merged: {},
          candidates: {},
          applied_player_id: null,
        },
      ],
    };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

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

    const summary = await runImport(supabase, bucket, {
      deps: { fetchImpl: makeFetch({ roster }) },
    });

    expect(summary.auto_applied).toBe(0);
    expect(summary.queued).toBe(0);
    expect(summary.skipped_existing).toBe(1);
  });

  it("respects maxPerRun and surfaces remaining count", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const roster: RosterEntry[] = Array.from({ length: 5 }, (_, i) => ({
      ittfid: 1000 + i,
      fullName: `Player ${i}`,
      nationality: "FRA",
      countryName: "France",
      gender: "M",
      age: 25,
      ranking: String(i + 1),
      headShot: "",
    }));

    const summary = await runImport(supabase, bucket, {
      maxPerRun: 2,
      deps: {
        fetchImpl: makeFetch({
          roster,
          ittf: Object.fromEntries(
            roster.map(r => [r.ittfid, { html: UNKNOWN_ITTF_HTML }])
          ),
        }),
      },
    });

    expect(summary.queued).toBe(2);
    expect(summary.remaining).toBe(3);
  });

  it("retries with ittfid-suffixed slug on slug collision", async () => {
    const db: FakeDb = {
      players: [
        { id: "p-old", name: "Wang Hao", slug: "wang-hao", ittfid: 99 },
      ],
      proposals: [],
    };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const roster: RosterEntry[] = [
      {
        ittfid: 132473,
        fullName: "WANG Hao",
        nationality: "CHN",
        countryName: "China",
        gender: "M",
        age: 30,
        ranking: "10",
        headShot: "https://wtt.example/wang.jpg",
      },
    ];

    const summary = await runImport(supabase, bucket, {
      deps: {
        fetchImpl: makeFetch({
          roster,
          ittf: { 132473: { html: COMPLETE_ITTF_HTML } },
          photos: {
            "https://wtt.example/wang.jpg": {
              status: 200,
              bytes: new Uint8Array([0xff]),
            },
          },
        }),
      },
    });

    expect(summary.auto_applied).toBe(1);
    expect(summary.errors).toHaveLength(0);
    const inserted = db.players.find(p => p.ittfid === 132473);
    expect(inserted?.slug).toBe("wang-hao-132473");
  });

  it("captures per-candidate errors without aborting the run", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const roster: RosterEntry[] = [
      {
        ittfid: 1,
        fullName: "OK Player",
        nationality: "FRA",
        countryName: "France",
        gender: "M",
        age: 25,
        ranking: "1",
        headShot: "https://wtt.example/ok.jpg",
      },
      {
        ittfid: 2,
        fullName: "BROKEN Player",
        nationality: "FRA",
        countryName: "France",
        gender: "M",
        age: 25,
        ranking: "2",
        headShot: "https://wtt.example/broken.jpg",
      },
    ];

    const summary = await runImport(supabase, bucket, {
      deps: {
        fetchImpl: makeFetch({
          roster,
          ittf: {
            1: { html: COMPLETE_ITTF_HTML },
            // 2 is missing → 404 → throws
          },
          photos: {
            "https://wtt.example/ok.jpg": {
              status: 200,
              bytes: new Uint8Array([0xff]),
            },
          },
        }),
      },
    });

    expect(summary.auto_applied).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].ittfid).toBe(2);
  });

  it("backfills ittfid on a legacy seed row when names match (TT-202)", async () => {
    // Mirrors the prod regression: seed row "Alexis LEBRUN" with NULL
    // ittfid + WTT roster entry "LEBRUN Alexis" (surname-flipped, ALL-
    // CAPS). The old importer treated this as a new player; the fixed
    // version backfills ittfid on the seed row instead.
    const db: FakeDb = {
      players: [
        {
          id: "p-seed",
          name: "Alexis LEBRUN",
          slug: "alexis-lebrun",
          ittfid: null,
        },
      ],
      proposals: [],
    };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const roster: RosterEntry[] = [
      {
        ittfid: 132992,
        fullName: "LEBRUN Alexis",
        nationality: "FRA",
        countryName: "France",
        gender: "M",
        age: 22,
        ranking: "11",
        headShot: "https://wtt.example/lebrun.jpg",
      },
    ];

    const summary = await runImport(supabase, bucket, {
      deps: { fetchImpl: makeFetch({ roster }) },
    });

    expect(summary.auto_applied).toBe(0);
    expect(summary.queued).toBe(0);
    expect(summary.skipped_existing).toBe(1);
    expect(summary.errors).toHaveLength(0);
    // Only the seed row remains, now linked.
    expect(db.players).toHaveLength(1);
    expect(db.players[0]).toMatchObject({
      id: "p-seed",
      slug: "alexis-lebrun",
      ittfid: 132992,
    });
    // No upstream fetches for ITTF or the photo — name-match short-
    // circuits before the per-candidate enrichment pass.
    expect(bucket.puts).toHaveLength(0);
  });

  it("re-running after a name backfill is a no-op (ittfid match short-circuits)", async () => {
    const db: FakeDb = {
      players: [
        {
          id: "p-seed",
          name: "Alexis LEBRUN",
          slug: "alexis-lebrun",
          ittfid: null,
        },
      ],
      proposals: [],
    };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();
    const roster: RosterEntry[] = [
      {
        ittfid: 132992,
        fullName: "LEBRUN Alexis",
        nationality: "FRA",
        countryName: "France",
        gender: "M",
        age: 22,
        ranking: "11",
        headShot: "",
      },
    ];

    await runImport(supabase, bucket, {
      deps: { fetchImpl: makeFetch({ roster }) },
    });
    // Reset the roster cache so the second run re-fetches the roster
    // (mimics a fresh Worker isolate).
    __resetRosterCacheForTests();

    const second = await runImport(supabase, bucket, {
      deps: { fetchImpl: makeFetch({ roster }) },
    });
    expect(second.skipped_existing).toBe(1);
    expect(second.auto_applied).toBe(0);
    expect(second.queued).toBe(0);
    expect(db.players).toHaveLength(1);
  });

  it("flags ambiguity when two unlinked seed rows share the normalised name", async () => {
    const db: FakeDb = {
      players: [
        {
          id: "p-1",
          name: "Wang Hao",
          slug: "wang-hao",
          ittfid: null,
        },
        {
          id: "p-2",
          name: "WANG Hao",
          slug: "wang-hao-second",
          ittfid: null,
        },
      ],
      proposals: [],
    };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();
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

    const summary = await runImport(supabase, bucket, {
      deps: { fetchImpl: makeFetch({ roster }) },
    });

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].ittfid).toBe(999);
    expect(summary.errors[0].message).toMatch(/ambiguous/i);
    expect(summary.auto_applied).toBe(0);
    expect(summary.queued).toBe(0);
    // Neither seed row was modified.
    expect(db.players.every(p => p.ittfid === null)).toBe(true);
  });

  it("captures WTT ranking → highest_rating and ITTF style+grip → playing_style", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();
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
    ];

    await runImport(supabase, bucket, {
      deps: {
        fetchImpl: makeFetch({
          roster,
          ittf: { 132473: { html: COMPLETE_ITTF_HTML } },
          photos: {
            "https://wtt.example/lin.jpg": {
              status: 200,
              bytes: new Uint8Array([0xff, 0xd8, 0xff]),
            },
          },
        }),
      },
    });

    expect(db.players).toHaveLength(1);
    expect(db.players[0]).toMatchObject({
      slug: "lin-shidong",
      highest_rating: "WR1",
      playing_style: "shakehand_attacker",
      birth_year: 1995,
    });
  });

  it("encodes ITTF profile URL in the merged.ittf_profile_url field", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

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

    await runImport(supabase, bucket, {
      deps: {
        fetchImpl: makeFetch({
          roster,
          ittf: { 132473: { html: UNKNOWN_ITTF_HTML } },
        }),
      },
    });

    expect(db.proposals[0].merged.ittf_profile_url).toBe(
      ittfProfileUrl(132473)
    );
  });
});
