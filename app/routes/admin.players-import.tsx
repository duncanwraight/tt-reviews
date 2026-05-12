import type { Route } from "./+types/admin.players-import";
import { data, Form, useNavigation } from "react-router";
import { Loader2, UserPlus } from "lucide-react";

import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import { createLogContext, Logger } from "~/lib/logger.server";
import { importPlayers } from "~/lib/player-sourcing/source.server";

export function meta() {
  return [
    { title: "Player Importer · Admin" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

type ProposalStatus = "pending_review" | "applied" | "rejected" | "no_results";

interface ProposalCounts {
  pending_review: number;
  applied: number;
  rejected: number;
  no_results: number;
}

const EMPTY_COUNTS: ProposalCounts = {
  pending_review: 0,
  applied: 0,
  rejected: 0,
  no_results: 0,
};

async function loadProposalCounts(
  supabaseAdmin: Parameters<typeof importPlayers>[0]
): Promise<ProposalCounts> {
  const resp = await supabaseAdmin.from("player_proposals").select("status");
  if (resp.error) {
    throw new Error(`load proposal counts: ${resp.error.message}`);
  }
  const counts: ProposalCounts = { ...EMPTY_COUNTS };
  for (const row of (resp.data ?? []) as { status: ProposalStatus }[]) {
    if (row.status in counts) counts[row.status] += 1;
  }
  return counts;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, supabaseAdmin, csrfToken } = gate;

  const counts = await loadProposalCounts(supabaseAdmin);

  return data({ counts, csrfToken }, { headers: sbServerClient.headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  const ctx = createLogContext("admin.players-import", { userId: user.id });

  try {
    const result = await importPlayers(supabaseAdmin, ctx);
    return data(
      { success: true as const, result },
      { headers: sbServerClient.headers }
    );
  } catch (err) {
    Logger.error(
      "admin.players-import.failed",
      ctx,
      err instanceof Error ? err : undefined
    );
    return data(
      {
        success: false as const,
        error: err instanceof Error ? err.message : "import failed",
      },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}

interface ImportSummaryCardProps {
  result: {
    fetched: number;
    inserted: number;
    skippedExistingPlayer: number;
    skippedExistingProposal: number;
    errors: string[];
  };
}

function ImportSummaryCard({ result }: ImportSummaryCardProps) {
  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-5"
      data-testid="import-summary"
    >
      <h3 className="text-base font-semibold text-gray-900">Last run</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <dt className="text-gray-500">Fetched from upstream</dt>
        <dd className="font-medium text-gray-900" data-testid="import-fetched">
          {result.fetched}
        </dd>
        <dt className="text-gray-500">New proposals inserted</dt>
        <dd className="font-medium text-gray-900" data-testid="import-inserted">
          {result.inserted}
        </dd>
        <dt className="text-gray-500">Skipped — already a player</dt>
        <dd className="font-medium text-gray-900">
          {result.skippedExistingPlayer}
        </dd>
        <dt className="text-gray-500">Skipped — already moderated</dt>
        <dd className="font-medium text-gray-900">
          {result.skippedExistingProposal}
        </dd>
      </dl>
      {result.errors.length > 0 && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Errors</p>
          <ul className="mt-1 list-disc list-inside">
            {result.errors.map(msg => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AdminPlayersImport({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { counts, csrfToken } = loaderData;
  const navigation = useNavigation();
  const isRunning =
    navigation.state === "submitting" &&
    navigation.formAction === "/admin/players-import";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Player importer</h2>
        <p className="mt-1 text-sm text-gray-600">
          Pulls the WTT ranked-player roster and stages new (unknown) players as{" "}
          <code>player_proposals</code> for admin review. Admins approve
          proposals to materialise the real <code>players</code> rows; the
          review queue lives at <code>/admin/player-proposals</code>.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Proposal queue
            </h3>
            <dl className="mt-2 grid grid-cols-4 gap-x-6 text-sm">
              <div>
                <dt className="text-gray-500">Pending</dt>
                <dd
                  className="font-semibold text-gray-900"
                  data-testid="proposal-count-pending"
                >
                  {counts.pending_review}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Applied</dt>
                <dd className="font-semibold text-gray-900">
                  {counts.applied}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Rejected</dt>
                <dd className="font-semibold text-gray-900">
                  {counts.rejected}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">No results</dt>
                <dd className="font-semibold text-gray-900">
                  {counts.no_results}
                </dd>
              </div>
            </dl>
          </div>
          <Form method="post" action="/admin/players-import">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <button
              type="submit"
              disabled={isRunning}
              className="inline-flex items-center gap-2 px-4 py-2 rounded bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid="run-import-button"
            >
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Importing…
                </>
              ) : (
                <>
                  <UserPlus className="size-4" aria-hidden />
                  Run import
                </>
              )}
            </button>
          </Form>
        </div>
      </div>

      {actionData && "success" in actionData && actionData.success && (
        <ImportSummaryCard result={actionData.result} />
      )}
      {actionData && "success" in actionData && !actionData.success && (
        <div
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          data-testid="import-error"
        >
          Import failed: {actionData.error}
        </div>
      )}
    </div>
  );
}
