import type { Route } from "./+types/test-discord";
import { DiscordService } from "~/lib/discord.server";

export async function loader({ context }: Route.LoaderArgs) {
  // Only allow this in development
  const env = context.cloudflare.env as Cloudflare.Env;
  if (env.ENVIRONMENT === "production") {
    return Response.json(
      { error: "Not available in production" },
      { status: 404 }
    );
  }

  return Response.json({
    message: "Discord integration test endpoint",
    availableTests: [
      "POST /test-discord - Test Discord notification",
      "POST /test-discord with interaction data - Test Discord command handling",
    ],
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  // Only allow this in development
  const env = context.cloudflare.env as Cloudflare.Env;
  if (env.ENVIRONMENT === "production") {
    return Response.json(
      { error: "Not available in production" },
      { status: 404 }
    );
  }

  try {
    const discordService = new DiscordService(context);
    const body = await request.json();

    // Test different Discord integration features
    if (body.test === "notification") {
      // Test equipment notification
      const notificationResult =
        await discordService.notifyNewEquipmentSubmission({
          id: "test-123",
          name: "Test Equipment",
          manufacturer: "Test Manufacturer",
          category: "blade",
          subcategory: null,
          submitter_email: "test@example.com",
        });

      return Response.json({
        success: true,
        test: "notification",
        result: notificationResult,
        note: "This would normally send to Discord webhook",
      });
    }

    if (body.test === "slash_command") {
      // Test slash command handling
      const mockInteraction = {
        type: 2,
        data: {
          name: "equipment",
          options: [{ value: "butterfly" }],
        },
        user: { id: "test-user", username: "TestUser" },
        member: { roles: [] },
        guild_id: "test-guild",
      };

      const response = await discordService.handleSlashCommand(mockInteraction);
      const responseData = await response.json();

      return Response.json({
        success: true,
        test: "slash_command",
        result: responseData,
        note: "Equipment search command executed",
      });
    }

    if (body.test === "button_interaction") {
      // Test button interaction handling
      const mockInteraction = {
        type: 3,
        data: {
          custom_id: "approve_equipment_test-123",
        },
        user: { id: "test-moderator", username: "TestModerator" },
        member: { roles: ["allowed-role"] },
        guild_id: "test-guild",
      };

      const response =
        await discordService.handleMessageComponent(mockInteraction);
      const responseData = await response.json();

      return Response.json({
        success: true,
        test: "button_interaction",
        result: responseData,
        note: "Equipment approval button interaction executed",
      });
    }

    if (body.test === "player_search") {
      // Test player search
      const mockInteraction = {
        type: 2,
        data: {
          name: "player",
          options: [{ value: "test" }],
        },
        user: { id: "test-user", username: "TestUser" },
        member: { roles: [] },
        guild_id: "test-guild",
      };

      const response = await discordService.handleSlashCommand(mockInteraction);
      const responseData = await response.json();

      return Response.json({
        success: true,
        test: "player_search",
        result: responseData,
        note: "Player search command executed",
      });
    }

    return Response.json({
      error: "Unknown test type",
      availableTests: [
        "notification",
        "slash_command",
        "button_interaction",
        "player_search",
      ],
    });
  } catch (error) {
    console.error("Discord test error:", error);
    return Response.json(
      {
        error: "Test failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export default function TestDiscord() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Discord Integration Test</h1>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-yellow-800">
          <strong>Note:</strong> This test endpoint is only available in
          development mode. It allows testing Discord integration functionality
          without making actual Discord API calls.
        </p>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">
            Test Equipment Notification
          </h2>
          <button
            onClick={() => testDiscordFeature("notification")}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Test Equipment Notification
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">
            Test Equipment Search Command
          </h2>
          <button
            onClick={() => testDiscordFeature("slash_command")}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Test /equipment Command
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">
            Test Player Search Command
          </h2>
          <button
            onClick={() => testDiscordFeature("player_search")}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
          >
            Test /player Command
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">
            Test Button Interaction
          </h2>
          <button
            onClick={() => testDiscordFeature("button_interaction")}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Test Approve Equipment Button
          </button>
        </div>
      </div>

      <div id="test-results" className="mt-8"></div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            async function testDiscordFeature(testType) {
              const resultsDiv = document.getElementById('test-results');
              resultsDiv.innerHTML = '<div class="bg-blue-50 p-4 rounded">Testing ' + testType + '...</div>';
              
              try {
                const response = await fetch('/test-discord', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ test: testType })
                });
                
                const result = await response.json();
                
                resultsDiv.innerHTML = 
                  '<div class="bg-white rounded-lg shadow-md p-6">' +
                  '<h3 class="text-lg font-semibold mb-4">Test Results: ' + testType + '</h3>' +
                  '<pre class="bg-gray-100 p-4 rounded text-sm overflow-auto">' + 
                  JSON.stringify(result, null, 2) + 
                  '</pre></div>';
              } catch (error) {
                resultsDiv.innerHTML = 
                  '<div class="bg-red-50 border border-red-200 p-4 rounded">' +
                  '<p class="text-red-800">Error: ' + error.message + '</p></div>';
              }
            }
          `,
        }}
      />
    </div>
  );
}
