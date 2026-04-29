import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyVideoSubmission } from "../video-submission-applier.server";

/**
 * Hand-rolled Supabase stub mirroring the sibling appliers' test
 * shapes. Read/insert patterns:
 *   - from("video_submissions").select("*").eq("id", X).single() → submission
 *   - from("player_footage").insert([...])                       → captured
 */
interface StubState {
  submission: Record<string, unknown> & { id: string };
  readError?: { message: string };
  insertError?: { message: string };
}

interface CapturedInsert {
  table: string;
  payload: unknown;
}

function makeStub(state: StubState) {
  const inserts: CapturedInsert[] = [];

  function from(table: string) {
    if (table === "video_submissions") {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _value: string) {
              return {
                single: async () =>
                  state.readError
                    ? { data: null, error: state.readError }
                    : { data: state.submission, error: null },
              };
            },
          };
        },
      };
    }
    if (table === "player_footage") {
      return {
        insert(payload: unknown) {
          inserts.push({ table, payload });
          return Promise.resolve(
            state.insertError ? { error: state.insertError } : { error: null }
          );
        },
      };
    }
    throw new Error(`unexpected from(${table})`);
  }

  return {
    client: { from } as unknown as SupabaseClient,
    captured: inserts,
  };
}

describe("applyVideoSubmission", () => {
  it("inserts one player_footage row per video, with active=true", async () => {
    const stub = makeStub({
      submission: {
        id: "vs1",
        player_id: "p1",
        videos: [
          {
            url: "https://www.youtube.com/watch?v=A",
            title: "Match A",
            platform: "youtube",
          },
          {
            url: "https://example.com/B.mp4",
            title: "Match B",
            platform: "other",
          },
        ],
      },
    });

    const res = await applyVideoSubmission(stub.client, "vs1");

    expect(res).toEqual({ success: true });
    expect(stub.captured).toHaveLength(1);
    expect(stub.captured[0].table).toBe("player_footage");
    expect(stub.captured[0].payload).toEqual([
      {
        player_id: "p1",
        url: "https://www.youtube.com/watch?v=A",
        title: "Match A",
        platform: "youtube",
        active: true,
      },
      {
        player_id: "p1",
        url: "https://example.com/B.mp4",
        title: "Match B",
        platform: "other",
        active: true,
      },
    ]);
  });

  it("falls back to platform='other' for unknown / missing platform", async () => {
    const stub = makeStub({
      submission: {
        id: "vs1",
        player_id: "p1",
        videos: [
          {
            url: "https://www.youtube.com/watch?v=A",
            title: "Match A",
            platform: "tiktok",
          },
          { url: "https://www.youtube.com/watch?v=B", title: "Match B" },
        ],
      },
    });

    const res = await applyVideoSubmission(stub.client, "vs1");

    expect(res.success).toBe(true);
    const rows = stub.captured[0].payload as Array<{ platform: string }>;
    expect(rows[0].platform).toBe("other");
    expect(rows[1].platform).toBe("other");
  });

  it("drops entries missing url or title (defense in depth)", async () => {
    const stub = makeStub({
      submission: {
        id: "vs1",
        player_id: "p1",
        videos: [
          {
            url: "https://www.youtube.com/watch?v=A",
            title: "Match A",
            platform: "youtube",
          },
          { title: "No URL", platform: "youtube" },
          { url: "https://example.com/no-title.mp4", platform: "youtube" },
        ],
      },
    });

    const res = await applyVideoSubmission(stub.client, "vs1");

    expect(res.success).toBe(true);
    const rows = stub.captured[0].payload as Array<{ url: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe("https://www.youtube.com/watch?v=A");
  });

  it("returns success with no INSERT when videos array is empty", async () => {
    const stub = makeStub({
      submission: { id: "vs1", player_id: "p1", videos: [] },
    });

    const res = await applyVideoSubmission(stub.client, "vs1");

    expect(res.success).toBe(true);
    expect(stub.captured).toHaveLength(0);
  });

  it("returns success with no INSERT when videos field is missing or non-array", async () => {
    const stub = makeStub({
      submission: { id: "vs1", player_id: "p1", videos: null },
    });

    const res = await applyVideoSubmission(stub.client, "vs1");

    expect(res.success).toBe(true);
    expect(stub.captured).toHaveLength(0);
  });

  it("returns success with no INSERT when every entry is malformed", async () => {
    // Edge case: applier filters out all entries → empty array →
    // skip INSERT entirely rather than 4xx the moderation flow on
    // a row-less batch.
    const stub = makeStub({
      submission: {
        id: "vs1",
        player_id: "p1",
        videos: [{ noUrl: true }, { alsoBad: 1 }],
      },
    });

    const res = await applyVideoSubmission(stub.client, "vs1");

    expect(res.success).toBe(true);
    expect(stub.captured).toHaveLength(0);
  });

  it("returns failure when the submission row is not found", async () => {
    const stub = makeStub({
      submission: { id: "vs1" },
      readError: { message: "no rows returned" },
    });

    const res = await applyVideoSubmission(stub.client, "vs1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no rows returned/);
    expect(stub.captured).toHaveLength(0);
  });

  it("surfaces the player_footage INSERT error (e.g. FK violation, partial batch failure)", async () => {
    const stub = makeStub({
      submission: {
        id: "vs1",
        player_id: "p1",
        videos: [
          {
            url: "https://www.youtube.com/watch?v=A",
            title: "Match A",
            platform: "youtube",
          },
        ],
      },
      insertError: { message: "FK violation on player_id" },
    });

    const res = await applyVideoSubmission(stub.client, "vs1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/FK violation/);
    expect(stub.captured).toHaveLength(1);
  });
});
