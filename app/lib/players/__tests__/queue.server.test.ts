// Consumer-side tests for processOnePlayerImport (TT-204).
//
// Covers terminal-auto-apply, terminal-queued-for-review, ITTF
// transient, photo 404, R2 error, and hard error. Producer is tested
// separately in importer.test.ts. The consumer reads the producer-
// inserted pending_review proposal row by id, appends run_log
// entries, and updates the same row to terminal status — these tests
// drive that contract via a faked SupabaseClient.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  processOnePlayerImport,
  type PlayerImportMessage,
} from "../queue.server";
import { __resetIttfRateLimitForTests } from "../ittf-profile.server";
import type { R2PutBucket } from "../photo.server";

beforeEach(() => {
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
    image_key: string | null;
  }>;
  proposals: Array<{
    id: string;
    ittfid: number;
    status: string;
    merged: Record<string, unknown>;
    candidates: Record<string, unknown>;
    applied_player_id: string | null;
    run_log: unknown[];
  }>;
  playerInsertCollideOnFirst?: boolean;
}

function makeSupabase(db: FakeDb): SupabaseClient {
  let nextPlayerId = 1;
  let collisionBudget = db.playerInsertCollideOnFirst ? 1 : 0;

  return {
    from(table: string): any {
      if (table === "players") {
        return {
          insert(row: {
            name: string;
            slug: string;
            ittfid: number;
            image_key: string;
          }) {
            const tryInsert = () => {
              if (collisionBudget > 0) {
                collisionBudget -= 1;
                return {
                  data: null,
                  error: { code: "23505", message: "slug exists" },
                };
              }
              if (db.players.some(p => p.slug === row.slug)) {
                return {
                  data: null,
                  error: { code: "23505", message: "slug exists" },
                };
              }
              const inserted = {
                id: `player-${nextPlayerId++}`,
                name: row.name,
                slug: row.slug,
                ittfid: row.ittfid,
                image_key: row.image_key,
              };
              db.players.push(inserted);
              return {
                data: { id: inserted.id, slug: inserted.slug },
                error: null,
              };
            };
            return {
              select(_cols: string) {
                return {
                  single() {
                    return Promise.resolve(tryInsert());
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
            return {
              eq(_col: string, value: string) {
                return {
                  maybeSingle() {
                    const row = db.proposals.find(p => p.id === value);
                    // The retry path (TT-208) selects merged +
                    // candidates alongside run_log; the consumer
                    // only reads run_log. Returning both shapes
                    // keeps the fake compatible with both.
                    return Promise.resolve({
                      data: row
                        ? {
                            id: row.id,
                            ittfid: row.ittfid,
                            status: row.status,
                            run_log: row.run_log,
                            merged: row.merged,
                            candidates: row.candidates,
                          }
                        : null,
                      error: null,
                    });
                  },
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(_col: string, value: string) {
                const row = db.proposals.find(p => p.id === value);
                if (row) Object.assign(row, patch);
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

interface CapturedR2 extends R2PutBucket {
  puts: Array<{ key: string; size: number }>;
  shouldThrow?: boolean;
}

function makeBucket(opts: { shouldThrow?: boolean } = {}): CapturedR2 {
  const puts: Array<{ key: string; size: number }> = [];
  return {
    puts,
    shouldThrow: opts.shouldThrow,
    async put(key, body) {
      if (opts.shouldThrow) throw new Error("R2 binding misconfigured");
      const size =
        body instanceof Uint8Array ? body.byteLength : body.byteLength;
      puts.push({ key, size });
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

interface FetchScenario {
  ittf?: Record<number, { html: string; status?: number }>;
  ittfThrowsOn?: number;
  photos?: Record<string, { status: number; bytes?: Uint8Array }>;
}

function makeFetch(scenario: FetchScenario): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.startsWith("https://results.ittf.link/")) {
      const match = url.match(/vw_profiles___player_id_raw=(\d+)/);
      const id = match ? Number(match[1]) : -1;
      if (scenario.ittfThrowsOn === id) {
        throw new TypeError("network gone");
      }
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

function seedProposal(db: FakeDb, ittfid: number, id: string = "proposal-1") {
  db.proposals.push({
    id,
    ittfid,
    status: "pending_review",
    merged: {},
    candidates: {},
    applied_player_id: null,
    run_log: [
      {
        at: "2026-05-13T00:00:00.000Z",
        step: "roster_match",
        outcome: "truly_new",
        ittfid,
      },
    ],
  });
}

function baseMessage(
  ittfid: number,
  proposal_id: string,
  overrides: Partial<PlayerImportMessage> = {}
): PlayerImportMessage {
  return {
    ittfid,
    proposal_id,
    name: "Lin Shidong",
    raw_name: "LIN Shidong",
    represents: "CHN",
    gender: "M",
    ranking: 1,
    headshot_url: "https://wtt.example/lin.jpg",
    wtt_profile_url: "https://wtt.example/profile/lin",
    triggeredBy: "admin",
    attempts: 0,
    ...overrides,
  };
}

describe("processOnePlayerImport", () => {
  it("auto-applies a complete candidate (handedness + grip + birth year + photo)", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    seedProposal(db, 132473);
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const outcome = await processOnePlayerImport(
      supabase,
      bucket,
      baseMessage(132473, "proposal-1"),
      {
        fetchImpl: makeFetch({
          ittf: { 132473: { html: COMPLETE_ITTF_HTML } },
          photos: {
            "https://wtt.example/lin.jpg": {
              status: 200,
              bytes: new Uint8Array([0xff, 0xd8, 0xff]),
            },
          },
        }),
      }
    );

    expect(outcome.status).toBe("auto_applied");
    if (outcome.status !== "auto_applied") return;
    expect(outcome.playerSlug).toBe("lin-shidong");

    expect(db.players).toHaveLength(1);
    expect(db.players[0]).toMatchObject({
      slug: "lin-shidong",
      ittfid: 132473,
      image_key: "player/lin-shidong/headshot.jpg",
    });

    const proposal = db.proposals[0];
    expect(proposal.status).toBe("auto_applied");
    expect(proposal.applied_player_id).toBe(db.players[0].id);

    // Run log appended: roster_match (seed) + ittf_fetch + photo_fetch
    // + r2_upload + merge + terminal.
    const steps = (proposal.run_log as Array<{ step: string }>).map(
      e => e.step
    );
    expect(steps).toEqual([
      "roster_match",
      "ittf_fetch",
      "photo_fetch",
      "r2_upload",
      "merge",
      "terminal",
    ]);
  });

  it("leaves the proposal in pending_review when ITTF returns Unknown handedness/grip", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    seedProposal(db, 100200);
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const outcome = await processOnePlayerImport(
      supabase,
      bucket,
      baseMessage(100200, "proposal-1", {
        name: "Jane Doe",
        raw_name: "JANE Doe",
        represents: "USA",
        gender: "F",
        headshot_url: "https://wtt.example/doe.jpg",
      }),
      {
        fetchImpl: makeFetch({
          ittf: { 100200: { html: UNKNOWN_ITTF_HTML } },
          photos: {
            "https://wtt.example/doe.jpg": {
              status: 200,
              bytes: new Uint8Array([0xff]),
            },
          },
        }),
      }
    );

    expect(outcome.status).toBe("queued_for_review");
    expect(db.players).toHaveLength(0);

    const proposal = db.proposals[0];
    expect(proposal.status).toBe("pending_review");
    const terminal = (
      proposal.run_log as Array<{ step: string; status?: string }>
    ).at(-1);
    expect(terminal?.step).toBe("terminal");
    expect(terminal?.status).toBe("queued_for_review");
  });

  it("leaves the proposal in pending_review when the headshot 404s", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    seedProposal(db, 200300);
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const outcome = await processOnePlayerImport(
      supabase,
      bucket,
      baseMessage(200300, "proposal-1", {
        name: "Sam Smith",
        raw_name: "Sam SMITH",
        headshot_url: "https://wtt.example/smith.jpg",
      }),
      {
        fetchImpl: makeFetch({
          ittf: { 200300: { html: COMPLETE_ITTF_HTML } },
          photos: {
            "https://wtt.example/smith.jpg": { status: 404 },
          },
        }),
      }
    );

    expect(outcome.status).toBe("queued_for_review");
    expect(bucket.puts).toHaveLength(0);

    const proposal = db.proposals[0];
    expect(proposal.status).toBe("pending_review");
    const log = proposal.run_log as Array<{
      step: string;
      status?: string;
      missing_fields?: string[];
    }>;
    const merge = log.find(e => e.step === "merge");
    expect(merge?.missing_fields).toContain("headshot_url");
  });

  it("returns transient on ITTF network throw and persists the partial run log", async () => {
    // Use the network-throw path (`ittfThrowsOn`) rather than a raw
    // 503 response. fetchIttfProfile retries 5xx with real-time
    // setTimeout backoffs (30s+), so a 503-from-mock test stalls;
    // a thrown TypeError bubbles up immediately and the consumer
    // classifies it as transient by error-message pattern.
    const db: FakeDb = { players: [], proposals: [] };
    seedProposal(db, 700);
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const outcome = await processOnePlayerImport(
      supabase,
      bucket,
      baseMessage(700, "proposal-1"),
      {
        fetchImpl: makeFetch({ ittfThrowsOn: 700 }),
      }
    );

    expect(outcome.status).toBe("transient");

    const proposal = db.proposals[0];
    // Status stays pending_review (consumer didn't terminate it).
    expect(proposal.status).toBe("pending_review");
    const log = proposal.run_log as Array<{ step: string; status?: string }>;
    expect(log.at(-2)?.step).toBe("ittf_fetch");
    expect(log.at(-2)?.status).toBe("transient");
    expect(log.at(-1)?.step).toBe("terminal");
    expect(log.at(-1)?.status).toBe("retry");
  });

  it("leaves the proposal queued_for_review when R2 upload throws (binding misconfigured)", async () => {
    // downloadAndStoreHeadshot (photo.server.ts) catches its own
    // fetch + put errors and returns null. The consumer sees "no
    // bytes" and logs photo_fetch=not_found, then the completeness
    // gate falls through to queued_for_review because image_key is
    // null. R2 misconfiguration → admin reviews manually.
    const db: FakeDb = { players: [], proposals: [] };
    seedProposal(db, 132473);
    const supabase = makeSupabase(db);
    const bucket = makeBucket({ shouldThrow: true });

    const outcome = await processOnePlayerImport(
      supabase,
      bucket,
      baseMessage(132473, "proposal-1"),
      {
        fetchImpl: makeFetch({
          ittf: { 132473: { html: COMPLETE_ITTF_HTML } },
          photos: {
            "https://wtt.example/lin.jpg": {
              status: 200,
              bytes: new Uint8Array([0xff, 0xd8]),
            },
          },
        }),
      }
    );

    expect(outcome.status).toBe("queued_for_review");
    const proposal = db.proposals[0];
    const log = proposal.run_log as Array<{
      step: string;
      status?: string;
      missing_fields?: string[];
    }>;
    const merge = log.find(e => e.step === "merge");
    expect(merge?.missing_fields).toContain("headshot_url");
  });

  it("returns error when the proposal row is missing", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    // No proposal seeded — consumer should fail without writes.
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const outcome = await processOnePlayerImport(
      supabase,
      bucket,
      baseMessage(132473, "nonexistent"),
      {
        fetchImpl: makeFetch({}),
      }
    );

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message).toMatch(/not found/);
    }
  });

  it("acks idempotently when the proposal is already terminal (auto_applied / rejected)", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    seedProposal(db, 132473);
    db.proposals[0].status = "auto_applied";
    db.proposals[0].applied_player_id = "player-existing";
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const outcome = await processOnePlayerImport(
      supabase,
      bucket,
      baseMessage(132473, "proposal-1"),
      {
        fetchImpl: makeFetch({}),
      }
    );

    expect(outcome.status).toBe("queued_for_review");
    // No new player inserted; status unchanged.
    expect(db.players).toHaveLength(0);
    expect(db.proposals[0].status).toBe("auto_applied");
  });

  it("retries slug-collision with ittfid-suffix when materialising a player", async () => {
    const db: FakeDb = {
      players: [
        {
          id: "p-old",
          name: "Lin Shidong",
          slug: "lin-shidong",
          ittfid: 99,
          image_key: null,
        },
      ],
      proposals: [],
      playerInsertCollideOnFirst: true,
    };
    seedProposal(db, 132473);
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const outcome = await processOnePlayerImport(
      supabase,
      bucket,
      baseMessage(132473, "proposal-1"),
      {
        fetchImpl: makeFetch({
          ittf: { 132473: { html: COMPLETE_ITTF_HTML } },
          photos: {
            "https://wtt.example/lin.jpg": {
              status: 200,
              bytes: new Uint8Array([0xff]),
            },
          },
        }),
      }
    );

    expect(outcome.status).toBe("auto_applied");
    if (outcome.status !== "auto_applied") return;
    expect(outcome.playerSlug).toBe("lin-shidong-132473");
  });
});

describe("retryPlayerImportPhoto (TT-208)", () => {
  // Seed a proposal as if the consumer had already run and landed
  // in needs_review with only the photo missing. The retry helper
  // pulls WTT/ITTF candidates from proposal.candidates so this seed
  // populates them.
  function seedNeedsReviewProposal(
    db: FakeDb,
    ittfid: number,
    opts: { wttHeadshot?: string } = {}
  ): string {
    const id = `proposal-retry-${ittfid}`;
    db.proposals.push({
      id,
      ittfid,
      status: "pending_review",
      merged: {
        ittfid,
        name: "Lin Shidong",
        wtt_profile_url: "https://wtt.example/profile/lin",
        headshot_url: opts.wttHeadshot ?? "https://wtt.example/lin.jpg",
      },
      candidates: {
        wtt: {
          source: "wtt",
          ittfid,
          name: "Lin Shidong",
          raw_name: "LIN Shidong",
          represents: "CHN",
          gender: "M",
          ranking: 1,
          headshot_url: opts.wttHeadshot ?? "https://wtt.example/lin.jpg",
          wtt_profile_url: "https://wtt.example/profile/lin",
          fetched_at: "2026-05-13T00:00:00.000Z",
        },
        ittf: {
          source: "ittf",
          ittfid,
          handedness: "right",
          grip: "shakehand",
          style: "attack",
          birth_year: 1995,
          ittf_profile_url: `https://results.ittf.link/profile/${ittfid}`,
          fetched_at: "2026-05-13T00:00:00.000Z",
        },
      },
      applied_player_id: null,
      run_log: [
        {
          at: "2026-05-13T00:00:00.000Z",
          step: "roster_match",
          outcome: "truly_new",
          ittfid,
        },
        {
          at: "2026-05-13T00:00:01.000Z",
          step: "ittf_fetch",
          ittfid,
          url: `https://results.ittf.link/profile/${ittfid}`,
          status: "ok",
          handedness: "right",
          grip: "shakehand",
          style: "attack",
          birth_year: 1995,
        },
        {
          at: "2026-05-13T00:00:02.000Z",
          step: "photo_fetch",
          ittfid,
          url: opts.wttHeadshot ?? "https://wtt.example/lin.jpg",
          status: "not_found",
          reason: "HTTP 403 Forbidden",
          http_status: 403,
        },
        {
          at: "2026-05-13T00:00:02.000Z",
          step: "r2_upload",
          ittfid,
          image_key: null,
          status: "skipped",
          reason: "no source bytes",
        },
        {
          at: "2026-05-13T00:00:02.000Z",
          step: "merge",
          ittfid,
          field_count: 11,
          complete: false,
          missing_fields: ["headshot_url"],
        },
        {
          at: "2026-05-13T00:00:02.000Z",
          step: "terminal",
          ittfid,
          status: "queued_for_review",
          reason: "missing: headshot_url",
        },
      ],
    });
    return id;
  }

  it("recovers a needs_review proposal when the photo refetch succeeds", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    const proposalId = seedNeedsReviewProposal(db, 132473);
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const { retryPlayerImportPhoto } = await import("../queue.server");
    const outcome = await retryPlayerImportPhoto(supabase, bucket, proposalId, {
      fetchImpl: makeFetch({
        photos: {
          "https://wtt.example/lin.jpg": {
            status: 200,
            bytes: new Uint8Array([0xff, 0xd8, 0xff]),
          },
        },
      }),
    });

    expect(outcome.status).toBe("auto_applied");
    if (outcome.status !== "auto_applied") return;
    expect(outcome.playerSlug).toBe("lin-shidong");

    expect(db.players).toHaveLength(1);
    expect(db.players[0]).toMatchObject({
      slug: "lin-shidong",
      ittfid: 132473,
      image_key: "player/lin-shidong/headshot.jpg",
    });

    const proposal = db.proposals[0];
    expect(proposal.status).toBe("auto_applied");
    expect(proposal.applied_player_id).toBe(db.players[0].id);
    const steps = (proposal.run_log as Array<{ step: string }>).map(
      e => e.step
    );
    // Original 6 entries (roster_match → terminal) + 4 new appended
    // entries from the retry (photo_fetch ok, r2_upload ok, merge,
    // terminal auto_applied).
    expect(steps.slice(-4)).toEqual([
      "photo_fetch",
      "r2_upload",
      "merge",
      "terminal",
    ]);
  });

  it("stays pending_review and appends a failure entry when the photo still 403s", async () => {
    const db: FakeDb = { players: [], proposals: [] };
    const proposalId = seedNeedsReviewProposal(db, 132474);
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const { retryPlayerImportPhoto } = await import("../queue.server");
    const outcome = await retryPlayerImportPhoto(supabase, bucket, proposalId, {
      fetchImpl: makeFetch({
        photos: {
          "https://wtt.example/lin.jpg": { status: 403 },
        },
      }),
    });

    expect(outcome.status).toBe("still_failing");
    if (outcome.status !== "still_failing") return;
    expect(outcome.reason).toMatch(/HTTP 403/);

    expect(db.players).toHaveLength(0);
    const proposal = db.proposals[0];
    expect(proposal.status).toBe("pending_review");
    const log = proposal.run_log as Array<{
      step: string;
      status?: string;
      http_status?: number;
    }>;
    // The newly-appended photo_fetch entry carries http_status=403 +
    // status='not_found'. (The original photo_fetch entry from the
    // seed also carries 403; the new one is at the end.)
    const last = log[log.length - 2];
    expect(last.step).toBe("photo_fetch");
    expect(last.status).toBe("not_found");
    expect(last.http_status).toBe(403);
  });

  it("returns error when the proposal has no ITTF candidate", async () => {
    const db: FakeDb = {
      players: [],
      proposals: [
        {
          id: "proposal-no-ittf",
          ittfid: 132475,
          status: "pending_review",
          merged: {},
          candidates: { wtt: { ittfid: 132475, name: "X" } },
          applied_player_id: null,
          run_log: [],
        },
      ],
    };
    const supabase = makeSupabase(db);
    const bucket = makeBucket();

    const { retryPlayerImportPhoto } = await import("../queue.server");
    const outcome = await retryPlayerImportPhoto(
      supabase,
      bucket,
      "proposal-no-ittf",
      { fetchImpl: makeFetch({}) }
    );

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message).toMatch(/ITTF/);
    }
  });
});
