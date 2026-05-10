import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as dispatch from "../dispatch";
import * as moderation from "../moderation";
import * as search from "../search";
import type { DiscordContext } from "../types";

/**
 * TT-159 unit tests for dispatch routing. Covers:
 *  - slash command happy path: type-5 deferred ack + ctx.waitUntil-driven
 *    followup PATCH for /equipment and /player
 *  - slash command rejections: empty query, unknown command, search
 *    permission denied, malformed interaction (no application_id/token)
 *  - permission split: slash commands gate on checkSearchPermissions,
 *    button interactions on checkModeratorPermissions
 *  - message component custom_id routing (all 6 pairs + collision
 *    regressions). Untouched flows from the pre-TT-159 code path.
 *
 * /approve, /reject, !equipment, !player are removed in TT-159; the
 * tests asserting their absence live in dispatch's "unknown command"
 * test plus the e2e spec in TT-161.
 */

function makeWaitUntil(): {
  waitUntil: ReturnType<typeof vi.fn>;
  done: () => Promise<void>;
} {
  const promises: Promise<unknown>[] = [];
  const waitUntil = vi.fn((p: Promise<unknown>) => {
    promises.push(p);
  });
  return {
    waitUntil,
    done: () => Promise.allSettled(promises).then(() => undefined),
  };
}

function makeCtx(
  envOverrides: Record<string, string | undefined> = {},
  cf?: { waitUntil: ReturnType<typeof vi.fn> }
): DiscordContext {
  return {
    env: {
      DISCORD_BOT_TOKEN: "Bot.Token",
      DISCORD_ALLOWED_ROLES: "moderator",
      DISCORD_SEARCH_ALLOWED_ROLES: "",
      ENVIRONMENT: "production",
      SITE_URL: "https://tt-reviews.local",
      ...envOverrides,
    } as any,
    context: {
      cloudflare: cf
        ? { ctx: { waitUntil: cf.waitUntil } }
        : { ctx: { waitUntil: vi.fn() } },
    } as any,

    dbService: {} as any,

    supabaseAdmin: {} as any,

    moderationService: {} as any,

    unifiedNotifier: {} as any,
  };
}

const okResponse = () =>
  Promise.resolve(
    new Response(JSON.stringify({ type: 4, data: { content: "ok" } }), {
      headers: { "Content-Type": "application/json" },
    })
  );

const asJson = async (response: Response): Promise<any> =>
  JSON.parse(await response.text());

function makeInteraction(overrides: Record<string, any> = {}): any {
  return {
    type: 3,
    data: { custom_id: "approve_review_xyz" },
    member: {
      user: { id: "mod-user", username: "mod" },
      roles: ["moderator"],
    },
    guild_id: "g",
    application_id: "app-id",
    token: "interaction-token",
    ...overrides,
  };
}

describe("dispatch.handleSlashCommand — happy path (deferred)", () => {
  let waitUntil: ReturnType<typeof vi.fn>;
  let done: () => Promise<void>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    const wu = makeWaitUntil();
    waitUntil = wu.waitUntil;
    done = wu.done;
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("acks /equipment with type 5 (deferred)", async () => {
    vi.spyOn(search, "runEquipmentSearch").mockResolvedValue({
      kind: "embed",
      embed: { title: "Viscaria" },
      outcome: "single",
      topRank: 0.1,
      runnerUpRank: null,
      matchCount: 1,
    });
    const response = await dispatch.handleSlashCommand(
      makeCtx({}, { waitUntil }),
      {
        type: 2,
        data: { name: "equipment", options: [{ value: "viscaria" }] },
        member: { user: { id: "u", username: "u" }, roles: [] },
        guild_id: "g",
        application_id: "app-id",
        token: "tok",
      } as any
    );
    expect(response.status).toBe(200);
    expect(await asJson(response)).toEqual({ type: 5 });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await done();
    expect(search.runEquipmentSearch).toHaveBeenCalledWith(
      expect.any(Object),
      "viscaria"
    );
  });

  it("PATCHes the followup with the rendered embed for a single match", async () => {
    vi.spyOn(search, "runEquipmentSearch").mockResolvedValue({
      kind: "embed",
      embed: { title: "Viscaria", url: "https://x/eq/butterfly-viscaria" },
      outcome: "single",
      topRank: 0.1,
      runnerUpRank: null,
      matchCount: 1,
    });
    await dispatch.handleSlashCommand(makeCtx({}, { waitUntil }), {
      type: 2,
      data: { name: "equipment", options: [{ value: "viscaria" }] },
      member: { user: { id: "u", username: "u" }, roles: [] },
      guild_id: "g",
      application_id: "app-id",
      token: "tok",
    } as any);
    await done();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://discord.com/api/v10/webhooks/app-id/tok/messages/@original"
    );
    expect(init.method).toBe("PATCH");
    expect(init.headers).toMatchObject({
      Authorization: "Bot Bot.Token",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(init.body as string);
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0]).toMatchObject({
      title: "Viscaria",
      url: "https://x/eq/butterfly-viscaria",
    });
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it("PATCHes the followup with content text for an ambiguous match", async () => {
    vi.spyOn(search, "runEquipmentSearch").mockResolvedValue({
      kind: "ambiguity",
      content: "Multiple equipment match 'butterfly'.",
      outcome: "ambiguous",
      topRank: 0.1,
      runnerUpRank: 0.1,
      matchCount: 47,
    });
    await dispatch.handleSlashCommand(makeCtx({}, { waitUntil }), {
      type: 2,
      data: { name: "equipment", options: [{ value: "butterfly" }] },
      member: { user: { id: "u", username: "u" }, roles: [] },
      guild_id: "g",
      application_id: "app-id",
      token: "tok",
    } as any);
    await done();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.content).toBe("Multiple equipment match 'butterfly'.");
    expect(body.embeds).toBeUndefined();
  });

  it("PATCHes the followup with the fallback link for zero-match", async () => {
    vi.spyOn(search, "runEquipmentSearch").mockResolvedValue({
      kind: "empty",
      content:
        "No equipment found for 'xyz'. Try the site search: https://tt-reviews.local/equipment?q=xyz",
      outcome: "no-match",
      topRank: null,
      runnerUpRank: null,
      matchCount: 0,
    });
    await dispatch.handleSlashCommand(makeCtx({}, { waitUntil }), {
      type: 2,
      data: { name: "equipment", options: [{ value: "xyz" }] },
      member: { user: { id: "u", username: "u" }, roles: [] },
      guild_id: "g",
      application_id: "app-id",
      token: "tok",
    } as any);
    await done();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.content).toContain("Try the site search");
  });

  it("routes /player to runPlayerSearch", async () => {
    vi.spyOn(search, "runPlayerSearch").mockResolvedValue({
      kind: "embed",
      embed: { title: "Ma Long" },
      outcome: "single",
      topRank: 0.1,
      runnerUpRank: null,
      matchCount: 1,
    });
    await dispatch.handleSlashCommand(makeCtx({}, { waitUntil }), {
      type: 2,
      data: { name: "player", options: [{ value: "ma long" }] },
      member: { user: { id: "u", username: "u" }, roles: [] },
      guild_id: "g",
      application_id: "app-id",
      token: "tok",
    } as any);
    await done();
    expect(search.runPlayerSearch).toHaveBeenCalledWith(
      expect.any(Object),
      "ma long"
    );
  });
});

describe("dispatch.handleSlashCommand — synchronous-only paths", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("responds to the ping challenge (type 1) with type 1", async () => {
    const response = await dispatch.handleSlashCommand(makeCtx(), {
      type: 1,
    } as any);
    const body = await asJson(response);
    expect(body.type).toBe(1);
  });

  it("denies permission when checkSearchPermissions returns false", async () => {
    vi.spyOn(moderation, "checkSearchPermissions").mockResolvedValue(false);
    const response = await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "equipment", options: [{ value: "q" }] },
      member: { user: { id: "u" }, roles: [] },
      guild_id: "g",
      application_id: "app-id",
      token: "tok",
    } as any);
    const body = await asJson(response);
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("do not have permission");
  });

  it("returns 'Unknown command' for any non-equipment, non-player command (regression: /approve removed)", async () => {
    vi.spyOn(moderation, "checkSearchPermissions").mockResolvedValue(true);
    const response = await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "approve", options: [{ value: "id" }] },
      member: { user: { id: "u" }, roles: [] },
      guild_id: "g",
      application_id: "app-id",
      token: "tok",
    } as any);
    const body = await asJson(response);
    expect(body.data.content).toContain("Unknown command");
    expect(body.data.flags).toBe(64);
  });

  it("returns 'Unknown command' for /reject (also removed)", async () => {
    vi.spyOn(moderation, "checkSearchPermissions").mockResolvedValue(true);
    const response = await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "reject", options: [{ value: "id" }] },
      member: { user: { id: "u" }, roles: [] },
      guild_id: "g",
      application_id: "app-id",
      token: "tok",
    } as any);
    const body = await asJson(response);
    expect(body.data.content).toContain("Unknown command");
  });

  it("returns ephemeral error for empty query without deferring", async () => {
    vi.spyOn(moderation, "checkSearchPermissions").mockResolvedValue(true);
    const response = await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "equipment", options: [{ value: "   " }] },
      member: { user: { id: "u" }, roles: [] },
      guild_id: "g",
      application_id: "app-id",
      token: "tok",
    } as any);
    const body = await asJson(response);
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("Please provide a search query");
  });

  it("returns ephemeral error when application_id or token is missing", async () => {
    vi.spyOn(moderation, "checkSearchPermissions").mockResolvedValue(true);
    const response = await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "equipment", options: [{ value: "viscaria" }] },
      member: { user: { id: "u" }, roles: [] },
      guild_id: "g",
      // application_id and token deliberately absent
    } as any);
    const body = await asJson(response);
    expect(body.type).toBe(4);
    expect(body.data.content).toContain("malformed interaction");
  });
});

describe("dispatch.handleMessageComponent — custom_id routing", () => {
  let approveReview: any;

  let rejectReview: any;

  let approvePlayerEdit: any;

  let rejectPlayerEdit: any;

  let approveEquipment: any;

  let rejectEquipment: any;

  let approvePlayer: any;

  let rejectPlayer: any;

  let approveSetup: any;

  let rejectSetup: any;

  let approveVideo: any;

  let rejectVideo: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(moderation, "checkModeratorPermissions").mockResolvedValue(true);
    approveReview = vi
      .spyOn(moderation, "approveReview")
      .mockImplementation(okResponse);
    rejectReview = vi
      .spyOn(moderation, "rejectReview")
      .mockImplementation(okResponse);
    approvePlayerEdit = vi
      .spyOn(moderation, "approvePlayerEdit")
      .mockImplementation(okResponse);
    rejectPlayerEdit = vi
      .spyOn(moderation, "rejectPlayerEdit")
      .mockImplementation(okResponse);
    approveEquipment = vi
      .spyOn(moderation, "approveEquipmentSubmission")
      .mockImplementation(okResponse);
    rejectEquipment = vi
      .spyOn(moderation, "rejectEquipmentSubmission")
      .mockImplementation(okResponse);
    approvePlayer = vi
      .spyOn(moderation, "approvePlayerSubmission")
      .mockImplementation(okResponse);
    rejectPlayer = vi
      .spyOn(moderation, "rejectPlayerSubmission")
      .mockImplementation(okResponse);
    approveSetup = vi
      .spyOn(moderation, "approvePlayerEquipmentSetup")
      .mockImplementation(okResponse);
    rejectSetup = vi
      .spyOn(moderation, "rejectPlayerEquipmentSetup")
      .mockImplementation(okResponse);
    approveVideo = vi
      .spyOn(moderation, "approveVideoSubmission")
      .mockImplementation(okResponse);
    rejectVideo = vi
      .spyOn(moderation, "rejectVideoSubmission")
      .mockImplementation(okResponse);
  });

  it("denies permission when checkModeratorPermissions returns false", async () => {
    vi.spyOn(moderation, "checkModeratorPermissions").mockResolvedValue(false);
    const response = await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "approve_review_xyz" } })
    );
    const body = await asJson(response);
    expect(body.data.content).toContain("do not have permission");
    expect(approveReview).not.toHaveBeenCalled();
  });

  it("returns user-identity error when no user on interaction", async () => {
    const response = await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({
        data: { custom_id: "approve_review_xyz" },
        member: { roles: ["moderator"] },
      })
    );
    const body = await asJson(response);
    expect(body.data.content).toContain("Unable to identify user");
  });

  it("routes approve_player_edit_<id>", async () => {
    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "approve_player_edit_uuid1" } })
    );
    expect(approvePlayerEdit).toHaveBeenCalledWith(
      expect.any(Object),
      "uuid1",
      expect.any(Object)
    );
    expect(approvePlayer).not.toHaveBeenCalled();
  });

  it("routes reject_player_edit_<id>", async () => {
    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "reject_player_edit_uuid2" } })
    );
    expect(rejectPlayerEdit).toHaveBeenCalledWith(
      expect.any(Object),
      "uuid2",
      expect.any(Object)
    );
  });

  it("routes approve_equipment_<id>", async () => {
    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "approve_equipment_eq-1" } })
    );
    expect(approveEquipment).toHaveBeenCalledWith(
      expect.any(Object),
      "eq-1",
      expect.any(Object)
    );
  });

  it("routes reject_equipment_<id>", async () => {
    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "reject_equipment_eq-2" } })
    );
    expect(rejectEquipment).toHaveBeenCalledWith(
      expect.any(Object),
      "eq-2",
      expect.any(Object)
    );
  });

  it("routes approve_player_equipment_setup_<id> (not player submission)", async () => {
    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({
        data: { custom_id: "approve_player_equipment_setup_abc-123" },
      })
    );
    expect(approveSetup).toHaveBeenCalledWith(
      expect.any(Object),
      "abc-123",
      expect.any(Object)
    );
    expect(approvePlayer).not.toHaveBeenCalled();
  });

  it("routes reject_player_equipment_setup_<id> (not player submission)", async () => {
    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({
        data: { custom_id: "reject_player_equipment_setup_def-456" },
      })
    );
    expect(rejectSetup).toHaveBeenCalledWith(
      expect.any(Object),
      "def-456",
      expect.any(Object)
    );
    expect(rejectPlayer).not.toHaveBeenCalled();
  });

  it("routes plain approve_player_<id>", async () => {
    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "approve_player_plain-uuid" } })
    );
    expect(approvePlayer).toHaveBeenCalledWith(
      expect.any(Object),
      "plain-uuid",
      expect.any(Object)
    );
    expect(approveSetup).not.toHaveBeenCalled();
  });

  it("routes plain reject_player_<id>", async () => {
    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "reject_player_plain-uuid" } })
    );
    expect(rejectPlayer).toHaveBeenCalled();
    expect(rejectSetup).not.toHaveBeenCalled();
  });

  it("routes approve_video_<id> / reject_video_<id>", async () => {
    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "approve_video_v-1" } })
    );
    expect(approveVideo).toHaveBeenCalledWith(
      expect.any(Object),
      "v-1",
      expect.any(Object)
    );

    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "reject_video_v-2" } })
    );
    expect(rejectVideo).toHaveBeenCalledWith(
      expect.any(Object),
      "v-2",
      expect.any(Object)
    );
  });

  it("routes approve_review_<id> / reject_review_<id>", async () => {
    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "approve_review_rev1" } })
    );
    expect(approveReview).toHaveBeenCalledWith(
      expect.any(Object),
      "rev1",
      expect.any(Object)
    );

    await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "reject_review_rev2" } })
    );
    expect(rejectReview).toHaveBeenCalledWith(
      expect.any(Object),
      "rev2",
      expect.any(Object)
    );
  });

  it("returns 'Unknown interaction' for an unrecognised custom_id", async () => {
    const response = await dispatch.handleMessageComponent(
      makeCtx(),
      makeInteraction({ data: { custom_id: "something_else_xyz" } })
    );
    const body = await asJson(response);
    expect(body.data.content).toContain("Unknown interaction");
  });
});
