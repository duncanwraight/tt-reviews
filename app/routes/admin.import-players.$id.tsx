// Player proposal detail / review (TT-201).
//
// Loads one row from `player_proposals`, shows the merged fields with
// per-source attribution, and offers Approve / Reject. Approve goes
// through applyPlayerProposal which (re-)downloads the headshot if
// needed, inserts a `players` row, and stamps `applied_player_id` on
// the proposal. Reject stamps `status='rejected'`.

import type { Route } from "./+types/admin.import-players.$id";
import { data, Form, Link, redirect } from "react-router";

import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import {
  applyPlayerProposal,
  rejectPlayerProposal,
} from "~/lib/admin/player-proposal-applier.server";
import type { R2PutBucket } from "~/lib/players/photo.server";
import type { RunLogEntry } from "~/lib/players/run-log";
import type {
  IttfProfileCandidate,
  MergedPlayer,
  WttRosterCandidate,
} from "~/lib/players/types";
import { Logger, createLogContext } from "~/lib/logger.server";
import { PlayerImportRunLog } from "~/components/admin/PlayerImportRunLog";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Review Import | Admin | TT Reviews" },
    {
      name: "description",
      content: "Review a queued player proposal from the importer.",
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

interface ProposalDetail {
  id: string;
  ittfid: number;
  status: string;
  created_at: string;
  merged: MergedPlayer;
  candidates: {
    wtt?: WttRosterCandidate;
    ittf?: IttfProfileCandidate;
  };
  run_log: RunLogEntry[];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, supabaseAdmin, csrfToken } = gate;

  const { data: proposal, error } = await supabaseAdmin
    .from("player_proposals")
    .select("id, ittfid, status, created_at, merged, candidates, run_log")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !proposal) {
    throw new Response("Not found", { status: 404 });
  }

  // run_log defaults to '[]'::jsonb in the migration; the cast keeps
  // older rows (pre-TT-204) safe — they come back with run_log=[].
  const detail: ProposalDetail = {
    ...(proposal as ProposalDetail),
    run_log: Array.isArray((proposal as ProposalDetail).run_log)
      ? (proposal as ProposalDetail).run_log
      : [],
  };

  return data(
    {
      proposal: detail,
      csrfToken,
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  const formData = await request.formData();
  const intent = formData.get("intent");
  const proposalId = params.id;

  if (intent === "approve") {
    const bucket = (
      context.cloudflare.env as unknown as { IMAGE_BUCKET: R2PutBucket }
    ).IMAGE_BUCKET;
    const result = await applyPlayerProposal(
      supabaseAdmin,
      bucket,
      proposalId,
      user.id
    );
    if (!result.ok) {
      Logger.error(
        "import-players.approve.failed",
        createLogContext("admin-import-players-detail", { proposalId }),
        new Error(result.error ?? "approve failed")
      );
      return data(
        { error: result.error ?? "Approve failed" },
        { status: 400, headers: sbServerClient.headers }
      );
    }
    return redirect(`/players/${result.playerSlug}`, {
      headers: sbServerClient.headers,
    });
  }

  if (intent === "reject") {
    const result = await rejectPlayerProposal(
      supabaseAdmin,
      proposalId,
      user.id
    );
    if (!result.ok) {
      Logger.error(
        "import-players.reject.failed",
        createLogContext("admin-import-players-detail", { proposalId }),
        new Error(result.error ?? "reject failed")
      );
      return data(
        { error: result.error ?? "Reject failed" },
        { status: 400, headers: sbServerClient.headers }
      );
    }
    return redirect("/admin/import-players", {
      headers: sbServerClient.headers,
    });
  }

  return data(
    { error: "Unknown action" },
    { status: 400, headers: sbServerClient.headers }
  );
}

function fieldRow(
  label: string,
  value: string | number | undefined,
  source?: string,
  sourceUrl?: string
) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-gray-100 text-sm">
      <dt className="font-medium text-gray-700">{label}</dt>
      <dd className="col-span-2 text-gray-900">
        {value !== undefined && value !== null && value !== "" ? (
          <span
            data-testid={`field-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {value}
          </span>
        ) : (
          <span className="text-gray-400">missing</span>
        )}
        {source ? (
          <span className="ml-2 text-xs text-gray-500">
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-purple-700 hover:underline"
              >
                from {source}
              </a>
            ) : (
              <>from {source}</>
            )}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

export default function AdminImportPlayerDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { proposal, csrfToken } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;
  const { merged, candidates } = proposal;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <Link
          to="/admin/import-players"
          className="text-sm text-purple-700 hover:underline"
        >
          ← Back to queue
        </Link>
        <h1
          className="text-2xl font-bold text-gray-900 mt-2"
          data-testid="import-player-detail-name"
        >
          {merged.name}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          ittfid <code className="bg-gray-100 px-1">{proposal.ittfid}</code> ·
          status <code className="bg-gray-100 px-1">{proposal.status}</code>
        </p>
      </header>

      {error ? (
        <div
          className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 mb-4 text-sm"
          data-testid="import-player-detail-error"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section
        className="bg-white rounded-lg shadow p-6 mb-6"
        data-testid="import-player-detail-merged"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Merged fields
        </h2>
        <dl>
          {fieldRow("Name", merged.name, "wtt", merged.wtt_profile_url)}
          {fieldRow(
            "Represents",
            merged.represents,
            "wtt",
            merged.wtt_profile_url
          )}
          {fieldRow(
            "Gender",
            merged.gender === "M"
              ? "Men"
              : merged.gender === "F"
                ? "Women"
                : undefined,
            "wtt",
            merged.wtt_profile_url
          )}
          {fieldRow(
            "Handedness",
            merged.handedness,
            "ittf",
            merged.ittf_profile_url
          )}
          {fieldRow("Grip", merged.grip, "ittf", merged.ittf_profile_url)}
          {fieldRow(
            "Birth year",
            merged.birth_year,
            "ittf",
            merged.ittf_profile_url
          )}
          {fieldRow(
            "Headshot URL",
            merged.headshot_url,
            "wtt",
            merged.wtt_profile_url
          )}
        </dl>
        {merged.headshot_url ? (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
              Headshot preview
            </p>
            <img
              src={merged.headshot_url}
              alt={`Headshot of ${merged.name} from WTT`}
              className="w-32 h-32 object-cover rounded-md bg-gray-100"
              referrerPolicy="no-referrer"
              data-testid="import-player-detail-headshot"
            />
          </div>
        ) : null}
      </section>

      <div className="mb-6">
        <PlayerImportRunLog entries={proposal.run_log} />
      </div>

      <section
        className="bg-white rounded-lg shadow p-6 mb-6 text-xs"
        data-testid="import-player-detail-raw"
      >
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Per-source candidates
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="font-medium text-gray-600 mb-1">WTT</p>
            <pre className="bg-gray-50 p-2 rounded overflow-auto whitespace-pre-wrap break-all">
              {candidates.wtt ? JSON.stringify(candidates.wtt, null, 2) : "—"}
            </pre>
          </div>
          <div>
            <p className="font-medium text-gray-600 mb-1">ITTF</p>
            <pre className="bg-gray-50 p-2 rounded overflow-auto whitespace-pre-wrap break-all">
              {candidates.ittf ? JSON.stringify(candidates.ittf, null, 2) : "—"}
            </pre>
          </div>
        </div>
      </section>

      <Form method="post" className="flex items-center gap-3">
        <input type="hidden" name="_csrf" value={csrfToken} />
        <button
          type="submit"
          name="intent"
          value="approve"
          disabled={proposal.status !== "pending_review"}
          className="inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed"
          data-testid="import-player-approve"
        >
          Approve
        </button>
        <button
          type="submit"
          name="intent"
          value="reject"
          disabled={proposal.status !== "pending_review"}
          className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="import-player-reject"
        >
          Reject
        </button>
        {proposal.status !== "pending_review" ? (
          <span className="text-xs text-gray-500">
            Already {proposal.status.replace("_", " ")}.
          </span>
        ) : null}
      </Form>
    </div>
  );
}
