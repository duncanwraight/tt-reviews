// Apply / reject orchestration for spec proposals (TT-150). Validates
// the admin's edited form values against the typed schema in
// archive/EQUIPMENT-SPECS.md and dispatches to the SECURITY DEFINER
// RPCs (apply_spec_proposal / reject_spec_proposal). Lives outside the
// route so unit tests can drive validation with a mocked Supabase
// client.
//
// Field-type table mirrors the locked schema. Unknown fields are
// dropped silently — same posture as the LLM extractor (TT-148): we
// don't gate forward-compat extensions on this allowlist.

import type { SupabaseClient } from "@supabase/supabase-js";

type SpecFieldType = "int" | "float" | "text" | "range";

const FIELD_TYPES: Record<string, SpecFieldType> = {
  weight: "int",
  thickness: "float",
  plies_wood: "int",
  plies_composite: "int",
  composite_material: "text",
  material: "text",
  speed: "float",
  spin: "float",
  control: "float",
  hardness: "range",
  sponge: "text",
  topsheet: "text",
  year: "text",
};

export type SpecValue = number | string | { min: number; max: number } | null;

export type ValidationResult =
  | {
      ok: true;
      specifications: Record<string, SpecValue>;
      description: string | null;
    }
  | { ok: false; error: string };

export interface ApplyResult {
  ok: boolean;
  error?: string;
  equipmentId?: string;
}

function readField(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (raw === null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseInt10(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatStrict(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Validate the FormData submitted by the detail-route's "Apply" form.
// Returns a typed { specifications, description } pair on success or
// { ok: false, error } on the first malformed value. The action
// handler surfaces the error to the form so the admin can fix it.
export function validateProposalForm(formData: FormData): ValidationResult {
  const specifications: Record<string, SpecValue> = {};

  for (const [field, type] of Object.entries(FIELD_TYPES)) {
    if (type === "range") {
      const min = readField(formData, `spec.${field}.min`);
      const max = readField(formData, `spec.${field}.max`);
      if (min === null && max === null) continue;
      const minN = min !== null ? parseFloatStrict(min) : null;
      const maxN = max !== null ? parseFloatStrict(max) : null;
      if (minN === null || maxN === null) {
        return {
          ok: false,
          error: `${field}: both min and max are required when one is set`,
        };
      }
      if (minN > maxN) {
        return {
          ok: false,
          error: `${field}: min (${minN}) cannot exceed max (${maxN})`,
        };
      }
      specifications[field] = { min: minN, max: maxN };
      continue;
    }

    const raw = readField(formData, `spec.${field}`);
    if (raw === null) continue;

    if (type === "int") {
      const n = parseInt10(raw);
      if (n === null) {
        return { ok: false, error: `${field}: must be a whole number` };
      }
      specifications[field] = n;
      continue;
    }
    if (type === "float") {
      const n = parseFloatStrict(raw);
      if (n === null) {
        return { ok: false, error: `${field}: must be a number` };
      }
      specifications[field] = n;
      continue;
    }
    // text
    specifications[field] = raw;
  }

  const description = readField(formData, "description");
  return { ok: true, specifications, description };
}

interface RpcEnvelope {
  ok: boolean;
  error?: string;
  equipment_id?: string;
}

export async function applySpecProposal(
  supabase: SupabaseClient,
  proposalId: string,
  reviewerId: string,
  formData: FormData
): Promise<ApplyResult> {
  const validated = validateProposalForm(formData);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const { data, error } = await supabase.rpc("apply_spec_proposal", {
    p_id: proposalId,
    p_specifications: validated.specifications,
    p_description: validated.description,
    p_reviewer: reviewerId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  const env = (data ?? {}) as RpcEnvelope;
  if (!env.ok) {
    return { ok: false, error: env.error ?? "apply failed" };
  }
  return { ok: true, equipmentId: env.equipment_id };
}

export async function rejectSpecProposal(
  supabase: SupabaseClient,
  proposalId: string,
  reviewerId: string
): Promise<ApplyResult> {
  const { data, error } = await supabase.rpc("reject_spec_proposal", {
    p_id: proposalId,
    p_reviewer: reviewerId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  const env = (data ?? {}) as RpcEnvelope;
  if (!env.ok) {
    return { ok: false, error: env.error ?? "reject failed" };
  }
  return { ok: true, equipmentId: env.equipment_id };
}
