import type { Route } from "./+types/api.discord.notify";
import { DiscordService } from "~/lib/discord.server";

export async function action({ request, context }: Route.ActionArgs) {
  console.log("Discord API route called");
  
  try {
    console.log("Creating DiscordService...");
    const discordService = new DiscordService(context);
    console.log("DiscordService created successfully");
    
    console.log("Parsing request JSON...");
    const { type, data } = await request.json();
    console.log("Request parsed - type:", type, "data:", data);

    let result;
    console.log("Processing notification type:", type);
    switch (type) {
      case "new_review":
        console.log("Calling notifyNewReview...");
        result = await discordService.notifyNewReview(data);
        break;
      case "new_player_edit":
        console.log("Calling notifyNewPlayerEdit...");
        result = await discordService.notifyNewPlayerEdit(data);
        break;
      case "new_equipment_submission":
        console.log("Calling notifyNewEquipmentSubmission...");
        result = await discordService.notifyNewEquipmentSubmission(data);
        break;
      case "review_approved":
        console.log("Calling notifyReviewApproved...");
        result = await discordService.notifyReviewApproved(data);
        break;
      case "review_rejected":
        console.log("Calling notifyReviewRejected...");
        result = await discordService.notifyReviewRejected(data);
        break;
      default:
        console.error("Unknown notification type:", type);
        return Response.json({ error: "Unknown notification type" }, { status: 400 });
    }

    console.log("Discord service call completed, result:", result);
    return Response.json({ success: true, result });
  } catch (error) {
    console.error("Discord notification error:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Only allow POST requests
export async function loader() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}