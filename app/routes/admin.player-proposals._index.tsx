import type { Route } from "./+types/admin.player-proposals._index";
import { data, Link } from "react-router";
import { Inbox } from "lucide-react";

import { ensureAdminLoader } from "~/lib/admin/middleware.server";
import { formatRelativeTime } from "~/lib/date";
import { Logger, createLogContext } from "~/lib/logger.server";

export function meta() {
  return [
    { title: "Player Proposals · Admin" },
    {
      name: "description",
      content: "Pending player proposals from the WTT importer.",
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

interface ProposalRow {
  id: string;
  ittfid: number;
  created_at: string;
  merged: {
    name?: string;
    represents?: string;
    gender?: "M" | "F";
  };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, supabaseAdmin } = gate;

  const { data: rows, error } = await supabaseAdmin
    .from("player_proposals")
    .select("id, ittfid, created_at, merged")
    .eq("status", "pending_review")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    Logger.error(
      "admin.player-proposals.list.failed",
      createLogContext("admin-player-proposals"),
      new Error(error.message)
    );
    return data(
      { proposals: [] as ProposalRow[] },
      { headers: sbServerClient.headers }
    );
  }

  return data(
    { proposals: (rows ?? []) as ProposalRow[] },
    { headers: sbServerClient.headers }
  );
}

export default function AdminPlayerProposalsIndex({
  loaderData,
}: Route.ComponentProps) {
  const { proposals } = loaderData;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Player Proposals</h1>
        <p className="text-sm text-gray-600 mt-1">
          Pending player proposals from the WTT importer. Approve to materialise
          a row in <code className="text-xs bg-gray-100 px-1">players</code>;
          reject to leave the proposal flagged without inserting.
        </p>
      </header>

      {proposals.length === 0 ? (
        <div
          className="bg-white rounded-lg shadow p-8 text-center text-gray-500"
          data-testid="player-proposals-empty"
        >
          <Inbox className="size-8 mx-auto mb-2 text-gray-400" aria-hidden />
          <p>No pending proposals.</p>
        </div>
      ) : (
        <div
          className="bg-white rounded-lg shadow overflow-hidden"
          data-testid="player-proposals-list"
        >
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Represents
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ITTF id
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pending
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {proposals.map(p => (
                <tr key={p.id} data-testid="player-proposal-row">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {p.merged.name ?? "(unnamed)"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {p.merged.represents ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {p.ittfid}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatRelativeTime(p.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/player-proposals/${p.id}`}
                      className="text-purple-700 hover:text-purple-900 text-sm font-medium"
                      data-testid="player-proposal-review-link"
                    >
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
