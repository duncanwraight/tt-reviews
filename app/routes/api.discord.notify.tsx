import type { Route } from "./+types/api.discord.notify";
import { DiscordService } from "~/lib/discord.server";

export async function action({ request, context }: Route.ActionArgs) {
  const requestId = request.headers.get("x-correlation-id") || crypto.randomUUID();
  
  try {
    console.log(`[DISCORD API] Received notification request: ${requestId}`);
    
    const discordService = new DiscordService(context);
    const { type, data } = await request.json();

    console.log(`[DISCORD API] Notification type: ${type}, Request ID: ${requestId}`);
    console.log(`[DISCORD API] Notification data:`, JSON.stringify(data, null, 2));

    let result;
    switch (type) {
      case "new_review":
        console.log(`[DISCORD API] Processing new_review notification: ${requestId}`);
        result = await discordService.notifyNewReview(data, requestId);
        break;
      case "new_player_edit":
        console.log(`[DISCORD API] Processing new_player_edit notification: ${requestId}`);
        result = await discordService.notifyNewPlayerEdit(data, requestId);
        break;
      case "new_equipment_submission":
        console.log(`[DISCORD API] Processing new_equipment_submission notification: ${requestId}`);
        result = await discordService.notifyNewEquipmentSubmission(data, requestId);
        break;
      case "new_player_submission":
        console.log(`[DISCORD API] Processing new_player_submission notification: ${requestId}`);
        result = await discordService.notifyNewPlayerSubmission(data, requestId);
        break;
      case "review_approved":
        console.log(`[DISCORD API] Processing review_approved notification: ${requestId}`);
        result = await discordService.notifyReviewApproved(data);
        break;
      case "review_rejected":
        console.log(`[DISCORD API] Processing review_rejected notification: ${requestId}`);
        result = await discordService.notifyReviewRejected(data);
        break;
      default:
        console.error(`[DISCORD API] Unknown notification type: ${type}, Request ID: ${requestId}`);
        return Response.json(
          { error: "Unknown notification type", requestId },
          { status: 400 }
        );
    }

    console.log(`[DISCORD API] Notification successful: ${requestId}`, JSON.stringify(result, null, 2));
    return Response.json({ success: true, result, requestId });
  } catch (error) {
    console.error(`[DISCORD API] Discord notification error: ${requestId}`, error);
    console.error(
      `[DISCORD API] Error stack: ${requestId}`,
      error instanceof Error ? error.stack : "No stack trace"
    );
    console.error(`[DISCORD API] Error details: ${requestId}`, {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : "Unknown error",
      requestId,
    });
    return Response.json(
      { 
        error: "Internal server error", 
        requestId,
        details: error instanceof Error ? error.message : String(error)
      }, 
      { status: 500 }
    );
  }
}

// Only allow POST requests
export async function loader() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
