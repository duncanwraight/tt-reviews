// Admin spec-proposal detail / review form (TT-150). Loads the
// proposal + the linked equipment row, renders one form control per
// spec field pre-filled with the merged value, and dispatches Apply
// or Reject through the SECURITY DEFINER RPCs (see
// app/lib/admin/spec-proposal-applier.server.ts).
//
// Per-field source URLs from `merged.per_field_source` surface as
// "from <host>" badges below each input so the moderator can audit
// which source supplied each value.

import type { Route } from "./+types/admin.spec-proposals.$id";
import { data, Form, redirect } from "react-router";

import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import {
  applySpecProposal,
  rejectSpecProposal,
} from "~/lib/admin/spec-proposal-applier.server";
import { Logger, createLogContext } from "~/lib/logger.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Review Spec Proposal | Admin | TT Reviews" },
    {
      name: "description",
      content: "Review and apply or reject a spec proposal.",
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

interface SpecValueRange {
  min: number;
  max: number;
}
type SpecValue = number | string | SpecValueRange | null;

interface MergedSpec {
  specs: Record<string, SpecValue>;
  description: string | null;
  per_field_source: Record<string, string>;
}

interface CandidatePayload {
  source_id: string;
  source_tier: number;
  final_url: string;
  fetched_at: string;
  specs: Record<string, SpecValue>;
  description: string | null;
  per_field_confidence: Record<string, number>;
  raw_html_excerpt: string;
}

interface ProposalRow {
  id: string;
  equipment_id: string;
  status: string;
  created_at: string;
  merged: MergedSpec;
  candidates: Record<string, CandidatePayload>;
}

interface EquipmentRow {
  id: string;
  name: string;
  slug: string;
  manufacturer: string;
  category: string | null;
  subcategory: string | null;
  specifications: Record<string, SpecValue> | null;
  description: string | null;
}

const FIELD_ORDER: ReadonlyArray<{
  field: string;
  label: string;
  type: "int" | "float" | "text" | "range";
  hint?: string;
}> = [
  { field: "weight", label: "Weight", type: "int", hint: "grams" },
  { field: "thickness", label: "Thickness", type: "float", hint: "mm" },
  { field: "plies_wood", label: "Plies (wood)", type: "int" },
  { field: "plies_composite", label: "Plies (composite)", type: "int" },
  {
    field: "composite_material",
    label: "Composite material",
    type: "text",
  },
  { field: "material", label: "Material", type: "text" },
  { field: "speed", label: "Speed", type: "float", hint: "0–10" },
  { field: "spin", label: "Spin", type: "float", hint: "0–10" },
  { field: "control", label: "Control", type: "float", hint: "0–10" },
  { field: "hardness", label: "Hardness", type: "range" },
  { field: "sponge", label: "Sponge", type: "text" },
  { field: "topsheet", label: "Topsheet", type: "text" },
  { field: "year", label: "Year", type: "text" },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, supabaseAdmin, csrfToken } = gate;

  const proposalId = params.id;
  const { data: proposal, error: proposalError } = await supabaseAdmin
    .from("equipment_spec_proposals")
    .select("*")
    .eq("id", proposalId)
    .single();

  if (proposalError || !proposal) {
    throw new Response("Not found", { status: 404 });
  }

  const { data: equipment, error: equipmentError } = await supabaseAdmin
    .from("equipment")
    .select(
      "id, name, slug, manufacturer, category, subcategory, specifications, description"
    )
    .eq("id", (proposal as ProposalRow).equipment_id)
    .single();

  if (equipmentError || !equipment) {
    throw new Response("Linked equipment not found", { status: 404 });
  }

  return data(
    {
      proposal: proposal as ProposalRow,
      equipment: equipment as EquipmentRow,
      csrfToken,
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  // CSRF was already validated by ensureAdminAction → enforceAdminActionGate.
  const formData = await request.formData();
  const intent = formData.get("intent");
  const proposalId = params.id;

  if (intent === "reject") {
    const result = await rejectSpecProposal(supabaseAdmin, proposalId, user.id);
    if (!result.ok) {
      Logger.error(
        "spec-proposals.reject.failed",
        createLogContext("admin-spec-proposals", { proposalId }),
        new Error(result.error ?? "reject failed")
      );
      return data(
        { error: result.error ?? "Reject failed" },
        { status: 400, headers: sbServerClient.headers }
      );
    }
    return redirect("/admin/spec-proposals", {
      headers: sbServerClient.headers,
    });
  }

  if (intent === "apply") {
    const result = await applySpecProposal(
      supabaseAdmin,
      proposalId,
      user.id,
      formData
    );
    if (!result.ok) {
      Logger.error(
        "spec-proposals.apply.failed",
        createLogContext("admin-spec-proposals", { proposalId }),
        new Error(result.error ?? "apply failed")
      );
      return data(
        { error: result.error ?? "Apply failed" },
        { status: 400, headers: sbServerClient.headers }
      );
    }
    return redirect("/admin/spec-proposals", {
      headers: sbServerClient.headers,
    });
  }

  return data(
    { error: "Unknown action" },
    { status: 400, headers: sbServerClient.headers }
  );
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function valueToString(v: SpecValue | undefined): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "number" || typeof v === "string") return String(v);
  return `${v.min}–${v.max}`;
}

function rangeBound(v: SpecValue | undefined, bound: "min" | "max"): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object" && "min" in v && "max" in v) {
    return String(v[bound]);
  }
  return "";
}

export default function AdminSpecProposalDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { proposal, equipment, csrfToken } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;

  const merged = proposal.merged;
  const current = equipment.specifications ?? {};

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {equipment.manufacturer} {equipment.name}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {equipment.category}
          {equipment.subcategory ? ` · ${equipment.subcategory}` : ""} —
          proposal{" "}
          <code className="text-xs bg-gray-100 px-1">
            {proposal.id.slice(0, 8)}
          </code>
        </p>
      </header>

      {error && (
        <div
          className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 mb-4"
          data-testid="spec-proposal-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <Form method="post" className="space-y-6">
        <input type="hidden" name="_csrf" value={csrfToken} />

        <section
          className="bg-white rounded-lg shadow p-6"
          data-testid="spec-proposal-form"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Specs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FIELD_ORDER.map(({ field, label, type, hint }) => {
              const proposedValue = merged.specs[field];
              const currentValue = current[field];
              const sourceUrl = merged.per_field_source[field];
              return (
                <div
                  key={field}
                  className="flex flex-col gap-1"
                  data-testid={`spec-field-${field}`}
                >
                  <label
                    htmlFor={`spec.${field}`}
                    className="text-sm font-medium text-gray-700"
                  >
                    {label}
                    {hint ? (
                      <span className="ml-1 text-xs text-gray-400">
                        ({hint})
                      </span>
                    ) : null}
                  </label>
                  {type === "range" ? (
                    <div className="flex items-center gap-2">
                      <input
                        id={`spec.${field}.min`}
                        name={`spec.${field}.min`}
                        type="number"
                        step="0.1"
                        defaultValue={rangeBound(proposedValue, "min")}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                        placeholder="min"
                      />
                      <span className="text-gray-400">–</span>
                      <input
                        id={`spec.${field}.max`}
                        name={`spec.${field}.max`}
                        type="number"
                        step="0.1"
                        defaultValue={rangeBound(proposedValue, "max")}
                        className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                        placeholder="max"
                      />
                    </div>
                  ) : (
                    <input
                      id={`spec.${field}`}
                      name={`spec.${field}`}
                      type={type === "text" ? "text" : "number"}
                      step={type === "float" ? "0.1" : "1"}
                      defaultValue={valueToString(proposedValue)}
                      className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
                    />
                  )}
                  <div className="text-xs text-gray-500">
                    {currentValue !== undefined && currentValue !== null ? (
                      <span data-testid={`spec-current-${field}`}>
                        currently: {valueToString(currentValue)}
                      </span>
                    ) : (
                      <span className="text-gray-400">currently: —</span>
                    )}
                    {sourceUrl ? (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="ml-2 text-purple-700 hover:underline"
                      >
                        from {safeHostname(sourceUrl)}
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Description
          </h2>
          <label htmlFor="description" className="sr-only">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={merged.description ?? ""}
            className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
            data-testid="spec-description"
          />
          <div className="mt-2 text-xs text-gray-500">
            {equipment.description ? (
              <span data-testid="spec-current-description">
                currently: {equipment.description.slice(0, 200)}
                {equipment.description.length > 200 ? "…" : ""}
              </span>
            ) : (
              <span className="text-gray-400">currently: —</span>
            )}
            {merged.per_field_source.description ? (
              <a
                href={merged.per_field_source.description}
                target="_blank"
                rel="noreferrer noopener"
                className="ml-2 text-purple-700 hover:underline"
              >
                from {safeHostname(merged.per_field_source.description)}
              </a>
            ) : null}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            name="intent"
            value="apply"
            className="inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700"
            data-testid="spec-proposal-apply"
          >
            Apply
          </button>
          <button
            type="submit"
            name="intent"
            value="reject"
            className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
            data-testid="spec-proposal-reject"
          >
            Reject
          </button>
        </div>
      </Form>
    </div>
  );
}
