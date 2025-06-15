import type { Route } from "./+types/api.discord.interactions";
import { DiscordService } from "~/lib/discord.server";

export async function action({ request, context }: Route.ActionArgs) {
  try {
    // Import security functions inside server-only action
    const { 
      createSecureResponse, 
      sanitizeError, 
      rateLimit, 
      RATE_LIMITS,
      createRateLimitResponse 
    } = await import("~/lib/security.server");
    
    // Apply rate limiting
    const rateLimitResult = await rateLimit(request, RATE_LIMITS.DISCORD_WEBHOOK, context);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult.resetTime!);
    }

    const discordService = new DiscordService(context);

    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();

    // Verify Discord signature
    if (!signature || !timestamp) {
      return createSecureResponse(
        JSON.stringify({ error: "Missing signature headers" }), 
        { status: 401, isApi: true, headers: { "Content-Type": "application/json" } }
      );
    }

    const isValid = await discordService.verifySignature(signature, timestamp, body);
    if (!isValid) {
      return createSecureResponse(
        JSON.stringify({ error: "Invalid signature" }), 
        { status: 401, isApi: true, headers: { "Content-Type": "application/json" } }
      );
    }

    const interaction = JSON.parse(body);

    const rateLimitInfo = { resetTime: rateLimitResult.resetTime!, remaining: rateLimitResult.remaining! };

    // Handle ping challenge
    if (interaction.type === 1) {
      return createSecureResponse(
        JSON.stringify({ type: 1 }), 
        { isApi: true, headers: { "Content-Type": "application/json" }, rateLimit: rateLimitInfo }
      );
    }

    // Handle application commands (slash commands)
    if (interaction.type === 2) {
      const response = await discordService.handleSlashCommand(interaction);
      const responseData = await response.json();
      return createSecureResponse(
        JSON.stringify(responseData), 
        { isApi: true, headers: { "Content-Type": "application/json" }, rateLimit: rateLimitInfo }
      );
    }

    // Handle message components (buttons, select menus)
    if (interaction.type === 3) {
      const response = await discordService.handleMessageComponent(interaction);
      const responseData = await response.json();
      return createSecureResponse(
        JSON.stringify(responseData), 
        { isApi: true, headers: { "Content-Type": "application/json" }, rateLimit: rateLimitInfo }
      );
    }

    return createSecureResponse(
      JSON.stringify({ error: "Unknown interaction type" }), 
      { status: 400, isApi: true, headers: { "Content-Type": "application/json" }, rateLimit: rateLimitInfo }
    );
  } catch (error) {
    const isDevelopment = process.env.NODE_ENV === "development";
    const errorMessage = sanitizeError(error, isDevelopment);
    
    if (isDevelopment) {
      console.error("Discord interaction error:", error);
    }
    
    // Return generic error for configuration issues
    if (error instanceof Error && error.message.includes("Discord verification key")) {
      return createSecureResponse(
        JSON.stringify({ error: "Discord service configuration error" }), 
        { status: 500, isApi: true, headers: { "Content-Type": "application/json" } }
      );
    }
    
    return createSecureResponse(
      JSON.stringify({ error: errorMessage }), 
      { status: 500, isApi: true, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Only allow POST requests
export async function loader() {
  const { createSecureResponse } = await import("~/lib/security.server");
  return createSecureResponse(
    JSON.stringify({ error: "Method not allowed" }), 
    { status: 405, isApi: true, headers: { "Content-Type": "application/json" } }
  );
}