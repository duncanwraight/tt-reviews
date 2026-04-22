import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiscordService } from "../discord.server";
import * as moderation from "../discord/moderation";
import type { AppLoadContext } from "react-router";

// Build a context object that satisfies the constructor — no real network
// calls happen until a handler runs, and we spy out the handlers below.
const context = {
  cloudflare: {
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL || "http://localhost:54321",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "test-anon",
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service",
      DISCORD_PUBLIC_KEY: "x",
      DISCORD_BOT_TOKEN: "x",
      DISCORD_CHANNEL_ID: "x",
      DISCORD_GUILD_ID: "x",
      DISCORD_ALLOWED_ROLES: "moderator",
      SITE_URL: "http://localhost:5173",
    },
  },
} as unknown as AppLoadContext;

const makeInteraction = (customId: string) =>
  ({
    type: 3,
    data: { custom_id: customId, component_type: 2 },
    member: {
      user: { id: "mod-user", username: "mod" },
      roles: ["moderator"],
    },
    guild_id: "g",
  }) as unknown as Parameters<DiscordService["handleMessageComponent"]>[0];

// Regression test for todo/BUGS.md: "Discord Approval Button Error for
// Player Equipment Setup". `approve_player_equipment_setup_<uuid>` used
// to match the `approve_player_` branch first, producing a submissionId
// of `equipment_setup_<uuid>` and routing to the wrong handler. The fix
// reorders the branches; this test pins the ordering.
describe("DiscordService.handleMessageComponent — custom_id routing", () => {
  let service: DiscordService;
  // Spies on module exports — specific signatures don't fit the generic
  // vi.spyOn return type, so use any and rely on the runtime assertions.
  let approveSetup: any;
  let rejectSetup: any;
  let approvePlayer: any;
  let rejectPlayer: any;

  beforeEach(() => {
    service = new DiscordService(context);

    vi.spyOn(moderation, "checkUserPermissions").mockResolvedValue(true);

    const ok = () =>
      Promise.resolve(
        new Response(JSON.stringify({ type: 4, data: { content: "ok" } }))
      );

    approveSetup = vi
      .spyOn(moderation, "approvePlayerEquipmentSetup")
      .mockImplementation(ok);
    rejectSetup = vi
      .spyOn(moderation, "rejectPlayerEquipmentSetup")
      .mockImplementation(ok);
    approvePlayer = vi
      .spyOn(moderation, "approvePlayerSubmission")
      .mockImplementation(ok);
    rejectPlayer = vi
      .spyOn(moderation, "rejectPlayerSubmission")
      .mockImplementation(ok);
  });

  it("routes approve_player_equipment_setup_<uuid> to the setup handler with the UUID stripped", async () => {
    await service.handleMessageComponent(
      makeInteraction("approve_player_equipment_setup_abc-123-def")
    );

    expect(approveSetup).toHaveBeenCalledTimes(1);
    // First arg is now the DiscordContext (injected by dispatch);
    // second is the submissionId, third is the user.
    expect(approveSetup).toHaveBeenCalledWith(
      expect.any(Object),
      "abc-123-def",
      expect.objectContaining({ id: "mod-user" })
    );
    expect(approvePlayer).not.toHaveBeenCalled();
  });

  it("routes reject_player_equipment_setup_<uuid> to the setup reject handler", async () => {
    await service.handleMessageComponent(
      makeInteraction("reject_player_equipment_setup_uuid-42")
    );

    expect(rejectSetup).toHaveBeenCalledTimes(1);
    expect(rejectSetup).toHaveBeenCalledWith(
      expect.any(Object),
      "uuid-42",
      expect.any(Object)
    );
    expect(rejectPlayer).not.toHaveBeenCalled();
  });

  it("still routes plain approve_player_<uuid> to the player submission handler", async () => {
    await service.handleMessageComponent(
      makeInteraction("approve_player_plain-uuid")
    );

    expect(approvePlayer).toHaveBeenCalledTimes(1);
    expect(approvePlayer).toHaveBeenCalledWith(
      expect.any(Object),
      "plain-uuid",
      expect.any(Object)
    );
    expect(approveSetup).not.toHaveBeenCalled();
  });

  it("still routes plain reject_player_<uuid> to the player submission reject handler", async () => {
    await service.handleMessageComponent(
      makeInteraction("reject_player_plain-uuid")
    );

    expect(rejectPlayer).toHaveBeenCalledTimes(1);
    expect(rejectSetup).not.toHaveBeenCalled();
  });
});
