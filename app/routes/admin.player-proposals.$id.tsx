import type { Route } from "./+types/admin.player-proposals.$id";
import { data, Form, redirect } from "react-router";

import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import {
  applyPlayerProposal,
  rejectPlayerProposal,
} from "~/lib/admin/player-proposal-applier.server";
import { createLogContext, Logger } from "~/lib/logger.server";

export function meta() {
  return [
    { title: "Review Player Proposal · Admin" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

interface ProposalDetail {
  id: string;
  ittfid: number;
  status: string;
  created_at: string;
  merged: {
    name?: string;
    represents?: string;
    birth_country?: string;
    gender?: "M" | "F";
    handedness?: "left" | "right";
    grip?: "shakehand" | "penhold";
    highest_rating?: string;
    active_years?: string;
    wtt_profile_url?: string;
    image_source_url?: string;
    per_field_source?: Record<string, string>;
  };
  candidates: Record<string, Record<string, unknown>>;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, supabaseAdmin, csrfToken } = gate;

  const { data: row, error } = await supabaseAdmin
    .from("player_proposals")
    .select("id, ittfid, status, created_at, merged, candidates")
    .eq("id", params.id)
    .single();

  if (error || !row) {
    throw new Response("Not found", { status: 404 });
  }

  return data(
    { proposal: row as ProposalDetail, csrfToken },
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
  const ctx = createLogContext("admin.player-proposals", {
    proposalId,
    userId: user.id,
  });

  if (intent === "reject") {
    const result = await rejectPlayerProposal(
      supabaseAdmin,
      proposalId,
      user.id
    );
    if (!result.ok) {
      Logger.error(
        "admin.player-proposals.reject.failed",
        ctx,
        new Error(result.error ?? "reject failed")
      );
      return data(
        { error: result.error ?? "Reject failed" },
        { status: 400, headers: sbServerClient.headers }
      );
    }
    return redirect("/admin/player-proposals", {
      headers: sbServerClient.headers,
    });
  }

  if (intent === "apply") {
    const result = await applyPlayerProposal(
      supabaseAdmin,
      proposalId,
      user.id
    );
    if (!result.ok) {
      Logger.error(
        "admin.player-proposals.apply.failed",
        ctx,
        new Error(result.error ?? "apply failed")
      );
      return data(
        { error: result.error ?? "Apply failed" },
        { status: 400, headers: sbServerClient.headers }
      );
    }
    Logger.info("admin.player-proposals.applied", ctx, {
      player_id: result.player_id,
      slug: result.slug,
    });
    return redirect(`/players/${result.slug}`, {
      headers: sbServerClient.headers,
    });
  }

  return data(
    { error: "unknown intent" },
    { status: 400, headers: sbServerClient.headers }
  );
}

interface FieldRowProps {
  label: string;
  value: string | number | undefined;
  source?: string;
  testid?: string;
}

function FieldRow({ label, value, source, testid }: FieldRowProps) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-gray-100 last:border-b-0">
      <dt className="text-sm font-medium text-gray-600">{label}</dt>
      <dd className="text-sm text-gray-900 col-span-2" data-testid={testid}>
        {value !== undefined && value !== "" ? (
          <span>{value}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
        {source && (
          <span className="ml-2 text-xs text-gray-500">from {source}</span>
        )}
      </dd>
    </div>
  );
}

export default function AdminPlayerProposalDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { proposal, csrfToken } = loaderData;
  const merged = proposal.merged;
  const source = (key: string): string | undefined =>
    merged.per_field_source?.[key];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          {merged.name ?? "(unnamed)"}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Proposal status:{" "}
          <span className="font-medium" data-testid="proposal-status">
            {proposal.status}
          </span>{" "}
          · ITTF id{" "}
          <code className="text-xs bg-gray-100 px-1">{proposal.ittfid}</code>
        </p>
      </header>

      {actionData && "error" in actionData && actionData.error && (
        <div
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          data-testid="proposal-action-error"
        >
          {actionData.error}
        </div>
      )}

      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Merged fields
        </h2>
        <dl className="divide-y divide-gray-100">
          <FieldRow
            label="Name"
            value={merged.name}
            source={source("name")}
            testid="merged-name"
          />
          <FieldRow
            label="Represents"
            value={merged.represents}
            source={source("represents")}
            testid="merged-represents"
          />
          <FieldRow
            label="Birth country"
            value={merged.birth_country}
            source={source("birth_country")}
          />
          <FieldRow
            label="Gender"
            value={merged.gender}
            source={source("gender")}
          />
          <FieldRow
            label="Handedness"
            value={merged.handedness}
            source={source("handedness")}
          />
          <FieldRow label="Grip" value={merged.grip} source={source("grip")} />
          <FieldRow
            label="Highest rating"
            value={merged.highest_rating}
            source={source("highest_rating")}
          />
          <FieldRow
            label="Active years"
            value={merged.active_years}
            source={source("active_years")}
          />
          {merged.wtt_profile_url && (
            <FieldRow
              label="WTT profile"
              value={merged.wtt_profile_url}
              source={source("wtt_profile_url")}
            />
          )}
        </dl>
      </section>

      {proposal.status === "pending_review" && (
        <div className="flex gap-3">
          <Form method="post">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="intent" value="apply" />
            <button
              type="submit"
              className="px-4 py-2 rounded bg-green-600 text-white font-medium hover:bg-green-700"
              data-testid="proposal-approve-button"
            >
              Approve & create player
            </button>
          </Form>
          <Form method="post">
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="intent" value="reject" />
            <button
              type="submit"
              className="px-4 py-2 rounded bg-gray-200 text-gray-800 font-medium hover:bg-gray-300"
              data-testid="proposal-reject-button"
            >
              Reject
            </button>
          </Form>
        </div>
      )}
    </div>
  );
}
