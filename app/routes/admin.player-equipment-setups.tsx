import type { Route } from "./+types/admin.player-equipment-setups";
import { data, redirect, Form } from "react-router";
import { createSupabaseAdminClient } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { useState } from "react";

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

  // Get all unverified player equipment setups with related data
  const { data: equipmentSetups, error } = await supabase
    .from("player_equipment_setups")
    .select(
      `
      *,
      players (
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
    .eq("verified", false)
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
  const action = formData.get("action") as string;
  const setupId = formData.get("setupId") as string;

  if (!setupId) {
    return data(
      { error: "Setup ID is required" },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  const supabase = createSupabaseAdminClient(context);

  if (action === "approve") {
    // Approve the equipment setup
    const { error } = await supabase
      .from("player_equipment_setups")
      .update({ verified: true })
      .eq("id", setupId);

    if (error) {
      console.error("Error approving equipment setup:", error);
      return data(
        { error: "Failed to approve equipment setup" },
        { status: 500, headers: sbServerClient.headers }
      );
    }

    return data(
      { success: "Equipment setup approved successfully" },
      { headers: sbServerClient.headers }
    );
  } else if (action === "reject") {
    // Delete the equipment setup
    const { error } = await supabase
      .from("player_equipment_setups")
      .delete()
      .eq("id", setupId);

    if (error) {
      console.error("Error rejecting equipment setup:", error);
      return data(
        { error: "Failed to reject equipment setup" },
        { status: 500, headers: sbServerClient.headers }
      );
    }

    return data(
      { success: "Equipment setup rejected and removed" },
      { headers: sbServerClient.headers }
    );
  }

  return data(
    { error: "Invalid action" },
    { status: 400, headers: sbServerClient.headers }
  );
}

export default function AdminPlayerEquipmentSetups({
  loaderData,
}: Route.ComponentProps) {
  const { equipmentSetups, user, csrfToken } = loaderData;
  const [processingSetup, setProcessingSetup] = useState<string | null>(null);

  const handleAction = (setupId: string) => {
    setProcessingSetup(setupId);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Player Equipment Setups
        </h1>
        <p className="mt-2 text-gray-600">
          Review and moderate player equipment setup submissions.
        </p>
      </div>

      {equipmentSetups.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No equipment setups to review
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            All player equipment setups have been processed.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {equipmentSetups.map(setup => (
            <div key={setup.id} className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {setup.players?.name || "Unknown Player"} - {setup.year}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Submitted on{" "}
                      {new Date(setup.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex space-x-3">
                    <Form method="post" className="inline">
                      <input type="hidden" name="csrfToken" value={csrfToken} />
                      <input type="hidden" name="setupId" value={setup.id} />
                      <input type="hidden" name="action" value="approve" />
                      <button
                        type="submit"
                        disabled={processingSetup === setup.id}
                        onClick={() => handleAction(setup.id)}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                      >
                        ✓ Approve
                      </button>
                    </Form>
                    <Form method="post" className="inline">
                      <input type="hidden" name="csrfToken" value={csrfToken} />
                      <input type="hidden" name="setupId" value={setup.id} />
                      <input type="hidden" name="action" value="reject" />
                      <button
                        type="submit"
                        disabled={processingSetup === setup.id}
                        onClick={() => handleAction(setup.id)}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                      >
                        ✗ Reject
                      </button>
                    </Form>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Blade */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      Blade
                    </h4>
                    <div className="bg-gray-50 p-3 rounded-md">
                      {setup.blade ? (
                        <p className="text-sm">
                          {setup.blade.manufacturer} {setup.blade.name}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">No blade specified</p>
                      )}
                    </div>
                  </div>

                  {/* Forehand Rubber */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      Forehand Rubber
                    </h4>
                    <div className="bg-gray-50 p-3 rounded-md">
                      {setup.forehand_rubber ? (
                        <div className="text-sm">
                          <p>
                            {setup.forehand_rubber.manufacturer}{" "}
                            {setup.forehand_rubber.name}
                          </p>
                          {setup.forehand_thickness && (
                            <p className="text-gray-600">
                              Thickness: {setup.forehand_thickness}
                            </p>
                          )}
                          {setup.forehand_color && (
                            <p className="text-gray-600">
                              Color: {setup.forehand_color}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">
                          No forehand rubber specified
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Backhand Rubber */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      Backhand Rubber
                    </h4>
                    <div className="bg-gray-50 p-3 rounded-md">
                      {setup.backhand_rubber ? (
                        <div className="text-sm">
                          <p>
                            {setup.backhand_rubber.manufacturer}{" "}
                            {setup.backhand_rubber.name}
                          </p>
                          {setup.backhand_thickness && (
                            <p className="text-gray-600">
                              Thickness: {setup.backhand_thickness}
                            </p>
                          )}
                          {setup.backhand_color && (
                            <p className="text-gray-600">
                              Color: {setup.backhand_color}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">
                          No backhand rubber specified
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Source Information */}
                {(setup.source_url || setup.source_type) && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      Source Information
                    </h4>
                    <div className="text-sm text-gray-600">
                      {setup.source_type && (
                        <p>Type: {setup.source_type.replace("_", " ")}</p>
                      )}
                      {setup.source_url && (
                        <p>
                          URL:{" "}
                          <a
                            href={setup.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {setup.source_url}
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}