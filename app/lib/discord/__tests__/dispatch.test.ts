import { describe, it, expect, vi, beforeEach } from "vitest";
import * as dispatch from "../dispatch";
import * as moderation from "../moderation";
import * as search from "../search";
import type { DiscordContext } from "../types";

/**
 * Unit tests for dispatch routing. Covers:
 *  - slash commands (equipment, player, approve, reject, ping, unknown)
 *  - prefix commands (!equipment, !player, no-prefix)
 *  - message component custom_id routing (all 6 pairs + collision)
 *  - permission gate + missing-user guard
 *
 * Absorbs the prior discord-custom-id-routing.test.ts — the
 * regression-pinning tests for the approve_player_equipment_setup_
 * vs approve_player_ collision remain, now asserted against the
 * moderation module directly rather than class private methods.
 */

function makeCtx(): DiscordContext {
  return {
     
    env: {} as any,
     
    context: {} as any,
     
    dbService: {} as any,
     
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
    ...overrides,
  };
}

describe("dispatch.handleSlashCommand", () => {
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

  it("rejects approve without a user", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(true);
    const response = await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "approve", options: [{ value: "rid" }] },
      member: { roles: ["moderator"] }, // no user anywhere
      guild_id: "g",
       
    } as any);
    const body = await asJson(response);
    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.content).toContain("Unable to identify user");
  });

  it("denies permission when checkUserPermissions returns false", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(false);
    const response = await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "equipment", options: [{ value: "q" }] },
      member: { user: { id: "u", username: "u" }, roles: [] },
      guild_id: "g",
       
    } as any);
    const body = await asJson(response);
    expect(body.data.content).toContain("do not have permission");
    expect(body.data.flags).toBe(64);
  });

  it("routes 'equipment' command to search.handleEquipmentSearch", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(true);
    const spy = vi
      .spyOn(search, "handleEquipmentSearch")
      .mockImplementation(okResponse);
    await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "equipment", options: [{ value: "butterfly" }] },
      member: { user: { id: "u", username: "u" }, roles: ["moderator"] },
      guild_id: "g",
       
    } as any);
    expect(spy).toHaveBeenCalledWith(expect.any(Object), "butterfly");
  });

  it("routes 'player' command to search.handlePlayerSearch", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(true);
    const spy = vi
      .spyOn(search, "handlePlayerSearch")
      .mockImplementation(okResponse);
    await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "player", options: [{ value: "ma long" }] },
      member: { user: { id: "u", username: "u" }, roles: ["moderator"] },
      guild_id: "g",
       
    } as any);
    expect(spy).toHaveBeenCalledWith(expect.any(Object), "ma long");
  });

  it("routes 'approve' command to moderation.approveReview", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(true);
    const spy = vi
      .spyOn(moderation, "approveReview")
      .mockImplementation(okResponse);
    await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "approve", options: [{ value: "r-id" }] },
      member: { user: { id: "u", username: "u" }, roles: ["moderator"] },
      guild_id: "g",
       
    } as any);
    expect(spy).toHaveBeenCalledWith(
      expect.any(Object),
      "r-id",
      expect.objectContaining({ id: "u" })
    );
  });

  it("routes 'reject' command to moderation.rejectReview", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(true);
    const spy = vi
      .spyOn(moderation, "rejectReview")
      .mockImplementation(okResponse);
    await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "reject", options: [{ value: "r-id" }] },
      member: { user: { id: "u", username: "u" }, roles: ["moderator"] },
      guild_id: "g",
       
    } as any);
    expect(spy).toHaveBeenCalledWith(
      expect.any(Object),
      "r-id",
      expect.any(Object)
    );
  });

  it("returns 'Unknown command' for any other command name", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(true);
    const response = await dispatch.handleSlashCommand(makeCtx(), {
      type: 2,
      data: { name: "nonsense", options: [] },
      member: { user: { id: "u", username: "u" }, roles: ["moderator"] },
      guild_id: "g",
       
    } as any);
    const body = await asJson(response);
    expect(body.data.content).toContain("Unknown command");
  });
});

describe("dispatch.handlePrefixCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("denies permission when checkUserPermissions returns false", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(false);
    const result = await dispatch.handlePrefixCommand(makeCtx(), {
      content: "!equipment x",
      member: { roles: [] },
      guild_id: "g",
    });
    expect(result.content).toContain("do not have permission");
  });

  it("routes !equipment to search.searchEquipment", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(true);
    const spy = vi
      .spyOn(search, "searchEquipment")
      .mockResolvedValue({ content: "eq results" });
    await dispatch.handlePrefixCommand(makeCtx(), {
      content: "!equipment viscaria",
      member: { roles: ["moderator"] },
      guild_id: "g",
    });
    expect(spy).toHaveBeenCalledWith(expect.any(Object), "viscaria");
  });

  it("routes !player to search.searchPlayer", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(true);
    const spy = vi
      .spyOn(search, "searchPlayer")
      .mockResolvedValue({ content: "player results" });
    await dispatch.handlePrefixCommand(makeCtx(), {
      content: "!player ma long",
      member: { roles: ["moderator"] },
      guild_id: "g",
    });
    expect(spy).toHaveBeenCalledWith(expect.any(Object), "ma long");
  });

  it("returns null for unknown prefixes", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(true);
    const result = await dispatch.handlePrefixCommand(makeCtx(), {
      content: "!help",
      member: { roles: ["moderator"] },
      guild_id: "g",
    });
    expect(result).toBeNull();
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
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(true);
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

  it("denies permission when checkUserPermissions returns false", async () => {
    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(false);
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
        member: { roles: ["moderator"] }, // no member.user, no interaction.user
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

  // Regression: approve_player_equipment_setup_<id> must not be swallowed
  // by the shorter approve_player_ prefix.
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

  it("routes plain approve_player_<id> to the player submission handler", async () => {
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

  it("routes plain reject_player_<id> to the player submission reject handler", async () => {
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
