import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CategoryOption } from "../../categories.server";
import {
  applySpecProposal,
  rejectSpecProposal,
  validateProposalForm,
} from "../spec-proposal-applier.server";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

// Minimal CategoryOption stub. Tests only care about value + field_type
// (+ enum_options where relevant); display_order is required by the
// type but unused by the validator.
function field(
  value: string,
  field_type: CategoryOption["field_type"],
  extras: Partial<CategoryOption> = {}
): CategoryOption {
  return {
    id: value,
    name: value,
    value,
    display_order: 0,
    field_type,
    ...extras,
  };
}

const BLADE_FIELDS: CategoryOption[] = [
  field("weight", "int"),
  field("thickness", "float"),
  field("plies_wood", "int"),
  field("plies_composite", "int"),
  field("speed", "float"),
  field("composite_material", "text"),
  field("year", "text"),
  field("hardness", "range"),
  field("balance", "enum", {
    enum_options: [
      { value: "head_heavy", label: "Head-heavy" },
      { value: "central", label: "Central" },
      { value: "handle_heavy", label: "Handle-heavy" },
    ],
  }),
];

const RUBBER_FIELDS: CategoryOption[] = [
  field("weight", "int"),
  field("hardness", "range"),
  field("sponge_thickness", "text_list"),
  field("type", "enum", {
    enum_options: [
      { value: "tensor", label: "Tensor" },
      { value: "classic", label: "Classic" },
    ],
  }),
];

describe("validateProposalForm", () => {
  it("parses numeric fields with their declared types (int vs float)", () => {
    const result = validateProposalForm(
      fd({
        "spec.weight": "89",
        "spec.thickness": "5.7",
        "spec.plies_wood": "5",
        "spec.plies_composite": "2",
        "spec.speed": "9.5",
      }),
      BLADE_FIELDS
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications).toEqual({
      weight: 89,
      thickness: 5.7,
      plies_wood: 5,
      plies_composite: 2,
      speed: 9.5,
    });
  });

  it("parses text fields verbatim and trims surrounding whitespace", () => {
    const result = validateProposalForm(
      fd({
        "spec.composite_material": "  Arylate Carbon  ",
        "spec.year": "2019",
      }),
      BLADE_FIELDS
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications).toEqual({
      composite_material: "Arylate Carbon",
      year: "2019",
    });
  });

  it("parses a hardness range when both min and max are set", () => {
    const result = validateProposalForm(
      fd({
        "spec.hardness.min": "40",
        "spec.hardness.max": "42",
      }),
      BLADE_FIELDS
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications).toEqual({
      hardness: { min: 40, max: 42 },
    });
  });

  it("accepts a single-value hardness via min == max", () => {
    const result = validateProposalForm(
      fd({
        "spec.hardness.min": "47.5",
        "spec.hardness.max": "47.5",
      }),
      BLADE_FIELDS
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications.hardness).toEqual({ min: 47.5, max: 47.5 });
  });

  it("rejects hardness when only one bound is set", () => {
    const result = validateProposalForm(
      fd({ "spec.hardness.min": "40" }),
      BLADE_FIELDS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/hardness/);
    }
  });

  it("rejects hardness when min > max", () => {
    const result = validateProposalForm(
      fd({ "spec.hardness.min": "50", "spec.hardness.max": "40" }),
      BLADE_FIELDS
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a non-numeric int field", () => {
    const result = validateProposalForm(
      fd({ "spec.weight": "heavy" }),
      BLADE_FIELDS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/weight/);
  });

  it("drops empty fields rather than writing null/empty values", () => {
    const result = validateProposalForm(
      fd({ "spec.weight": "", "spec.composite_material": "Arylate" }),
      BLADE_FIELDS
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications).toEqual({ composite_material: "Arylate" });
  });

  it("ignores spec.* fields not configured for the equipment's category", () => {
    const result = validateProposalForm(
      fd({ "spec.weight": "89", "spec.something_new": "value" }),
      BLADE_FIELDS
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications).toEqual({ weight: 89 });
  });

  it("accepts an enum slug that matches enum_options", () => {
    const result = validateProposalForm(
      fd({ "spec.balance": "central" }),
      BLADE_FIELDS
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications).toEqual({ balance: "central" });
  });

  it("rejects an enum value not in enum_options", () => {
    const result = validateProposalForm(
      fd({ "spec.balance": "extremely_head_heavy" }),
      BLADE_FIELDS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/balance/);
  });

  it("rejects an enum field whose options are missing from metadata", () => {
    const result = validateProposalForm(
      fd({ "spec.balance": "central" }),
      [field("balance", "enum")] // no enum_options
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/balance/);
  });

  it("parses a text_list field as a trimmed array", () => {
    const result = validateProposalForm(
      fd({ "spec.sponge_thickness": " 1.7, 1.9 , 2.1 " }),
      RUBBER_FIELDS
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications).toEqual({
      sponge_thickness: ["1.7", "1.9", "2.1"],
    });
  });

  it("drops a text_list that resolves to no items after trimming", () => {
    const result = validateProposalForm(
      fd({ "spec.sponge_thickness": " , , " }),
      RUBBER_FIELDS
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications.sponge_thickness).toBeUndefined();
  });

  it("rejects a text_list with an over-length entry", () => {
    const longEntry = "x".repeat(51);
    const result = validateProposalForm(
      fd({ "spec.sponge_thickness": `1.7, ${longEntry}` }),
      RUBBER_FIELDS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sponge_thickness/);
  });

  it("rejects a text_list with more than 20 entries", () => {
    const many = Array.from({ length: 21 }, (_, i) => `v${i}`).join(", ");
    const result = validateProposalForm(
      fd({ "spec.sponge_thickness": many }),
      RUBBER_FIELDS
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sponge_thickness/);
  });

  it("dedupes spec fields that appear under multiple parents", () => {
    // `weight` exists on blade and every rubber subcategory — the
    // category service returns it once per parent. Validator must not
    // re-parse and overwrite.
    const result = validateProposalForm(fd({ "spec.weight": "89" }), [
      field("weight", "int"),
      field("weight", "int"),
    ]);
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications).toEqual({ weight: 89 });
  });

  it("captures description verbatim and trims", () => {
    const result = validateProposalForm(
      fd({ description: "  Legendary blade.  " }),
      BLADE_FIELDS
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.description).toBe("Legendary blade.");
  });

  it("returns a null description when the field is empty", () => {
    const result = validateProposalForm(fd({ description: "" }), BLADE_FIELDS);
    if (!result.ok) throw new Error(result.error);
    expect(result.description).toBeNull();
  });
});

describe("applySpecProposal", () => {
  it("dispatches to the apply RPC with parsed values and returns ok", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, equipment_id: "eq-1" },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await applySpecProposal(
      supabase,
      "proposal-1",
      "reviewer-uuid",
      fd({
        "spec.weight": "89",
        "spec.plies_wood": "5",
        description: "Blurb.",
      }),
      BLADE_FIELDS
    );

    expect(rpc).toHaveBeenCalledWith("apply_spec_proposal", {
      p_id: "proposal-1",
      p_specifications: { weight: 89, plies_wood: 5 },
      p_description: "Blurb.",
      p_reviewer: "reviewer-uuid",
    });
    expect(result).toEqual({ ok: true, equipmentId: "eq-1" });
  });

  it("propagates a text_list value through to the RPC as an array", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, equipment_id: "eq-1" },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    await applySpecProposal(
      supabase,
      "p",
      "r",
      fd({
        "spec.sponge_thickness": "1.7, 1.9, 2.1",
        "spec.type": "tensor",
      }),
      RUBBER_FIELDS
    );

    expect(rpc).toHaveBeenCalledWith("apply_spec_proposal", {
      p_id: "p",
      p_specifications: {
        sponge_thickness: ["1.7", "1.9", "2.1"],
        type: "tensor",
      },
      p_description: null,
      p_reviewer: "r",
    });
  });

  it("returns the validation error without invoking the RPC", async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as unknown as SupabaseClient;
    const result = await applySpecProposal(
      supabase,
      "p",
      "r",
      fd({ "spec.weight": "heavy" }),
      BLADE_FIELDS
    );
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("propagates the RPC's ok=false envelope as an error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, error: "proposal already applied" },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;
    const result = await applySpecProposal(
      supabase,
      "p",
      "r",
      fd({}),
      BLADE_FIELDS
    );
    expect(result).toEqual({ ok: false, error: "proposal already applied" });
  });

  it("propagates a Postgres error verbatim", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "rls denied" },
    });
    const supabase = { rpc } as unknown as SupabaseClient;
    const result = await applySpecProposal(
      supabase,
      "p",
      "r",
      fd({}),
      BLADE_FIELDS
    );
    expect(result).toEqual({ ok: false, error: "rls denied" });
  });
});

describe("rejectSpecProposal", () => {
  it("dispatches to the reject RPC and returns ok", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, equipment_id: "eq-1" },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await rejectSpecProposal(supabase, "p", "r-uuid");
    expect(rpc).toHaveBeenCalledWith("reject_spec_proposal", {
      p_id: "p",
      p_reviewer: "r-uuid",
    });
    expect(result).toEqual({ ok: true, equipmentId: "eq-1" });
  });

  it("propagates the RPC's ok=false envelope as an error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: false, error: "proposal already rejected" },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;
    const result = await rejectSpecProposal(supabase, "p", "r");
    expect(result).toEqual({ ok: false, error: "proposal already rejected" });
  });
});
