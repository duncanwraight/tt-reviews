import type { Route } from "./+types/admin.equipment-edits";
import { data, redirect, Form, useSearchParams } from "react-router";
import { sortPendingByFocus } from "~/lib/admin/queue-focus";
import { createModerationService } from "~/lib/moderation.server";
import { applyEquipmentEdit } from "~/lib/admin/equipment-edit-applier.server";
import { RejectionModal } from "~/components/ui/RejectionModal";
import { useState } from "react";
import type { RejectionCategory } from "~/lib/types";
import { sanitizeAdminContent } from "~/lib/sanitize";
import { formatDate } from "~/lib/date";
import { CheckCircle2, XCircle, Clock, ListChecks, Pencil } from "lucide-react";
import { ImagePlaceholder } from "~/components/ui/ImagePlaceholder";
import { Logger, createLogContext } from "~/lib/logger.server";
import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import {
  loadApprovalsForSubmissions,
  loadPendingQueue,
} from "~/lib/admin/queue.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Equipment Edits | Admin | TT Reviews" },
    {
      name: "description",
      content: "Review and moderate equipment edit submissions.",
    },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface EquipmentEditRow extends Record<string, any> {
  id: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin, csrfToken } = gate;

  const { data: equipmentEdits, error } =
    await loadPendingQueue<EquipmentEditRow>(supabaseAdmin, "equipment_edits", {
      select:
        "*, equipment ( id, name, slug, category, subcategory, image_key, specifications, description )",
    });

  if (error) {
    Logger.error(
      "Error fetching equipment edits",
      createLogContext("admin-equipment-edits", {
        route: "/admin/equipment-edits",
        method: "GET",
        userId: user.id,
      }),
      error instanceof Error ? error : undefined
    );
    return data(
      { equipmentEdits: [], user, csrfToken },
      { headers: sbServerClient.headers }
    );
  }

  if (equipmentEdits && equipmentEdits.length > 0) {
    const approvalsById = await loadApprovalsForSubmissions(
      supabaseAdmin,
      "equipment_edit",
      equipmentEdits.map(e => e.id)
    );
    equipmentEdits.forEach(edit => {
      edit.moderator_approvals = approvalsById[edit.id] || [];
    });
  }

  return data(
    { equipmentEdits: equipmentEdits || [], user, csrfToken },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin: supabase } = gate;

  const formData = await request.formData();
  const editId = formData.get("editId") as string;
  const actionType = formData.get("action") as string;
  const moderatorNotes = (formData.get("notes") as string) || undefined;
  const rejectionCategory = formData.get(
    "category"
  ) as RejectionCategory | null;
  const rawRejectionReason = formData.get("reason") as string | null;

  const rejectionReason = rawRejectionReason
    ? sanitizeAdminContent(rawRejectionReason.trim())
    : null;

  if (!editId || !actionType) {
    return data(
      { error: "Missing required fields" },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  const moderationService = createModerationService(supabase);

  let result;
  if (actionType === "approved") {
    result = await moderationService.recordApproval(
      "equipment_edit",
      editId,
      user.id,
      "admin_ui",
      moderatorNotes
    );

    if (result.success && result.newStatus === "approved") {
      const env = context.cloudflare?.env as
        | { IMAGE_BUCKET?: R2Bucket }
        | undefined;
      const applyResult = await applyEquipmentEdit(
        supabase,
        env?.IMAGE_BUCKET,
        editId
      );

      if (!applyResult.success) {
        Logger.error(
          "Failed to apply equipment edit",
          createLogContext("admin-equipment-edits", {
            route: "/admin/equipment-edits",
            method: request.method,
            userId: user.id,
            editId,
          }),
          new Error(applyResult.error || "unknown apply error")
        );
        return data(
          {
            error: `Approved but failed to apply changes: ${
              applyResult.error || "unknown error"
            }`,
          },
          { status: 500, headers: sbServerClient.headers }
        );
      }
    }
  } else if (actionType === "rejected") {
    if (!rejectionCategory || !rejectionReason) {
      return data(
        { error: "Rejection requires category and reason" },
        { status: 400, headers: sbServerClient.headers }
      );
    }

    result = await moderationService.recordRejection(
      "equipment_edit",
      editId,
      user.id,
      "admin_ui",
      { category: rejectionCategory, reason: rejectionReason },
      (context.cloudflare?.env as { IMAGE_BUCKET?: R2Bucket } | undefined)
        ?.IMAGE_BUCKET
    );
  } else {
    return data(
      { error: "Invalid action" },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  if (!result.success) {
    return data(
      { error: result.error || "Operation failed" },
      { status: 500, headers: sbServerClient.headers }
    );
  }

  return redirect("/admin/equipment-edits", {
    headers: sbServerClient.headers,
  });
}

export default function AdminEquipmentEdits({
  loaderData,
}: Route.ComponentProps) {
  const { equipmentEdits, user, csrfToken } = loaderData;
  const [rejectionModal, setRejectionModal] = useState<{
    isOpen: boolean;
    submissionId: string;
    submissionName: string;
  }>({ isOpen: false, submissionId: "", submissionName: "" });

  const [searchParams] = useSearchParams();
  const pendingEdits = sortPendingByFocus(
    equipmentEdits.filter(
      e => e.status === "pending" || e.status === "awaiting_second_approval"
    ),
    searchParams
  );
  const processedEdits = equipmentEdits.filter(
    e => e.status === "approved" || e.status === "rejected"
  );

  const getStatusBadge = (status: string, approvalCount?: number) => {
    const baseClasses =
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    switch (status) {
      case "pending": {
        const pendingText = approvalCount
          ? `${approvalCount}/2 approvals`
          : "pending";
        return {
          classes: `${baseClasses} bg-yellow-100 text-yellow-800`,
          text: pendingText,
        };
      }
      case "awaiting_second_approval":
        return {
          classes: `${baseClasses} bg-blue-100 text-blue-800`,
          text: "1/2 approvals",
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getApprovalCount = (edit: any) => {
    if (!edit.moderator_approvals) return 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return edit.moderator_approvals.filter((a: any) => a.action === "approved")
      .length;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canApprove = (edit: any) => {
    if (edit.status === "approved" || edit.status === "rejected") return false;
    const approvals = edit.moderator_approvals || [];
    const userApproval = approvals.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => a.moderator_id === user.id && a.action === "approved"
    );
    return !userApproval;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canReject = (edit: any) =>
    edit.status !== "approved" && edit.status !== "rejected";

  // Render a single field-level diff. value === null means the
  // submitter cleared the field on the form (translated to "Removed"
  // in the UI). Specs object → recurse.
  const renderValue = (value: unknown): string => {
    if (value === null) return "(removed)";
    if (typeof value === "object" && value !== null) {
      if ("min" in value && "max" in value) {
        const r = value as { min: unknown; max: unknown };
        return r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;
      }
      return JSON.stringify(value);
    }
    return String(value);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderDiffList = (edit: any) => {
    const editData = edit.edit_data || {};
    const current = edit.equipment || {};
    const rows: Array<{ label: string; from: string; to: string }> = [];

    for (const field of [
      "name",
      "category",
      "subcategory",
      "description",
    ] as const) {
      if (field in editData) {
        rows.push({
          label: field.replace(/_/g, " "),
          from: renderValue(current[field]),
          to: renderValue(editData[field]),
        });
      }
    }

    if (editData.specifications) {
      const currentSpecs = (current.specifications || {}) as Record<
        string,
        unknown
      >;
      for (const [key, value] of Object.entries(
        editData.specifications as Record<string, unknown>
      )) {
        rows.push({
          label: `spec: ${key}`,
          from: renderValue(currentSpecs[key]),
          to: renderValue(value),
        });
      }
    }

    if (editData.image_action === "replace") {
      rows.push({
        label: "image",
        from: current.image_key ? "current" : "(none)",
        to: editData.image_pending_key ? "pending upload" : "(missing)",
      });
    }

    return rows;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderEditItem = (edit: any) => {
    const equipment = edit.equipment || {};
    const diffs = renderDiffList(edit);
    const equipmentLabel = equipment.name || "Unknown equipment";

    return (
      <li key={edit.id}>
        <div className="px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {equipment.image_key ? (
                <img
                  src={`/api/images/${equipment.image_key}`}
                  alt={equipmentLabel}
                  className="w-16 h-16 object-cover rounded-md mr-3 border border-gray-200"
                />
              ) : (
                <ImagePlaceholder
                  kind="equipment"
                  className="w-16 h-16 rounded-md mr-3 border border-gray-200"
                />
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Edit for {equipmentLabel}
                </p>
                <p className="text-sm text-gray-500">
                  {diffs.length} change{diffs.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {(() => {
                const badge = getStatusBadge(
                  edit.status,
                  getApprovalCount(edit)
                );
                return <span className={badge.classes}>{badge.text}</span>;
              })()}
              <div className="text-sm text-gray-500">
                {formatDate(edit.created_at)}
              </div>
            </div>
          </div>

          {diffs.length > 0 && (
            <div className="mt-3 bg-gray-50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Proposed Changes:
              </h4>
              <ul className="space-y-1">
                {diffs.map(row => (
                  <li key={row.label} className="text-sm">
                    <span className="font-medium text-gray-700 capitalize">
                      {row.label}:
                    </span>
                    <span className="ml-2 text-gray-500 line-through">
                      {row.from}
                    </span>
                    <span className="ml-2 text-gray-900">→ {row.to}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {edit.edit_data?.edit_reason && (
            <div className="mt-2 text-sm">
              <strong className="text-gray-700">Reason:</strong>
              <p className="text-gray-600 mt-1">{edit.edit_data.edit_reason}</p>
            </div>
          )}

          {edit.moderator_notes && (
            <div className="mt-2 text-sm">
              <strong className="text-gray-700">Moderator Notes:</strong>
              <p className="text-gray-600 mt-1">{edit.moderator_notes}</p>
            </div>
          )}

          {edit.status === "rejected" &&
            (edit.rejection_reason || edit.rejection_category) && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                <h5 className="text-sm font-medium text-red-800">
                  Rejected
                  {edit.rejection_category && (
                    <span className="ml-2 text-xs font-normal">
                      ({edit.rejection_category.replace(/_/g, " ")})
                    </span>
                  )}
                </h5>
                {edit.rejection_reason && (
                  <p className="text-sm text-red-700 mt-1">
                    {edit.rejection_reason}
                  </p>
                )}
              </div>
            )}

          {(edit.status === "pending" ||
            edit.status === "awaiting_second_approval") && (
            <div className="mt-3 flex items-center space-x-3">
              {canApprove(edit) && (
                <Form method="post" className="inline">
                  <input type="hidden" name="_csrf" value={csrfToken} />
                  <input type="hidden" name="editId" value={edit.id} />
                  <input type="hidden" name="action" value="approved" />
                  <button
                    type="submit"
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    Approve
                  </button>
                </Form>
              )}
              {canReject(edit) && (
                <button
                  type="button"
                  onClick={() =>
                    setRejectionModal({
                      isOpen: true,
                      submissionId: edit.id,
                      submissionName: `Edit for ${equipmentLabel}`,
                    })
                  }
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Reject
                </button>
              )}
              {equipment.slug && (
                <a
                  href={`/equipment/${equipment.slug}`}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  View Equipment
                </a>
              )}
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <Clock className="size-6 text-yellow-600" aria-hidden />
            <div className="ml-3">
              <p className="text-sm font-medium text-yellow-800">
                Pending Review
              </p>
              <p className="text-2xl font-bold text-yellow-900">
                {pendingEdits.length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircle2 className="size-6 text-green-600" aria-hidden />
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">Approved</p>
              <p className="text-2xl font-bold text-green-900">
                {processedEdits.filter(e => e.status === "approved").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <XCircle className="size-6 text-red-600" aria-hidden />
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">Rejected</p>
              <p className="text-2xl font-bold text-red-900">
                {processedEdits.filter(e => e.status === "rejected").length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Equipment Edits</h2>
        <div className="text-sm text-gray-600">
          {equipmentEdits.length} total edits
        </div>
      </div>

      {equipmentEdits.length === 0 ? (
        <div className="text-center py-12">
          <Pencil
            className="size-16 text-gray-300 mx-auto mb-4"
            aria-hidden
            strokeWidth={1.5}
          />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No edits found
          </h3>
          <p className="text-gray-600">
            No equipment edits to review at this time.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {pendingEdits.length > 0 && (
            <div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="size-5 text-yellow-600" aria-hidden />
                  Pending Review ({pendingEdits.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Edits that need moderator approval
                </p>
              </div>
              <div className="bg-white shadow overflow-hidden rounded-md border-l-4 border-yellow-400">
                <ul className="divide-y divide-gray-200">
                  {pendingEdits.map(renderEditItem)}
                </ul>
              </div>
            </div>
          )}

          {processedEdits.length > 0 && (
            <div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <ListChecks className="size-5 text-gray-600" aria-hidden />
                  Recently Processed ({processedEdits.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Edits that have been approved or rejected
                </p>
              </div>
              <div className="bg-white shadow overflow-hidden rounded-md">
                <ul className="divide-y divide-gray-200">
                  {processedEdits.map(renderEditItem)}
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
        submissionType="equipment_edit"
        submissionName={rejectionModal.submissionName}
        csrfToken={csrfToken}
      />
    </div>
  );
}
