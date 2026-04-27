import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRecentAdminActivity } from "../activity.server";

interface ApprovalRow {
  id: string;
  action: string;
  submission_type: string;
  submission_id: string;
  moderator_id: string | null;
  discord_moderator_id: string | null;
  source: string;
  created_at: string;
}

function makeStub({
  approvals,
  profiles = [],
  discordMods = [],
}: {
  approvals: ApprovalRow[];
  profiles?: { id: string; email: string | null }[];
  discordMods?: { id: string; discord_username: string | null }[];
}) {
  let limitCapture = 0;
  let orderCapture: { col: string; ascending: boolean } | null = null;

  function from(table: string) {
    if (table === "moderator_approvals") {
      return {
        select() {
          return {
            order(col: string, opts: { ascending: boolean }) {
              orderCapture = { col, ascending: opts.ascending };
              return {
                limit(n: number) {
                  limitCapture = n;
                  return Promise.resolve({
                    data: approvals.slice(0, n),
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    }
    if (table === "profiles") {
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              return Promise.resolve({
                data: profiles.filter(p => ids.includes(p.id)),
                error: null,
              });
            },
          };
        },
      };
    }
    if (table === "discord_moderators") {
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              return Promise.resolve({
                data: discordMods.filter(d => ids.includes(d.id)),
                error: null,
              });
            },
          };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  }

  return {
    client: { from } as unknown as SupabaseClient,
    inspect: () => ({ limitCapture, orderCapture }),
  };
}

describe("getRecentAdminActivity", () => {
  it("returns the last N approvals newest-first with default limit 10", async () => {
    const stub = makeStub({ approvals: [] });
    const entries = await getRecentAdminActivity(stub.client);

    expect(entries).toEqual([]);
    expect(stub.inspect()).toEqual({
      limitCapture: 10,
      orderCapture: { col: "created_at", ascending: false },
    });
  });

  it("respects a caller-provided limit", async () => {
    const stub = makeStub({ approvals: [] });
    await getRecentAdminActivity(stub.client, 5);
    expect(stub.inspect().limitCapture).toBe(5);
  });

  it("resolves admin-UI moderator email from profiles", async () => {
    const stub = makeStub({
      approvals: [
        {
          id: "a1",
          action: "approved",
          submission_type: "equipment",
          submission_id: "s1",
          moderator_id: "u1",
          discord_moderator_id: null,
          source: "admin_ui",
          created_at: "2026-04-26T12:00:00Z",
        },
      ],
      profiles: [{ id: "u1", email: "alice@example.com" }],
    });

    const entries = await getRecentAdminActivity(stub.client);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "approved",
      submissionType: "equipment",
      actor: "alice@example.com",
      source: "admin_ui",
    });
  });

  it("resolves Discord moderator name and tags it as Discord", async () => {
    const stub = makeStub({
      approvals: [
        {
          id: "a2",
          action: "rejected",
          submission_type: "video",
          submission_id: "s2",
          moderator_id: null,
          discord_moderator_id: "d1",
          source: "discord",
          created_at: "2026-04-26T12:00:00Z",
        },
      ],
      discordMods: [{ id: "d1", discord_username: "bob" }],
    });

    const entries = await getRecentAdminActivity(stub.client);
    expect(entries[0]).toMatchObject({
      action: "rejected",
      actor: "bob (Discord)",
      source: "discord",
    });
  });

  it("falls back gracefully when actor row can't be resolved", async () => {
    const stub = makeStub({
      approvals: [
        {
          id: "a3",
          action: "approved",
          submission_type: "review",
          submission_id: "s3",
          moderator_id: "u-missing",
          discord_moderator_id: null,
          source: "admin_ui",
          created_at: "2026-04-26T12:00:00Z",
        },
      ],
    });

    const entries = await getRecentAdminActivity(stub.client);
    expect(entries[0].actor).toBe("Admin");
  });

  it("returns an empty array when the approvals query errors", async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({
                data: null,
                error: new Error("boom"),
              }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const entries = await getRecentAdminActivity(client);
    expect(entries).toEqual([]);
  });
});
