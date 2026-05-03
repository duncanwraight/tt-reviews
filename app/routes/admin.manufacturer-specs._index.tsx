// Admin manufacturer-specs review queue (TT-150). One PostgREST
// round-trip via list_pending_spec_proposals — keeps the loader well
// under the 50-subrequest cap. Per `docs/SEO.md` admin pages stay
// noindex; the fetch path's X-Robots-Tag in workers/app.ts already
// covers /admin/* regardless of route.

import type { Route } from "./+types/admin.manufacturer-specs._index";
import { data, Link } from "react-router";
import { Inbox } from "lucide-react";

import { ensureAdminLoader } from "~/lib/admin/middleware.server";
import { Logger, createLogContext } from "~/lib/logger.server";
import { formatRelativeTime } from "~/lib/date";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Manufacturer Specs | Admin | TT Reviews" },
    {
      name: "description",
      content:
        "Review pending manufacturer-spec proposals from the cron pipeline.",
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

interface ProposalRow {
  id: string;
  equipment_id: string;
  created_at: string;
  equipment_name: string;
  equipment_slug: string;
  equipment_brand: string;
  equipment_category: string | null;
  equipment_subcategory: string | null;
  merged_field_count: number;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, supabaseAdmin } = gate;

  const { data: rpcData, error } = await supabaseAdmin.rpc(
    "list_pending_spec_proposals",
    { p_limit: 200 }
  );

  if (error) {
    Logger.error(
      "manufacturer-specs.list.failed",
      createLogContext("admin-manufacturer-specs", {
        route: "/admin/manufacturer-specs",
      }),
      new Error(error.message)
    );
    return data(
      { proposals: [] as ProposalRow[] },
      { headers: sbServerClient.headers }
    );
  }

  const proposals = (rpcData as ProposalRow[] | null) ?? [];
  return data({ proposals }, { headers: sbServerClient.headers });
}

export default function AdminManufacturerSpecsIndex({
  loaderData,
}: Route.ComponentProps) {
  const { proposals } = loaderData;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Manufacturer Specs</h1>
        <p className="text-sm text-gray-600 mt-1">
          Pending manufacturer-spec corrections from the background cron. Apply
          writes to{" "}
          <code className="text-xs bg-gray-100 px-1">equipment.*</code> and
          stamps the 6-month cooldown; reject stamps the 14-day cooldown and
          leaves the equipment row untouched.
        </p>
      </header>

      {proposals.length === 0 ? (
        <div
          className="bg-white rounded-lg shadow p-8 text-center text-gray-500"
          data-testid="manufacturer-specs-empty"
        >
          <Inbox className="size-8 mx-auto mb-2 text-gray-400" aria-hidden />
          <p>No pending proposals.</p>
        </div>
      ) : (
        <div
          className="bg-white rounded-lg shadow overflow-hidden"
          data-testid="manufacturer-specs-list"
        >
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Equipment
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Brand
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fields
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pending
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {proposals.map(p => (
                <tr key={p.id} data-testid={`manufacturer-spec-row-${p.id}`}>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <Link
                      to={`/equipment/${p.equipment_slug}`}
                      className="text-purple-700 hover:underline"
                    >
                      {p.equipment_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {p.equipment_brand}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {p.equipment_category ?? "—"}
                    {p.equipment_subcategory
                      ? ` · ${p.equipment_subcategory}`
                      : ""}
                  </td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900">
                    {p.merged_field_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatRelativeTime(p.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/manufacturer-specs/${p.id}`}
                      className="inline-flex items-center px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700"
                      data-testid={`manufacturer-spec-review-${p.id}`}
                    >
                      Review
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
