// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EquipmentSpecsField } from "../EquipmentSpecsField";
import type { CategoryOption } from "~/lib/categories.server";

function specField(
  value: string,
  field_type: CategoryOption["field_type"],
  extra: Partial<CategoryOption> = {}
): CategoryOption {
  return {
    id: `id-${value}`,
    name: extra.name ?? value,
    value,
    display_order: 0,
    field_type,
    ...extra,
  };
}

const bladeFields: CategoryOption[] = [
  specField("thickness", "float", { name: "Thickness", unit: "mm" }),
  specField("weight", "int", { name: "Weight", unit: "g" }),
  specField("plies_wood", "int", { name: "Wood plies" }),
  specField("plies_composite", "int", { name: "Composite plies" }),
  specField("material", "text", { name: "Material" }),
];

const invertedFields: CategoryOption[] = [
  specField("hardness", "range", { name: "Hardness" }),
  specField("speed", "float", {
    name: "Speed",
    scale_min: 0,
    scale_max: 10,
  }),
];

describe("EquipmentSpecsField", () => {
  it("prompts for a category when nothing is selected", () => {
    render(
      <EquipmentSpecsField
        specFieldsByParent={{ blade: bladeFields }}
        values={{}}
        onChange={vi.fn()}
      />
    );
    expect(
      screen.getByText(
        /Select a category to enter manufacturer specifications/i
      )
    ).toBeInTheDocument();
  });

  it("renders blade fields when category=blade is selected", () => {
    render(
      <EquipmentSpecsField
        specFieldsByParent={{ blade: bladeFields }}
        category="blade"
        values={{}}
        onChange={vi.fn()}
      />
    );
    // Unit suffixed in label
    expect(screen.getByLabelText("Thickness (mm)")).toBeInTheDocument();
    expect(screen.getByLabelText("Weight (g)")).toBeInTheDocument();
    expect(screen.getByLabelText("Material")).toBeInTheDocument();
  });

  it("collapses plies_wood + plies_composite into one combined control", () => {
    render(
      <EquipmentSpecsField
        specFieldsByParent={{ blade: bladeFields }}
        category="blade"
        values={{}}
        onChange={vi.fn()}
      />
    );
    // Combined header is rendered once.
    expect(
      screen.getByText(/Plies \(wood \+ composite\)/i)
    ).toBeInTheDocument();
    // Both sub-inputs exist with the spec_* names.
    expect(screen.getByLabelText("Wood plies")).toHaveAttribute(
      "name",
      "spec_plies_wood"
    );
    expect(screen.getByLabelText("Composite plies")).toHaveAttribute(
      "name",
      "spec_plies_composite"
    );
  });

  it("renders range fields with paired min/max inputs", () => {
    render(
      <EquipmentSpecsField
        specFieldsByParent={{ inverted: invertedFields }}
        category="rubber"
        subcategory="inverted"
        values={{}}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Hardness minimum")).toHaveAttribute(
      "name",
      "spec_hardness_min"
    );
    expect(screen.getByLabelText("Hardness maximum")).toHaveAttribute(
      "name",
      "spec_hardness_max"
    );
  });

  it("subcategory takes precedence over category for spec lookup", () => {
    render(
      <EquipmentSpecsField
        specFieldsByParent={{
          blade: bladeFields,
          inverted: invertedFields,
        }}
        category="rubber"
        subcategory="inverted"
        values={{}}
        onChange={vi.fn()}
      />
    );
    // Inverted-specific field rendered, blade-only field absent.
    expect(screen.getByLabelText("Hardness minimum")).toBeInTheDocument();
    expect(screen.queryByLabelText("Thickness (mm)")).not.toBeInTheDocument();
  });

  // Supabase returns NULL JSONB columns as `null`, not `undefined`. The
  // first attempt guarded with `!== undefined` and rendered "null–null"
  // for fields like thickness/weight that have no scale hint configured.
  it("does not render a 'null-null' placeholder when scale hints are absent", () => {
    render(
      <EquipmentSpecsField
        specFieldsByParent={{ blade: bladeFields }}
        category="blade"
        values={{}}
        onChange={vi.fn()}
      />
    );
    const thickness = screen.getByLabelText("Thickness (mm)");
    expect(thickness).not.toHaveAttribute("placeholder");
    const weight = screen.getByLabelText("Weight (g)");
    expect(weight).not.toHaveAttribute("placeholder");
  });

  it("uses scale_min/max as a placeholder hint, not a hard cap", () => {
    render(
      <EquipmentSpecsField
        specFieldsByParent={{ inverted: invertedFields }}
        category="rubber"
        subcategory="inverted"
        values={{}}
        onChange={vi.fn()}
      />
    );
    const speedInput = screen.getByLabelText("Speed");
    // Display hint is in the placeholder; no max attribute is set.
    expect(speedInput).toHaveAttribute("placeholder", "0–10");
    expect(speedInput).not.toHaveAttribute("max");
  });

  it("surfaces inline errors keyed by spec_<field>", () => {
    render(
      <EquipmentSpecsField
        specFieldsByParent={{ blade: bladeFields }}
        category="blade"
        values={{}}
        onChange={vi.fn()}
        errors={{ spec_weight: "Weight must be a whole number" }}
      />
    );
    expect(
      screen.getByText("Weight must be a whole number")
    ).toBeInTheDocument();
  });

  it("falls back to a friendly message when the parent has no spec fields", () => {
    render(
      <EquipmentSpecsField
        specFieldsByParent={{ blade: bladeFields }}
        category="ball"
        values={{}}
        onChange={vi.fn()}
      />
    );
    expect(
      screen.getByText(/No specification fields configured for this category/i)
    ).toBeInTheDocument();
  });
});
