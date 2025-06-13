import type { Route } from "./+types/api.discord.interactions";
import { DiscordService } from "~/lib/discord.server";

export async function action({ request, context }: Route.ActionArgs) {
  try {
    const discordService = new DiscordService(context);

    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();

    // Verify Discord signature
    if (!signature || !timestamp) {
      return Response.json({ error: "Missing signature headers" }, { status: 401 });
    }

    const isValid = await discordService.verifySignature(signature, timestamp, body);
    if (!isValid) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const interaction = JSON.parse(body);

    // Handle ping challenge
    if (interaction.type === 1) {
      return Response.json({ type: 1 });
    }

    // Handle application commands (slash commands)
    if (interaction.type === 2) {
      const response = await discordService.handleSlashCommand(interaction);
      const responseData = await response.json();
      return Response.json(responseData);
    }

    // Handle message components (buttons, select menus)
    if (interaction.type === 3) {
      const response = await discordService.handleMessageComponent(interaction);
      const responseData = await response.json();
      return Response.json(responseData);
    }

    return Response.json({ error: "Unknown interaction type" }, { status: 400 });
  } catch (error) {
    console.error("Discord interaction error:", error);
    
    // Return generic error for configuration issues
    if (error instanceof Error && error.message.includes("Discord verification key")) {
      return Response.json(
        { error: "Discord service configuration error" }, 
        { status: 500 }
      );
    }
    
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Only allow POST requests
export async function loader() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}