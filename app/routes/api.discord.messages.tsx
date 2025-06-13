import type { Route } from "./+types/api.discord.messages";
import { DiscordService } from "~/lib/discord.server";

export async function action({ request, context }: Route.ActionArgs) {
  try {
    const discordService = new DiscordService(context);
    const body = await request.json();

    // Handle prefix commands
    if (body.content && typeof body.content === "string") {
      const response = await discordService.handlePrefixCommand(body);
      if (response) {
        return Response.json(response);
      }
    }

    return Response.json({ message: "No action taken" });
  } catch (error) {
    console.error("Discord message error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Only allow POST requests
export async function loader() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}