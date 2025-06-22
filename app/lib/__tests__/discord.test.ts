import { describe, it, expect, beforeAll } from "vitest";
import { DiscordService } from "../discord.server";
import { DatabaseService } from "../database.server";

// Helper function to check if Supabase environment is available
const hasSupabaseEnv = () => {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
};

// Mock AppLoadContext for testing
const createMockContext = () =>
  ({
    cloudflare: {
      env: {
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        DISCORD_PUBLIC_KEY:
          process.env.DISCORD_PUBLIC_KEY || "test_key_placeholder",
        DISCORD_BOT_TOKEN:
          process.env.DISCORD_BOT_TOKEN || "test_bot_token_placeholder",
        DISCORD_CHANNEL_ID:
          process.env.DISCORD_CHANNEL_ID || "123456789012345678",
        DISCORD_GUILD_ID:
          process.env.DISCORD_GUILD_ID || "987654321098765432",
        DISCORD_ALLOWED_ROLES:
          process.env.DISCORD_ALLOWED_ROLES || "role_id_1,role_id_2,role_id_3",
        SITE_URL: process.env.SITE_URL || "https://tt-reviews.local",
      },
    },
  }) as any;

describe("Discord Integration", () => {
  let discordService: DiscordService;
  let dbService: DatabaseService;
  let mockContext: any;

  beforeAll(() => {
    // Only initialize services if Supabase environment is available
    if (hasSupabaseEnv()) {
      mockContext = createMockContext();
      discordService = new DiscordService(mockContext);
      dbService = new DatabaseService(mockContext);
    }
  });

  describe("Push Functionality - Discord Notifications", () => {
    it.skipIf(!hasSupabaseEnv())("should generate valid Discord embed structure for equipment submission", async () => {
      const mockSubmissionData = {
        id: "test-equipment-123",
        name: "Test Blade",
        manufacturer: "Test Manufacturer",
        category: "blade",
        subcategory: null,
        submitter_email: "test@example.com",
      };

      // Mock the fetch function to capture the payload
      let capturedPayload: any = null;
      let capturedUrl: string = "";
      const originalFetch = global.fetch;
      global.fetch = async (url: string, options: any) => {
        capturedUrl = url;
        capturedPayload = JSON.parse(options.body);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };

      try {
        const result =
          await discordService.notifyNewEquipmentSubmission(mockSubmissionData);

        expect(result.success).toBe(true);
        expect(capturedPayload).toBeDefined();
        expect(capturedUrl).toMatch(/^https:\/\/discord\.com\/api\/v10\/channels\/\d+\/messages$/);

        // Validate Discord embed structure
        expect(capturedPayload).toHaveProperty("embeds");
        expect(capturedPayload.embeds).toHaveLength(1);

        const embed = capturedPayload.embeds[0];
        expect(embed).toHaveProperty("title", "⚙️ Equipment Submission");
        expect(embed).toHaveProperty("description");
        expect(embed).toHaveProperty("color", 0x9b59b6); // Purple color
        expect(embed).toHaveProperty("fields");
        expect(embed).toHaveProperty("timestamp");

        // Validate embed fields
        expect(embed.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: "Equipment Name",
              value: "Test Blade",
              inline: true,
            }),
            expect.objectContaining({
              name: "Manufacturer",
              value: "Test Manufacturer",
              inline: true,
            }),
            expect.objectContaining({
              name: "Category",
              value: "Blade",
              inline: true,
            }),
          ])
        );

        // Validate action buttons
        expect(capturedPayload).toHaveProperty("components");
        expect(capturedPayload.components).toHaveLength(1);

        const actionRow = capturedPayload.components[0];
        expect(actionRow.type).toBe(1); // Action Row
        expect(actionRow.components).toHaveLength(2);

        const approveButton = actionRow.components[0];
        expect(approveButton.type).toBe(2); // Button
        expect(approveButton.style).toBe(3); // Success/Green
        expect(approveButton.label).toBe("Approve Equipment");
        expect(approveButton.custom_id).toBe(
          "approve_equipment_test-equipment-123"
        );

        const rejectButton = actionRow.components[1];
        expect(rejectButton.type).toBe(2); // Button
        expect(rejectButton.style).toBe(4); // Danger/Red
        expect(rejectButton.label).toBe("Reject Equipment");
        expect(rejectButton.custom_id).toBe(
          "reject_equipment_test-equipment-123"
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it.skipIf(!hasSupabaseEnv())("should generate valid Discord embed structure for player edit", async () => {
      const mockEditData = {
        id: "test-edit-123",
        player_name: "Test Player",
        player_id: "player-123",
        edit_data: {
          name: "Updated Player Name",
          highest_rating: "3000+",
          playing_style: "attacker",
        },
        submitter_email: "test@example.com",
      };

      let capturedPayload: any = null;
      let capturedUrl: string = "";
      const originalFetch = global.fetch;
      global.fetch = async (url: string, options: any) => {
        capturedUrl = url;
        capturedPayload = JSON.parse(options.body);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };

      try {
        const result = await discordService.notifyNewPlayerEdit(mockEditData);

        expect(result.success).toBe(true);
        expect(capturedPayload).toBeDefined();
        expect(capturedUrl).toMatch(/^https:\/\/discord\.com\/api\/v10\/channels\/\d+\/messages$/);

        // Validate Discord embed structure
        const embed = capturedPayload.embeds[0];
        expect(embed).toHaveProperty("title", "🏓 Player Edit Submitted");
        expect(embed).toHaveProperty("color", 0xe67e22); // Orange color

        // Validate changes field
        const changesField = embed.fields.find(
          (field: any) => field.name === "Changes"
        );
        expect(changesField).toBeDefined();
        expect(changesField.value).toContain("Name: Updated Player Name");
        expect(changesField.value).toContain("Rating: 3000+");

        // Validate action buttons with correct custom_id format
        const actionRow = capturedPayload.components[0];
        expect(actionRow.components[0].custom_id).toBe(
          "approve_player_edit_test-edit-123"
        );
        expect(actionRow.components[1].custom_id).toBe(
          "reject_player_edit_test-edit-123"
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("Pull Functionality - Discord Slash Commands", () => {
    it.skipIf(!hasSupabaseEnv())("should handle equipment search command with real database", async () => {
      const mockInteraction = {
        type: 2, // Application Command
        data: {
          name: "equipment",
          options: [{ value: "butterfly" }],
        },
        user: { id: "test-user", username: "TestUser" },
        member: { roles: ["role_id_1"] },
        guild_id: "test-guild",
      };

      const response = await discordService.handleSlashCommand(mockInteraction);
      expect(response).toBeInstanceOf(Response);

      const responseData = await response.json();
      expect(responseData).toHaveProperty("type", 4); // Channel message with source
      expect(responseData).toHaveProperty("data");
      expect(responseData.data).toHaveProperty("content");

      // Should contain search results or "no results" message
      const content = responseData.data.content;
      expect(content).toMatch(/Equipment Search Results|No equipment found/);

      if (content.includes("Equipment Search Results")) {
        // If results found, should contain equipment info
        expect(content).toMatch(/🏓.*Equipment Search Results for "butterfly"/);
      } else {
        // If no results, should be proper no-results message
        expect(content).toBe('🔍 No equipment found for "butterfly"');
      }
    });

    it.skipIf(!hasSupabaseEnv())("should handle player search command with real database", async () => {
      const mockInteraction = {
        type: 2,
        data: {
          name: "player",
          options: [{ value: "test" }],
        },
        user: { id: "test-user", username: "TestUser" },
        member: { roles: ["role_id_1"] },
        guild_id: "test-guild",
      };

      const response = await discordService.handleSlashCommand(mockInteraction);
      const responseData = await response.json();

      expect(responseData.type).toBe(4);
      expect(responseData.data.content).toMatch(
        /Player Search Results|No players found/
      );
    });

    it.skipIf(!hasSupabaseEnv())("should reject commands from users without proper roles", async () => {
      const mockInteraction = {
        type: 2,
        data: {
          name: "equipment",
          options: [{ value: "test" }],
        },
        user: { id: "test-user", username: "TestUser" },
        member: { roles: ["wrong_role"] }, // Not in DISCORD_ALLOWED_ROLES
        guild_id: "test-guild",
      };

      const response = await discordService.handleSlashCommand(mockInteraction);
      const responseData = await response.json();

      expect(responseData.type).toBe(4);
      expect(responseData.data.content).toBe(
        "❌ You do not have permission to use this command."
      );
      expect(responseData.data.flags).toBe(64); // Ephemeral flag
    });

    it.skipIf(!hasSupabaseEnv())("should handle empty search queries appropriately", async () => {
      const mockInteraction = {
        type: 2,
        data: {
          name: "equipment",
          options: [{ value: "" }],
        },
        user: { id: "test-user", username: "TestUser" },
        member: { roles: ["role_id_1"] },
        guild_id: "test-guild",
      };

      const response = await discordService.handleSlashCommand(mockInteraction);
      const responseData = await response.json();

      expect(responseData.type).toBe(4);
      expect(responseData.data.content).toContain(
        "Please provide a search query"
      );
      expect(responseData.data.flags).toBe(64); // Ephemeral flag
    });
  });

  describe("Button Interactions - Moderation Actions", () => {
    it.skipIf(!hasSupabaseEnv())("should handle equipment approval button interaction", async () => {
      const mockInteraction = {
        type: 3, // Message Component
        data: {
          custom_id: "approve_equipment_12345678-1234-1234-1234-123456789999",
        },
        user: {
          id: "12345678-1234-1234-1234-123456789012",
          username: "TestModerator",
        },
        member: { roles: ["role_id_1"] },
        guild_id: "test-guild",
      };

      const response =
        await discordService.handleMessageComponent(mockInteraction);
      const responseData = await response.json();

      expect(responseData.type).toBe(4);
      // Should handle duplicate approvals gracefully
      expect(responseData.data.content).toMatch(
        /Error.*already approved/
      );
      expect(responseData.data.flags).toBe(64); // Ephemeral flag
    });

    it.skipIf(!hasSupabaseEnv())("should handle player edit approval button interaction", async () => {
      const mockInteraction = {
        type: 3,
        data: {
          custom_id: "approve_player_edit_12345678-1234-1234-1234-123456789999",
        },
        user: {
          id: "12345678-1234-1234-1234-123456789012",
          username: "TestModerator",
        },
        member: { roles: ["role_id_1"] },
        guild_id: "test-guild",
      };

      const response =
        await discordService.handleMessageComponent(mockInteraction);
      const responseData = await response.json();

      expect(responseData.type).toBe(4);
      expect(responseData.data.content).toMatch(
        /Error.*already approved/
      );
      expect(responseData.data.flags).toBe(64);
    });

    it.skipIf(!hasSupabaseEnv())("should reject button interactions from unauthorized users", async () => {
      const mockInteraction = {
        type: 3,
        data: {
          custom_id: "approve_equipment_test-123",
        },
        user: { id: "unauthorized-user", username: "UnauthorizedUser" },
        member: { roles: ["wrong_role"] },
        guild_id: "test-guild",
      };

      const response =
        await discordService.handleMessageComponent(mockInteraction);
      const responseData = await response.json();

      expect(responseData.type).toBe(4);
      expect(responseData.data.content).toBe(
        "❌ You do not have permission to use this command."
      );
      expect(responseData.data.flags).toBe(64);
    });

    it.skipIf(!hasSupabaseEnv())("should handle unknown button interactions", async () => {
      const mockInteraction = {
        type: 3,
        data: {
          custom_id: "unknown_action_123",
        },
        user: { id: "test-user", username: "TestUser" },
        member: { roles: ["role_id_1"] },
        guild_id: "test-guild",
      };

      const response =
        await discordService.handleMessageComponent(mockInteraction);
      const responseData = await response.json();

      expect(responseData.type).toBe(4);
      expect(responseData.data.content).toBe("❌ Unknown interaction.");
      expect(responseData.data.flags).toBe(64);
    });
  });

  describe("Discord Ping Response", () => {
    it.skipIf(!hasSupabaseEnv())("should respond to Discord ping challenge", async () => {
      const mockPingInteraction = {
        type: 1, // Ping
        data: {}, // Add empty data object to avoid the error
      };

      const response = await discordService.handleSlashCommand(
        mockPingInteraction as any
      );
      const responseData = await response.json();

      expect(responseData).toEqual({ type: 1 }); // Pong
    });
  });

  describe("Prefix Commands", () => {
    it.skipIf(!hasSupabaseEnv())("should handle equipment prefix command", async () => {
      const mockMessage = {
        content: "!equipment butterfly",
        member: { roles: ["role_id_1"] },
        guild_id: "test-guild",
      };

      const result = await discordService.handlePrefixCommand(mockMessage);

      expect(result).toBeDefined();
      expect(result.content).toMatch(
        /Equipment Search Results|No equipment found/
      );
    });

    it.skipIf(!hasSupabaseEnv())("should handle player prefix command", async () => {
      const mockMessage = {
        content: "!player test",
        member: { roles: ["role_id_1"] },
        guild_id: "test-guild",
      };

      const result = await discordService.handlePrefixCommand(mockMessage);

      expect(result).toBeDefined();
      expect(result.content).toMatch(/Player Search Results|No players found/);
    });

    it.skipIf(!hasSupabaseEnv())("should return null for unrecognized prefix commands", async () => {
      const mockMessage = {
        content: "!unknown command",
        member: { roles: ["role_id_1"] },
        guild_id: "test-guild",
      };

      const result = await discordService.handlePrefixCommand(mockMessage);
      expect(result).toBeNull();
    });

    it.skipIf(!hasSupabaseEnv())("should reject prefix commands from unauthorized users", async () => {
      const mockMessage = {
        content: "!equipment test",
        member: { roles: ["wrong_role"] },
        guild_id: "test-guild",
      };

      const result = await discordService.handlePrefixCommand(mockMessage);

      expect(result).toBeDefined();
      expect(result.content).toBe(
        "❌ You do not have permission to use this command."
      );
    });
  });
});
