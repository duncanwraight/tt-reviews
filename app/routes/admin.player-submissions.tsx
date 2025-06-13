import type { Route } from "./+types/admin.player-submissions";
import { data, redirect, Form } from "react-router";
import { createSupabaseClient } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Player Submissions | Admin | TT Reviews" },
    { name: "description", content: "Review and moderate player submissions." },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient);

  // Check admin access
  if (!user || user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  const supabase = createSupabaseClient(context);

  const { data: submissions, error } = await supabase
    .from("player_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching player submissions:", error);
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

  const supabase = createSupabaseClient(context);

  const { error } = await supabase
    .from("player_submissions")
    .update({
      status: actionType as "approved" | "rejected",
      moderator_id: user.id,
      moderator_notes: moderatorNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  if (error) {
    console.error("Error updating player submission:", error);
    return data({ error: "Failed to update submission" }, { status: 500, headers: sbServerClient.headers });
  }

  return redirect("/admin/player-submissions", { headers: sbServerClient.headers });
}

export default function AdminPlayerSubmissions({
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

  const getPlayingStyleLabel = (style: string | undefined): string => {
    if (!style || style === "unknown") return "";
    return style.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Player Submissions</h2>
        <div className="text-sm text-gray-600">
          {submissions.length} total submissions
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">👤</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No submissions found
          </h3>
          <p className="text-gray-600">
            No player submissions to review at this time.
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
                      <span className="text-2xl mr-3">👤</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {submission.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {submission.playing_style &&
                            getPlayingStyleLabel(submission.playing_style)}
                          {submission.represents &&
                            ` • Represents: ${submission.represents}`}
                          {submission.birth_country &&
                            ` • Born: ${submission.birth_country}`}
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

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    {submission.highest_rating && (
                      <div>
                        <span className="font-medium text-gray-700">
                          Highest Rating:
                        </span>
                        <span className="ml-2 text-gray-900">
                          {submission.highest_rating}
                        </span>
                      </div>
                    )}
                    {submission.active_years && (
                      <div>
                        <span className="font-medium text-gray-700">
                          Active Years:
                        </span>
                        <span className="ml-2 text-gray-900">
                          {submission.active_years}
                        </span>
                      </div>
                    )}
                    {submission.playing_style && (
                      <div>
                        <span className="font-medium text-gray-700">
                          Playing Style:
                        </span>
                        <span className="ml-2 text-gray-900">
                          {getPlayingStyleLabel(submission.playing_style)}
                        </span>
                      </div>
                    )}
                  </div>

                  {submission.equipment_setup &&
                    Object.keys(submission.equipment_setup).length > 0 && (
                      <div className="mt-3 bg-gray-50 rounded-lg p-3">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">
                          Equipment Setup:
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                          {Object.entries(submission.equipment_setup).map(
                            ([key, value]) => (
                              <div key={key}>
                                <span className="font-medium text-gray-700">
                                  {key
                                    .replace(/_/g, " ")
                                    .replace(/\b\w/g, (l) => l.toUpperCase())}
                                  :
                                </span>
                                <span className="ml-2 text-gray-900">
                                  {String(value)}
                                </span>
                              </div>
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
