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

interface SlugRow {
  id: string;
  // Either an embedded entity (FK -> equipment / players) or a `name`
  // column. Per-type stubs map by table name.
  equipment?: { slug: string | null } | null;
  players?: { slug: string | null } | null;
  name?: string | null;
}

function makeStub({
  approvals,
  users = [],
  discordMods = [],
  slugTables = {},
}: {
  approvals: ApprovalRow[];
  users?: { id: string; email: string | null }[];
  discordMods?: { id: string; discord_username: string | null }[];
  slugTables?: Record<string, SlugRow[]>;
}) {
  let limitCapture = 0;
  let orderCapture: { col: string; ascending: boolean } | null = null;
  let rpcCapture: { fn: string; args: unknown } | null = null;

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
    // Per-type slug tables — equipment_edits, equipment_reviews,
    // player_edits, video_submissions, player_equipment_setup_submissions,
    // equipment_submissions, player_submissions. The widget queries each
    // type that's present in the approval batch.
    if (table in slugTables) {
      const rows = slugTables[table];
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              return Promise.resolve({
                data: rows.filter(r => ids.includes(r.id)),
                error: null,
              });
            },
          };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  }

  function rpc(fn: string, args: { p_ids: string[] }) {
    rpcCapture = { fn, args };
    if (fn === "get_user_emails_by_ids") {
      return Promise.resolve({
        data: users.filter(u => args.p_ids.includes(u.id)),
        error: null,
      });
    }
    throw new Error(`unexpected rpc ${fn}`);
  }

  return {
    client: { from, rpc } as unknown as SupabaseClient,
    inspect: () => ({ limitCapture, orderCapture, rpcCapture }),
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
      rpcCapture: null,
    });
  });

  it("respects a caller-provided limit", async () => {
    const stub = makeStub({ approvals: [] });
    await getRecentAdminActivity(stub.client, 5);
    expect(stub.inspect().limitCapture).toBe(5);
  });

  it("resolves admin-UI moderator email and the equipment view URL via FK embed", async () => {
    const stub = makeStub({
      approvals: [
        {
          id: "a1",
          action: "approved",
          submission_type: "equipment_edit",
          submission_id: "s1",
          moderator_id: "u1",
          discord_moderator_id: null,
          source: "admin_ui",
          created_at: "2026-04-26T12:00:00Z",
        },
      ],
      users: [{ id: "u1", email: "alice@example.com" }],
      slugTables: {
        equipment_edits: [{ id: "s1", equipment: { slug: "hurricane-3" } }],
      },
    });

    const entries = await getRecentAdminActivity(stub.client);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "approved",
      submissionType: "equipment_edit",
      actor: "alice@example.com",
      source: "admin_ui",
      viewUrl: "/equipment/hurricane-3",
    });
    expect(stub.inspect().rpcCapture).toEqual({
      fn: "get_user_emails_by_ids",
      args: { p_ids: ["u1"] },
    });
  });

  it("resolves Discord moderator name and the player view URL for a video submission", async () => {
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
      slugTables: {
        video_submissions: [{ id: "s2", players: { slug: "ma-long" } }],
      },
    });

    const entries = await getRecentAdminActivity(stub.client);
    expect(entries[0]).toMatchObject({
      action: "rejected",
      // actor is the raw username; the widget pairs this with `source` for
      // the source-icon switch so the tag isn't duplicated as text.
      actor: "bob",
      source: "discord",
      viewUrl: "/players/ma-long",
    });
  });

  it("derives a slug from the submitted name for an approved new-equipment submission", async () => {
    const stub = makeStub({
      approvals: [
        {
          id: "a3",
          action: "approved",
          submission_type: "equipment",
          submission_id: "s3",
          moderator_id: "u1",
          discord_moderator_id: null,
          source: "admin_ui",
          created_at: "2026-04-26T12:00:00Z",
        },
      ],
      users: [{ id: "u1", email: "alice@example.com" }],
      slugTables: {
        equipment_submissions: [{ id: "s3", name: "Hurricane 3" }],
      },
    });

    const entries = await getRecentAdminActivity(stub.client);
    expect(entries[0].viewUrl).toBe("/equipment/hurricane-3");
  });

  it("returns viewUrl=null for a rejected new-equipment submission (no entity to link to)", async () => {
    const stub = makeStub({
      approvals: [
        {
          id: "a4",
          action: "rejected",
          submission_type: "equipment",
          submission_id: "s4",
          moderator_id: "u1",
          discord_moderator_id: null,
          source: "admin_ui",
          created_at: "2026-04-26T12:00:00Z",
        },
      ],
      users: [{ id: "u1", email: "alice@example.com" }],
      slugTables: {
        equipment_submissions: [{ id: "s4", name: "Hurricane 3" }],
      },
    });

    const entries = await getRecentAdminActivity(stub.client);
    expect(entries[0].viewUrl).toBeNull();
  });

  it("falls back to viewUrl=null when the slug can't be resolved", async () => {
    const stub = makeStub({
      approvals: [
        {
          id: "a5",
          action: "approved",
          submission_type: "review",
          submission_id: "s5",
          moderator_id: "u-missing",
          discord_moderator_id: null,
          source: "admin_ui",
          created_at: "2026-04-26T12:00:00Z",
        },
      ],
      slugTables: {
        // Embed returns null for the FK target — no slug -> no link.
        equipment_reviews: [{ id: "s5", equipment: null }],
      },
    });

    const entries = await getRecentAdminActivity(stub.client);
    expect(entries[0].actor).toBe("Admin");
    expect(entries[0].viewUrl).toBeNull();
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
