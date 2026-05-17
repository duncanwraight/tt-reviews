// Apply / reject orchestration for spec proposals (TT-150, extended in
// TT-231). Validates the admin's edited form values against the same
// CategoryOption[] metadata that drives the public submission flow's
// parseEquipmentSpecs (so int/float/range/text/enum/text_list all
// validate uniformly) and dispatches to the SECURITY DEFINER RPCs
// (apply_spec_proposal / reject_spec_proposal). Lives outside the
// route so unit tests can drive validation with a mocked Supabase
// client.
//
// Fields not configured for the equipment's category/subcategory are
// dropped silently — a misconfigured form submission shouldn't be able
// to push values onto fields the public flow wouldn't even render.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CategoryOption } from "../categories.server";

export type SpecValue =
  | number
  | string
  | string[]
  | { min: number; max: number }
  | null;

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

const TEXT_MAX_LEN = 200;
const TEXT_LIST_ITEM_MAX_LEN = 50;
const TEXT_LIST_MAX_ITEMS = 20;

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

// Validate the FormData submitted by the detail-route's "Apply" form
// against the spec-field schema for the equipment's category /
// subcategory. Returns a typed { specifications, description } pair on
// success or { ok: false, error } on the first malformed value. The
// action handler surfaces the error to the form so the admin can fix
// it.
export function validateProposalForm(
  formData: FormData,
  specFields: CategoryOption[]
): ValidationResult {
  const specifications: Record<string, SpecValue> = {};
  // A given spec key can appear under multiple parents (e.g. `speed`
  // under blade and under every rubber subcategory). Dedupe so we
  // only parse once.
  const seen = new Set<string>();

  for (const field of specFields) {
    if (!field.field_type) continue;
    if (seen.has(field.value)) continue;
    seen.add(field.value);

    const key = `spec.${field.value}`;

    switch (field.field_type) {
      case "int": {
        const raw = readField(formData, key);
        if (raw === null) break;
        const n = parseInt10(raw);
        if (n === null) {
          return { ok: false, error: `${field.value}: must be a whole number` };
        }
        specifications[field.value] = n;
        break;
      }

      case "float": {
        const raw = readField(formData, key);
        if (raw === null) break;
        const n = parseFloatStrict(raw);
        if (n === null) {
          return { ok: false, error: `${field.value}: must be a number` };
        }
        specifications[field.value] = n;
        break;
      }

      case "range": {
        const min = readField(formData, `${key}.min`);
        const max = readField(formData, `${key}.max`);
        if (min === null && max === null) break;
        const minN = min !== null ? parseFloatStrict(min) : null;
        const maxN = max !== null ? parseFloatStrict(max) : null;
        if (minN === null || maxN === null) {
          return {
            ok: false,
            error: `${field.value}: both min and max are required when one is set`,
          };
        }
        if (minN > maxN) {
          return {
            ok: false,
            error: `${field.value}: min (${minN}) cannot exceed max (${maxN})`,
          };
        }
        specifications[field.value] = { min: minN, max: maxN };
        break;
      }

      case "text": {
        const raw = readField(formData, key);
        if (raw === null) break;
        if (raw.length > TEXT_MAX_LEN) {
          return {
            ok: false,
            error: `${field.value}: must be ${TEXT_MAX_LEN} characters or fewer`,
          };
        }
        specifications[field.value] = raw;
        break;
      }

      case "enum": {
        const raw = readField(formData, key);
        if (raw === null) break;
        const allowed = (field.enum_options ?? []).map(o => o.value);
        if (allowed.length === 0) {
          return {
            ok: false,
            error: `${field.value}: no options configured`,
          };
        }
        if (!allowed.includes(raw)) {
          return {
            ok: false,
            error: `${field.value}: must be one of ${allowed.join(", ")}`,
          };
        }
        specifications[field.value] = raw;
        break;
      }

      case "text_list": {
        // Mirrors parseEquipmentSpecs: comma-separated input → JSONB
        // string array. Used primarily for sponge_thickness where the
        // equipment has a discrete published set of values.
        const raw = readField(formData, key);
        if (raw === null) break;
        const items = raw
          .split(",")
          .map(s => s.trim())
          .filter(s => s.length > 0);
        if (items.length === 0) break;
        if (items.some(s => s.length > TEXT_LIST_ITEM_MAX_LEN)) {
          return {
            ok: false,
            error: `${field.value}: each entry must be ${TEXT_LIST_ITEM_MAX_LEN} characters or fewer`,
          };
        }
        if (items.length > TEXT_LIST_MAX_ITEMS) {
          return {
            ok: false,
            error: `${field.value}: accepts up to ${TEXT_LIST_MAX_ITEMS} entries`,
          };
        }
        specifications[field.value] = items;
        break;
      }
    }
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
  formData: FormData,
  specFields: CategoryOption[]
): Promise<ApplyResult> {
  const validated = validateProposalForm(formData, specFields);
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
