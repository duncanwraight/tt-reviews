import type { Route } from "./+types/api.discord.interactions";
import { DiscordService } from "~/lib/discord.server";
import { isDevelopment as isDevelopmentEnv } from "~/lib/env.server";
import { Logger, createLogContext } from "~/lib/logger.server";

export async function action({ request, context }: Route.ActionArgs) {
  // Import security functions at top of action for use in catch block
  const {
    createSecureResponse,
    sanitizeError,
    rateLimit,
    RATE_LIMITS,
    createRateLimitResponse,
  } = await import("~/lib/security.server");

  const isDev = isDevelopmentEnv(context);

  try {
    const rateLimitResult = await rateLimit(
      request,
      RATE_LIMITS.DISCORD_WEBHOOK,
      context
    );
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult.resetTime!, context);
    }

    const discordService = new DiscordService(context);

    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();

    if (!signature || !timestamp) {
      return createSecureResponse(
        JSON.stringify({ error: "Missing signature headers" }),
        {
          status: 401,
          isApi: true,
          headers: { "Content-Type": "application/json" },
          context,
        }
      );
    }

    const isValid = await discordService.verifySignature(
      signature,
      timestamp,
      body
    );
    if (!isValid) {
      return createSecureResponse(
        JSON.stringify({ error: "Invalid signature" }),
        {
          status: 401,
          isApi: true,
          headers: { "Content-Type": "application/json" },
          context,
        }
      );
    }

    const interaction = JSON.parse(body);

    const rateLimitInfo = {
      resetTime: rateLimitResult.resetTime!,
      remaining: rateLimitResult.remaining!,
    };

    if (interaction.type === 1) {
      return createSecureResponse(JSON.stringify({ type: 1 }), {
        isApi: true,
        headers: { "Content-Type": "application/json" },
        rateLimit: rateLimitInfo,
        context,
      });
    }

    if (interaction.type === 2) {
      const response = await discordService.handleSlashCommand(interaction);
      const responseData = await response.json();
      return createSecureResponse(JSON.stringify(responseData), {
        isApi: true,
        headers: { "Content-Type": "application/json" },
        rateLimit: rateLimitInfo,
        context,
      });
    }

    if (interaction.type === 3) {
      const response = await discordService.handleMessageComponent(interaction);
      const responseData = await response.json();
      return createSecureResponse(JSON.stringify(responseData), {
        isApi: true,
        headers: { "Content-Type": "application/json" },
        rateLimit: rateLimitInfo,
        context,
      });
    }

    return createSecureResponse(
      JSON.stringify({ error: "Unknown interaction type" }),
      {
        status: 400,
        isApi: true,
        headers: { "Content-Type": "application/json" },
        rateLimit: rateLimitInfo,
        context,
      }
    );
  } catch (error) {
    const errorMessage = sanitizeError(error, isDev);

    if (isDev) {
      Logger.error(
        "Discord interaction error",
        createLogContext(
          request.headers.get("X-Request-ID") || "discord-interaction",
          { route: "/api/discord/interactions", method: request.method }
        ),
        error instanceof Error ? error : undefined
      );
    }

    if (
      error instanceof Error &&
      error.message.includes("Discord verification key")
    ) {
      return createSecureResponse(
        JSON.stringify({ error: "Discord service configuration error" }),
        {
          status: 500,
          isApi: true,
          headers: { "Content-Type": "application/json" },
          context,
        }
      );
    }

    return createSecureResponse(JSON.stringify({ error: errorMessage }), {
      status: 500,
      isApi: true,
      headers: { "Content-Type": "application/json" },
      context,
    });
  }
}

// Only allow POST requests
export async function loader({ context }: Route.LoaderArgs) {
  const { createSecureResponse } = await import("~/lib/security.server");
  return createSecureResponse(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    isApi: true,
    headers: { "Content-Type": "application/json" },
    context,
  });
}
