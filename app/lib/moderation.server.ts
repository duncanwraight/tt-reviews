import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApprovalSource,
  RejectionCategory,
  ModeratorApproval,
} from "./types";
import { deleteImageFromR2Native } from "./r2-native.server";

export interface ApprovalResult {
  success: boolean;
  newStatus?: string;
  error?: string;
}

export interface RejectionData {
  category: RejectionCategory;
  reason: string;
}

export class ModerationService {
  constructor(private supabase: SupabaseClient) {}

  async recordApproval(
    submissionType: "equipment" | "player" | "player_edit" | "equipment_review",
    submissionId: string,
    moderatorId: string,
    source: ApprovalSource,
    notes?: string
  ): Promise<ApprovalResult> {
    try {
      // Check if this moderator has already approved this submission
      const { data: existingApproval } = await this.supabase
        .from("moderator_approvals")
        .select("id")
        .eq("submission_type", submissionType)
        .eq("submission_id", submissionId)
        .eq("moderator_id", moderatorId)
        .eq("action", "approved")
        .maybeSingle();

      if (existingApproval) {
        return {
          success: false,
          error: "You have already approved this submission",
        };
      }

      // Record the approval
      const { error } = await this.supabase.from("moderator_approvals").insert({
        submission_type: submissionType,
        submission_id: submissionId,
        moderator_id: moderatorId,
        source,
        action: "approved",
        notes,
      });

      if (error) {
        console.error("Database error in recordApproval:", error);
        console.error("Insert data:", {
          submission_type: submissionType,
          submission_id: submissionId,
          moderator_id: moderatorId,
          source,
          action: "approved",
          notes,
        });
        return {
          success: false,
          error: `Failed to record approval: ${error.message}`,
        };
      }

      // Get updated submission status
      const status = await this.getSubmissionStatus(
        submissionType,
        submissionId
      );

      return { success: true, newStatus: status };
    } catch (error) {
      console.error("Exception in recordApproval:", error);
      return {
        success: false,
        error: `Internal error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  async recordRejection(
    submissionType: "equipment" | "player" | "player_edit" | "equipment_review",
    submissionId: string,
    moderatorId: string,
    source: ApprovalSource,
    rejectionData: RejectionData,
    bucket?: R2Bucket
  ): Promise<ApprovalResult> {
    try {
      // Record the rejection
      const { error } = await this.supabase.from("moderator_approvals").insert({
        submission_type: submissionType,
        submission_id: submissionId,
        moderator_id: moderatorId,
        source,
        action: "rejected",
        rejection_category: rejectionData.category,
        rejection_reason: rejectionData.reason,
      });

      if (error) {
        return { success: false, error: "Failed to record rejection" };
      }

      // Update the submission with rejection details
      const tableName = this.getTableName(submissionType);
      await this.supabase
        .from(tableName)
        .update({
          rejection_category: rejectionData.category,
          rejection_reason: rejectionData.reason,
        })
        .eq("id", submissionId);

      // Delete associated image if it exists
      if (bucket) {
        await this.deleteSubmissionImage(submissionType, submissionId, bucket);
      }

      return { success: true, newStatus: "rejected" };
    } catch (error) {
      return { success: false, error: "Internal error" };
    }
  }

  async getSubmissionApprovals(
    submissionType: "equipment" | "player" | "player_edit",
    submissionId: string
  ): Promise<ModeratorApproval[]> {
    const { data, error } = await this.supabase
      .from("moderator_approvals")
      .select("*")
      .eq("submission_type", submissionType)
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true });

    if (error) {
      return [];
    }

    return data || [];
  }

  async getUserSubmissions(userId: string, limit: number = 20) {
    const [equipmentSubmissions, playerSubmissions, playerEdits] =
      await Promise.all([
        this.supabase
          .from("equipment_submissions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),

        this.supabase
          .from("player_submissions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),

        this.supabase
          .from("player_edits")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

    const allSubmissions = [
      ...(equipmentSubmissions.data || []).map(s => ({
        ...s,
        type: "equipment" as const,
      })),
      ...(playerSubmissions.data || []).map(s => ({
        ...s,
        type: "player" as const,
      })),
      ...(playerEdits.data || []).map(s => ({
        ...s,
        type: "player_edit" as const,
      })),
    ];

    // Sort by creation date and limit
    return allSubmissions
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, limit);
  }

  // Convenience methods for equipment reviews
  async approveEquipmentReview(
    reviewId: string,
    moderatorId: string
  ): Promise<ApprovalResult> {
    return this.recordApproval(
      "equipment_review",
      reviewId,
      moderatorId,
      "admin_ui"
    );
  }

  async rejectEquipmentReview(
    reviewId: string,
    moderatorId: string,
    category: RejectionCategory,
    reason: string,
    r2Bucket?: R2Bucket
  ): Promise<ApprovalResult> {
    return this.recordRejection(
      "equipment_review",
      reviewId,
      moderatorId,
      "admin_ui",
      { category, reason },
      r2Bucket
    );
  }

  private async getSubmissionStatus(
    submissionType: "equipment" | "player" | "player_edit" | "equipment_review",
    submissionId: string
  ): Promise<string> {
    const tableName = this.getTableName(submissionType);
    const { data } = await this.supabase
      .from(tableName)
      .select("status")
      .eq("id", submissionId)
      .single();

    return data?.status || "pending";
  }

  private async deleteSubmissionImage(
    submissionType: "equipment" | "player" | "player_edit" | "equipment_review",
    submissionId: string,
    bucket: R2Bucket
  ): Promise<void> {
    try {
      const tableName = this.getTableName(submissionType);
      const { data: submission } = await this.supabase
        .from(tableName)
        .select("specifications, image_key")
        .eq("id", submissionId)
        .single();

      if (!submission) return;

      // Get image key from submission data
      let imageKey: string | null = null;

      if (
        submissionType === "equipment" &&
        submission.specifications?.image_key
      ) {
        imageKey = submission.specifications.image_key;
      } else if (submission.image_key) {
        imageKey = submission.image_key;
      }

      if (imageKey) {
        await deleteImageFromR2Native(bucket, imageKey);
      }
    } catch (error) {
      // Don't throw - image deletion failure shouldn't block rejection
    }
  }

  private getTableName(
    submissionType: "equipment" | "player" | "player_edit" | "equipment_review"
  ): string {
    switch (submissionType) {
      case "equipment":
        return "equipment_submissions";
      case "player":
        return "player_submissions";
      case "player_edit":
        return "player_edits";
      case "equipment_review":
        return "equipment_reviews";
      default:
        throw new Error(`Unknown submission type: ${submissionType}`);
    }
  }
}

export function createModerationService(
  supabase: SupabaseClient
): ModerationService {
  return new ModerationService(supabase);
}
