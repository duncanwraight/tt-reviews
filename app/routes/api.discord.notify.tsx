import type { Route } from "./+types/api.discord.notify";
import { DiscordService } from "~/lib/discord.server";

export async function action({ request, context }: Route.ActionArgs) {
  try {
    const discordService = new DiscordService(context);
    const { type, data } = await request.json();

    let result;
    switch (type) {
      case "new_review":
        result = await discordService.notifyNewReview(data);
        break;
      case "new_player_edit":
        result = await discordService.notifyNewPlayerEdit(data);
        break;
      case "new_equipment_submission":
        result = await discordService.notifyNewEquipmentSubmission(data);
        break;
      case "review_approved":
        result = await discordService.notifyReviewApproved(data);
        break;
      case "review_rejected":
        result = await discordService.notifyReviewRejected(data);
        break;
      default:
        return Response.json({ error: "Unknown notification type" }, { status: 400 });
    }

    return Response.json({ success: true, result });
  } catch (error) {
    console.error("Discord notification error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Only allow POST requests
export async function loader() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}