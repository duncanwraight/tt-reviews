import type { Route } from "./+types/admin.player-equipment-setups";
import { data, redirect, Form } from "react-router";
import { createSupabaseAdminClient } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { RejectionModal } from "~/components/ui/RejectionModal";
import { useState } from "react";
import type { RejectionCategory } from "~/lib/types";
import { sanitizeAdminContent } from "~/lib/sanitize";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Player Equipment Setups | Admin | TT Reviews" },
    {
      name: "description",
      content: "Review and moderate player equipment setup submissions.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  // Check admin access
  if (!user || user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  const supabase = createSupabaseAdminClient(context);

  // Get all player equipment setup submissions with related data
  const { data: equipmentSetups, error } = await supabase
    .from("player_equipment_setup_submissions")
    .select(
      `
      *,
      players:player_id (
        id,
        name,
        slug
      ),
      blade:blade_id (
        id,
        name,
        manufacturer
      ),
      forehand_rubber:forehand_rubber_id (
        id,
        name,
        manufacturer
      ),
      backhand_rubber:backhand_rubber_id (
        id,
        name,
        manufacturer
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching player equipment setups:", error);
    return data(
      { equipmentSetups: [], user, csrfToken: "" },
      { headers: sbServerClient.headers }
    );
  }

  // Generate CSRF token for admin actions
  const { generateCSRFToken, getSessionId } = await import("~/lib/csrf.server");
  const sessionId = getSessionId(request) || "anonymous";
  const csrfToken = generateCSRFToken(sessionId, user.id);

  return data(
    { equipmentSetups: equipmentSetups || [], user, csrfToken },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  // Import security functions inside server-only action
  const { validateCSRF, createCSRFFailureResponse } = await import(
    "~/lib/security.server"
  );

  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  // Check admin access
  if (!user || user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  // Validate CSRF token
  const csrfValidation = await validateCSRF(request, user.id);
  if (!csrfValidation.valid) {
    return createCSRFFailureResponse(csrfValidation.error);
  }

  const formData = await request.formData();
  const actionType = formData.get("action") as string;
  const setupId = formData.get("setupId") as string;
  const rejectionCategory = formData.get("category") as RejectionCategory | null;
  const rawRejectionReason = formData.get("reason") as string | null;

  // Sanitize rejection reason to prevent XSS attacks
  const rejectionReason = rawRejectionReason
    ? sanitizeAdminContent(rawRejectionReason.trim())
    : null;

  if (!setupId) {
    return data(
      { error: "Setup ID is required" },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  const supabase = createSupabaseAdminClient(context);

  if (actionType === "approved") {
    // First, fetch the submission data
    const { data: submission, error: fetchError } = await supabase
      .from("player_equipment_setup_submissions")
      .select("*")
      .eq("id", setupId)
      .single();

    if (fetchError || !submission) {
      console.error("Error fetching equipment setup:", fetchError);
      return data(
        { error: "Failed to fetch equipment setup" },
        { status: 500, headers: sbServerClient.headers }
      );
    }

    // Map forehand_side/backhand_side to colors
    // In the form: "forehand" radio = red, "backhand" radio = black
    const mapSideToColor = (side: string | null): "red" | "black" | null => {
      if (side === "forehand") return "red";
      if (side === "backhand") return "black";
      return null;
    };

    // Create the actual player equipment setup record
    const { error: insertError } = await supabase
      .from("player_equipment_setups")
      .insert({
        player_id: submission.player_id,
        year: submission.year,
        blade_id: submission.blade_id,
        forehand_rubber_id: submission.forehand_rubber_id,
        forehand_thickness: submission.forehand_thickness,
        forehand_color: mapSideToColor(submission.forehand_side),
        backhand_rubber_id: submission.backhand_rubber_id,
        backhand_thickness: submission.backhand_thickness,
        backhand_color: mapSideToColor(submission.backhand_side),
        source_url: submission.source_url,
        source_type: submission.source_type,
        verified: true,
      });

    if (insertError) {
      console.error("Error creating equipment setup:", insertError);
      return data(
        { error: "Failed to create equipment setup record" },
        { status: 500, headers: sbServerClient.headers }
      );
    }

    // Update the submission status to approved
    const { error: updateError } = await supabase
      .from("player_equipment_setup_submissions")
      .update({ status: "approved", moderator_id: user.id })
      .eq("id", setupId);

    if (updateError) {
      console.error("Error approving equipment setup:", updateError);
      return data(
        { error: "Failed to approve equipment setup" },
        { status: 500, headers: sbServerClient.headers }
      );
    }

    // Redirect to refresh the page
    return redirect("/admin/player-equipment-setups", {
      headers: sbServerClient.headers,
    });
  } else if (actionType === "rejected") {
    if (!rejectionCategory || !rejectionReason) {
      return data(
        { error: "Rejection requires category and reason" },
        { status: 400, headers: sbServerClient.headers }
      );
    }

    // Reject the equipment setup submission - update status with rejection details
    const { error } = await supabase
      .from("player_equipment_setup_submissions")
      .update({
        status: "rejected",
        moderator_id: user.id,
        rejection_category: rejectionCategory,
        rejection_reason: rejectionReason,
      })
      .eq("id", setupId);

    if (error) {
      console.error("Error rejecting equipment setup:", error);
      return data(
        { error: "Failed to reject equipment setup" },
        { status: 500, headers: sbServerClient.headers }
      );
    }

    // Redirect to refresh the page
    return redirect("/admin/player-equipment-setups", {
      headers: sbServerClient.headers,
    });
  }

  return data(
    { error: "Invalid action" },
    { status: 400, headers: sbServerClient.headers }
  );
}

export default function AdminPlayerEquipmentSetups({
  loaderData,
}: Route.ComponentProps) {
  const { equipmentSetups, csrfToken } = loaderData;
  const [rejectionModal, setRejectionModal] = useState<{
    isOpen: boolean;
    submissionId: string;
    submissionName: string;
  }>({ isOpen: false, submissionId: "", submissionName: "" });

  // Group submissions by status
  const pendingSubmissions = equipmentSetups.filter(
    (s: any) => s.status === "pending" || s.status === "awaiting_second_approval"
  );
  const processedSubmissions = equipmentSetups.filter(
    (s: any) => s.status === "approved" || s.status === "rejected"
  );

  const getStatusBadge = (status: string) => {
    const baseClasses =
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    switch (status) {
      case "pending":
        return {
          classes: `${baseClasses} bg-yellow-100 text-yellow-800`,
          text: "pending",
        };
      case "awaiting_second_approval":
        return {
          classes: `${baseClasses} bg-blue-100 text-blue-800`,
          text: "awaiting approval",
        };
      case "approved":
        return {
          classes: `${baseClasses} bg-green-100 text-green-800`,
          text: "approved",
        };
      case "rejected":
        return {
          classes: `${baseClasses} bg-red-100 text-red-800`,
          text: "rejected",
        };
      default:
        return {
          classes: `${baseClasses} bg-gray-100 text-gray-800`,
          text: status,
        };
    }
  };

  const renderSetupItem = (setup: any) => {
    const playerName = setup.players?.name || "Unknown Player";
    const submissionName = `${playerName} - ${setup.year}`;

    return (
      <li key={setup.id}>
        <div className="px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-2xl mr-3">🏓</span>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {playerName} - {setup.year}
                </p>
                <p className="text-sm text-gray-500">
                  Submitted on {new Date(setup.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {(() => {
                const badge = getStatusBadge(setup.status);
                return <span className={badge.classes}>{badge.text}</span>;
              })()}
            </div>
          </div>

          {/* Equipment Details */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Blade */}
            <div className="bg-gray-50 p-3 rounded-md">
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">
                Blade
              </h4>
              {setup.blade ? (
                <p className="text-sm text-gray-900">
                  {setup.blade.manufacturer} {setup.blade.name}
                </p>
              ) : (
                <p className="text-sm text-gray-400">Not specified</p>
              )}
            </div>

            {/* Forehand Rubber */}
            <div className="bg-gray-50 p-3 rounded-md">
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">
                Forehand Rubber
              </h4>
              {setup.forehand_rubber ? (
                <div className="text-sm text-gray-900">
                  <p>
                    {setup.forehand_rubber.manufacturer}{" "}
                    {setup.forehand_rubber.name}
                  </p>
                  {setup.forehand_thickness && (
                    <p className="text-gray-500 text-xs">
                      {setup.forehand_thickness}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Not specified</p>
              )}
            </div>

            {/* Backhand Rubber */}
            <div className="bg-gray-50 p-3 rounded-md">
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">
                Backhand Rubber
              </h4>
              {setup.backhand_rubber ? (
                <div className="text-sm text-gray-900">
                  <p>
                    {setup.backhand_rubber.manufacturer}{" "}
                    {setup.backhand_rubber.name}
                  </p>
                  {setup.backhand_thickness && (
                    <p className="text-gray-500 text-xs">
                      {setup.backhand_thickness}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Not specified</p>
              )}
            </div>
          </div>

          {/* Source Information */}
          {(setup.source_url || setup.source_type) && (
            <div className="mt-3 text-sm text-gray-600">
              <strong>Source:</strong>{" "}
              {setup.source_type && (
                <span className="capitalize">
                  {setup.source_type.replace(/_/g, " ")}
                </span>
              )}
              {setup.source_url && (
                <>
                  {" - "}
                  <a
                    href={setup.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    View Source
                  </a>
                </>
              )}
            </div>
          )}

          {/* Show rejection details for rejected submissions */}
          {setup.status === "rejected" &&
            (setup.rejection_reason || setup.rejection_category) && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h5 className="text-sm font-medium text-red-800">
                      Rejected
                      {setup.rejection_category && (
                        <span className="ml-2 text-xs font-normal">
                          ({setup.rejection_category.replace(/_/g, " ")})
                        </span>
                      )}
                    </h5>
                    {setup.rejection_reason && (
                      <p className="text-sm text-red-700 mt-1">
                        {setup.rejection_reason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* Action buttons only for pending submissions */}
          {(setup.status === "pending" ||
            setup.status === "awaiting_second_approval") && (
            <div className="mt-3 flex items-center space-x-3">
              <Form method="post" className="inline">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <input type="hidden" name="setupId" value={setup.id} />
                <input type="hidden" name="action" value="approved" />
                <button
                  type="submit"
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Approve
                </button>
              </Form>
              <button
                onClick={() =>
                  setRejectionModal({
                    isOpen: true,
                    submissionId: setup.id,
                    submissionName: submissionName,
                  })
                }
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl">⏳</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-yellow-800">
                Pending Review
              </p>
              <p className="text-2xl font-bold text-yellow-900">
                {pendingSubmissions.length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl">✅</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">Approved</p>
              <p className="text-2xl font-bold text-green-900">
                {processedSubmissions.filter((s: any) => s.status === "approved").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl">❌</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">Rejected</p>
              <p className="text-2xl font-bold text-red-900">
                {processedSubmissions.filter((s: any) => s.status === "rejected").length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Player Equipment Setups
        </h2>
        <div className="text-sm text-gray-600">
          {equipmentSetups.length} total submissions
        </div>
      </div>

      {equipmentSetups.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🏓</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No submissions found
          </h3>
          <p className="text-gray-600">
            No player equipment setup submissions to review at this time.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Submissions Section */}
          {pendingSubmissions.length > 0 && (
            <div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <span className="text-2xl mr-2">⏳</span>
                  Pending Review ({pendingSubmissions.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Submissions that need moderator approval
                </p>
              </div>
              <div className="bg-white shadow overflow-hidden rounded-md border-l-4 border-yellow-400">
                <ul className="divide-y divide-gray-200">
                  {pendingSubmissions.map(renderSetupItem)}
                </ul>
              </div>
            </div>
          )}

          {/* Processed Submissions Section */}
          {processedSubmissions.length > 0 && (
            <div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <span className="text-2xl mr-2">📋</span>
                  Recently Processed ({processedSubmissions.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Submissions that have been approved or rejected
                </p>
              </div>
              <div className="bg-white shadow overflow-hidden rounded-md">
                <ul className="divide-y divide-gray-200">
                  {processedSubmissions.map(renderSetupItem)}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <RejectionModal
        isOpen={rejectionModal.isOpen}
        onClose={() =>
          setRejectionModal({
            isOpen: false,
            submissionId: "",
            submissionName: "",
          })
        }
        submissionId={rejectionModal.submissionId}
        submissionType="player_equipment_setup"
        submissionName={rejectionModal.submissionName}
        csrfToken={csrfToken}
        fieldName="setupId"
      />
    </div>
  );
}
