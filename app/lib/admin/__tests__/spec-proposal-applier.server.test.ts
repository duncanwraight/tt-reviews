import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

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

describe("validateProposalForm", () => {
  it("parses numeric fields with their declared types (int vs float)", () => {
    const result = validateProposalForm(
      fd({
        "spec.weight": "89",
        "spec.thickness": "5.7",
        "spec.plies_wood": "5",
        "spec.plies_composite": "2",
        "spec.speed": "9.5",
      })
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
      })
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
      })
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
      })
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications.hardness).toEqual({ min: 47.5, max: 47.5 });
  });

  it("rejects hardness when only one bound is set", () => {
    const result = validateProposalForm(fd({ "spec.hardness.min": "40" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/hardness/);
    }
  });

  it("rejects hardness when min > max", () => {
    const result = validateProposalForm(
      fd({ "spec.hardness.min": "50", "spec.hardness.max": "40" })
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a non-numeric int field", () => {
    const result = validateProposalForm(fd({ "spec.weight": "heavy" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/weight/);
  });

  it("drops empty fields rather than writing null/empty values", () => {
    const result = validateProposalForm(
      fd({ "spec.weight": "", "spec.composite_material": "Arylate" })
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications).toEqual({ composite_material: "Arylate" });
  });

  it("ignores unknown spec.* fields (forward-compat)", () => {
    const result = validateProposalForm(
      fd({ "spec.weight": "89", "spec.something_new": "value" })
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.specifications).toEqual({ weight: 89 });
  });

  it("captures description verbatim and trims", () => {
    const result = validateProposalForm(
      fd({ description: "  Legendary blade.  " })
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.description).toBe("Legendary blade.");
  });

  it("returns a null description when the field is empty", () => {
    const result = validateProposalForm(fd({ description: "" }));
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
      })
    );

    expect(rpc).toHaveBeenCalledWith("apply_spec_proposal", {
      p_id: "proposal-1",
      p_specifications: { weight: 89, plies_wood: 5 },
      p_description: "Blurb.",
      p_reviewer: "reviewer-uuid",
    });
    expect(result).toEqual({ ok: true, equipmentId: "eq-1" });
  });

  it("returns the validation error without invoking the RPC", async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as unknown as SupabaseClient;
    const result = await applySpecProposal(
      supabase,
      "p",
      "r",
      fd({ "spec.weight": "heavy" })
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
    const result = await applySpecProposal(supabase, "p", "r", fd({}));
    expect(result).toEqual({ ok: false, error: "proposal already applied" });
  });

  it("propagates a Postgres error verbatim", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "rls denied" },
    });
    const supabase = { rpc } as unknown as SupabaseClient;
    const result = await applySpecProposal(supabase, "p", "r", fd({}));
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
