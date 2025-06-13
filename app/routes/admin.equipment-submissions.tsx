import type { Route } from "./+types/admin.equipment-submissions";
import { data, redirect, Form } from "react-router";
import { createSupabaseAdminClient } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Equipment Submissions | Admin | TT Reviews" },
    {
      name: "description",
      content: "Review and moderate equipment submissions.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient);

  // Check admin access
  if (!user || user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  const supabase = createSupabaseAdminClient(context);

  const { data: submissions, error } = await supabase
    .from("equipment_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return data({ submissions: [], user }, { headers: sbServerClient.headers });
  }

  return data({ submissions: submissions || [], user }, { headers: sbServerClient.headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient);

  // Check admin access
  if (!user || user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  const formData = await request.formData();
  const submissionId = formData.get("submissionId") as string;
  const actionType = formData.get("action") as string;
  const moderatorNotes = formData.get("moderatorNotes") as string || null;

  if (!submissionId || !actionType) {
    return data({ error: "Missing required fields" }, { status: 400, headers: sbServerClient.headers });
  }

  const supabase = createSupabaseAdminClient(context);

  // Update submission status
  const { error: updateError } = await supabase
    .from("equipment_submissions")
    .update({
      status: actionType as "approved" | "rejected",
      moderator_id: user.id,
      moderator_notes: moderatorNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  if (updateError) {
    return data({ error: "Failed to update submission" }, { status: 500, headers: sbServerClient.headers });
  }

  // If approved, create the equipment record
  if (actionType === "approved") {
    // Get the submission details
    const { data: submission } = await supabase
      .from("equipment_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (submission) {
      // Generate slug from name
      const slug = submission.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // Create equipment record
      const { error: equipmentError } = await supabase
        .from("equipment")
        .insert({
          name: submission.name,
          slug: slug,
          manufacturer: submission.manufacturer,
          category: submission.category,
          subcategory: submission.subcategory,
          specifications: submission.specifications,
        });

      if (equipmentError) {
        // Don't fail the approval if equipment creation fails
      }
    }
  }

  return redirect("/admin/equipment-submissions", { headers: sbServerClient.headers });
}

export default function AdminEquipmentSubmissions({
  loaderData,
}: Route.ComponentProps) {
  const { submissions, user } = loaderData;

  const getStatusBadge = (status: string) => {
    const baseClasses =
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    switch (status) {
      case "pending":
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case "approved":
        return `${baseClasses} bg-green-100 text-green-800`;
      case "rejected":
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "blade":
        return "🏓";
      case "rubber":
        return "⚫";
      case "ball":
        return "🟠";
      default:
        return "📋";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Equipment Submissions
        </h2>
        <div className="text-sm text-gray-600">
          {submissions.length} total submissions
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No submissions found
          </h3>
          <p className="text-gray-600">
            No equipment submissions to review at this time.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden rounded-md">
          <ul className="divide-y divide-gray-200">
            {submissions.map((submission) => (
              <li key={submission.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">
                        {getCategoryIcon(submission.category)}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {submission.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          by {submission.manufacturer} • {submission.category}
                          {submission.subcategory &&
                            ` (${submission.subcategory})`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={getStatusBadge(submission.status)}>
                        {submission.status}
                      </span>
                      <div className="text-sm text-gray-500">
                        {new Date(submission.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {submission.specifications &&
                    Object.keys(submission.specifications).length > 0 && (
                      <div className="mt-2 text-sm text-gray-600">
                        <strong>Specifications:</strong>
                        <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2">
                          {Object.entries(submission.specifications).map(
                            ([key, value]) => (
                              <span key={key} className="text-xs">
                                <strong>{key}:</strong> {String(value)}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                  {submission.moderator_notes && (
                    <div className="mt-2 text-sm">
                      <strong className="text-gray-700">
                        Moderator Notes:
                      </strong>
                      <p className="text-gray-600 mt-1">
                        {submission.moderator_notes}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 flex items-center space-x-3">
                    {submission.status === "pending" && (
                      <>
                        <Form method="post" className="inline">
                          <input
                            type="hidden"
                            name="submissionId"
                            value={submission.id}
                          />
                          <input type="hidden" name="action" value="approved" />
                          <button
                            type="submit"
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                          >
                            Approve
                          </button>
                        </Form>
                        <Form method="post" className="inline">
                          <input
                            type="hidden"
                            name="submissionId"
                            value={submission.id}
                          />
                          <input type="hidden" name="action" value="rejected" />
                          <button
                            type="submit"
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          >
                            Reject
                          </button>
                        </Form>
                      </>
                    )}
                    <button
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                      onClick={() => {
                        /* TODO: Implement view details modal */
                      }}
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
