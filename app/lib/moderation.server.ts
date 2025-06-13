import type { AppLoadContext } from "react-router";
import { createSupabaseClient } from "./database.server";
import type { EquipmentSubmission, PlayerEdit, EquipmentReview } from "./database.server";

interface ModerationResult {
  success: boolean;
  status: "first_approval" | "fully_approved" | "already_approved" | "error";
  message: string;
}

export class ModerationService {
  private context: AppLoadContext;

  constructor(context: AppLoadContext) {
    this.context = context;
  }

  /**
   * Approve equipment submission
   */
  async approveEquipmentSubmission(
    submissionId: string,
    moderatorId: string
  ): Promise<ModerationResult> {
    try {
      const supabase = createSupabaseClient(this.context);

      // Get the submission first to check if it exists and is pending
      const { data: submission, error: fetchError } = await supabase
        .from("equipment_submissions")
        .select("*")
        .eq("id", submissionId)
        .single();

      if (fetchError || !submission) {
        return {
          success: false,
          status: "error",
          message: "Equipment submission not found",
        };
      }

      if (submission.status !== "pending") {
        return {
          success: false,
          status: "already_approved",
          message: "Equipment submission has already been processed",
        };
      }

      // Update the submission status
      const { error: updateError } = await supabase
        .from("equipment_submissions")
        .update({
          status: "approved",
          moderator_id: moderatorId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId);

      if (updateError) {
        console.error("Error approving equipment submission:", updateError);
        return {
          success: false,
          status: "error",
          message: "Failed to approve equipment submission",
        };
      }

      return {
        success: true,
        status: "fully_approved",
        message: "Equipment submission approved successfully!",
      };
    } catch (error) {
      console.error("Error in approveEquipmentSubmission:", error);
      return {
        success: false,
        status: "error",
        message: "Internal error approving equipment submission",
      };
    }
  }

  /**
   * Reject equipment submission
   */
  async rejectEquipmentSubmission(
    submissionId: string,
    moderatorId: string
  ): Promise<boolean> {
    try {
      const supabase = createSupabaseClient(this.context);

      // Get the submission first to check if it exists and is pending
      const { data: submission, error: fetchError } = await supabase
        .from("equipment_submissions")
        .select("*")
        .eq("id", submissionId)
        .single();

      if (fetchError || !submission) {
        return false;
      }

      if (submission.status !== "pending") {
        return false;
      }

      // Update the submission status
      const { error: updateError } = await supabase
        .from("equipment_submissions")
        .update({
          status: "rejected",
          moderator_id: moderatorId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId);

      return !updateError;
    } catch (error) {
      console.error("Error in rejectEquipmentSubmission:", error);
      return false;
    }
  }

  /**
   * Approve player edit
   */
  async approvePlayerEdit(
    editId: string,
    moderatorId: string
  ): Promise<ModerationResult> {
    try {
      const supabase = createSupabaseClient(this.context);

      // Get the player edit first to check if it exists and is pending
      const { data: playerEdit, error: fetchError } = await supabase
        .from("player_edits")
        .select("*")
        .eq("id", editId)
        .single();

      if (fetchError || !playerEdit) {
        return {
          success: false,
          status: "error",
          message: "Player edit not found",
        };
      }

      if (playerEdit.status !== "pending") {
        return {
          success: false,
          status: "already_approved",
          message: "Player edit has already been processed",
        };
      }

      // Update the player edit status
      const { error: updateError } = await supabase
        .from("player_edits")
        .update({
          status: "approved",
          moderator_id: moderatorId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editId);

      if (updateError) {
        console.error("Error approving player edit:", updateError);
        return {
          success: false,
          status: "error",
          message: "Failed to approve player edit",
        };
      }

      // TODO: Apply the changes to the actual player record
      // This would involve updating the players table with the edit_data
      // For now, we'll just mark the edit as approved

      return {
        success: true,
        status: "fully_approved",
        message: "Player edit approved successfully!",
      };
    } catch (error) {
      console.error("Error in approvePlayerEdit:", error);
      return {
        success: false,
        status: "error",
        message: "Internal error approving player edit",
      };
    }
  }

  /**
   * Reject player edit
   */
  async rejectPlayerEdit(editId: string, moderatorId: string): Promise<boolean> {
    try {
      const supabase = createSupabaseClient(this.context);

      // Get the player edit first to check if it exists and is pending
      const { data: playerEdit, error: fetchError } = await supabase
        .from("player_edits")
        .select("*")
        .eq("id", editId)
        .single();

      if (fetchError || !playerEdit) {
        return false;
      }

      if (playerEdit.status !== "pending") {
        return false;
      }

      // Update the player edit status
      const { error: updateError } = await supabase
        .from("player_edits")
        .update({
          status: "rejected",
          moderator_id: moderatorId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editId);

      return !updateError;
    } catch (error) {
      console.error("Error in rejectPlayerEdit:", error);
      return false;
    }
  }

  /**
   * Approve review (placeholder - reviews not yet implemented)
   */
  async approveReview(
    reviewId: string,
    moderatorId: string
  ): Promise<ModerationResult> {
    // TODO: Implement when review system is added
    return {
      success: false,
      status: "error",
      message: "Review moderation not yet implemented",
    };
  }

  /**
   * Reject review (placeholder - reviews not yet implemented)
   */
  async rejectReview(reviewId: string, moderatorId: string): Promise<boolean> {
    // TODO: Implement when review system is added
    return false;
  }
}