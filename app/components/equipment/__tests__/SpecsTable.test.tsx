// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpecsTable } from "../SpecsTable";
import type { CategoryOption } from "~/lib/categories.server";
import type { ComparisonItem } from "../comparison-types";

function specField(
  partial: Pick<CategoryOption, "name" | "value" | "field_type"> &
    Partial<CategoryOption>
): CategoryOption {
  return {
    id: `field-${partial.value}`,
    display_order: 0,
    ...partial,
  };
}

function item(
  id: string,
  name: string,
  specifications: Record<string, unknown>
): ComparisonItem {
  return {
    equipment: {
      id,
      name,
      slug: id,
      category: "rubber",
      subcategory: "inverted",
      manufacturer: "Test",
      specifications,
      created_at: "",
      updated_at: "",
    },
    averageRating: 0,
    reviewCount: 0,
    reviews: [],
    usedByPlayers: [],
  };
}

function equipmentNamesInOrder(): string[] {
  const headers = screen.getAllByTestId("specs-table-equipment-header");
  return headers.map(h => h.textContent?.trim() ?? "");
}

describe("SpecsTable sorting", () => {
  it("single-item table has no sort affordance on numeric rows", () => {
    const fields = [
      specField({ name: "Speed", value: "speed", field_type: "float" }),
    ];
    const items = [item("a", "A", { speed: 8.5 })];
    render(<SpecsTable items={items} specFields={fields} />);
    expect(screen.queryByTestId("specs-table-sort-speed")).toBeNull();
  });

  it("text rows have no sort affordance", () => {
    const fields = [
      specField({ name: "Topsheet", value: "topsheet", field_type: "text" }),
    ];
    const items = [
      item("a", "A", { topsheet: "Tacky" }),
      item("b", "B", { topsheet: "Natural" }),
    ];
    render(<SpecsTable items={items} specFields={fields} />);
    expect(screen.queryByTestId("specs-table-sort-topsheet")).toBeNull();
  });

  it("clicking a numeric row sorts ascending, then descending", async () => {
    const user = userEvent.setup();
    const fields = [
      specField({
        name: "Speed",
        value: "speed",
        field_type: "float",
        scale_min: 0,
        scale_max: 10,
      }),
    ];
    const items = [
      item("dhs", "DHS NEO Hurricane 3", { speed: 8.5 }),
      item("yas", "Yasaka Mark V", { speed: 8.0 }),
    ];
    render(<SpecsTable items={items} specFields={fields} />);

    expect(equipmentNamesInOrder()).toEqual([
      "DHS NEO Hurricane 3",
      "Yasaka Mark V",
    ]);

    await user.click(screen.getByTestId("specs-table-sort-speed"));
    expect(equipmentNamesInOrder()).toEqual([
      "Yasaka Mark V",
      "DHS NEO Hurricane 3",
    ]);

    await user.click(screen.getByTestId("specs-table-sort-speed"));
    expect(equipmentNamesInOrder()).toEqual([
      "DHS NEO Hurricane 3",
      "Yasaka Mark V",
    ]);
  });

  it("sets aria-sort on the active row", async () => {
    const user = userEvent.setup();
    const fields = [
      specField({
        name: "Weight",
        value: "weight",
        field_type: "int",
        unit: "g",
      }),
    ];
    const items = [
      item("a", "A", { weight: 86 }),
      item("b", "B", { weight: 90 }),
    ];
    render(<SpecsTable items={items} specFields={fields} />);

    const rowHeader = screen.getByRole("rowheader", { name: /Weight/ });
    expect(rowHeader.getAttribute("aria-sort")).toBe("none");

    await user.click(within(rowHeader).getByRole("button"));
    expect(rowHeader.getAttribute("aria-sort")).toBe("ascending");

    await user.click(within(rowHeader).getByRole("button"));
    expect(rowHeader.getAttribute("aria-sort")).toBe("descending");
  });

  it("sorts range fields by min, with max as tiebreaker", async () => {
    const user = userEvent.setup();
    const fields = [
      specField({ name: "Hardness", value: "hardness", field_type: "range" }),
    ];
    // Same min (40); B has wider max (42). asc => A first, desc => B first.
    const items = [
      item("a", "A", { hardness: { min: 40, max: 40 } }),
      item("b", "B", { hardness: { min: 40, max: 42 } }),
    ];
    render(<SpecsTable items={items} specFields={fields} />);

    await user.click(screen.getByTestId("specs-table-sort-hardness"));
    expect(equipmentNamesInOrder()).toEqual(["A", "B"]);

    await user.click(screen.getByTestId("specs-table-sort-hardness"));
    expect(equipmentNamesInOrder()).toEqual(["B", "A"]);
  });

  it("missing values sort last in both directions", async () => {
    const user = userEvent.setup();
    const fields = [
      specField({ name: "Speed", value: "speed", field_type: "float" }),
    ];
    const items = [
      item("a", "A", { speed: 8.5 }),
      item("b", "B", {}), // no speed value
      item("c", "C", { speed: 9.0 }),
    ];
    render(<SpecsTable items={items} specFields={fields} />);

    // asc: A (8.5), C (9.0), B (missing)
    await user.click(screen.getByTestId("specs-table-sort-speed"));
    expect(equipmentNamesInOrder()).toEqual(["A", "C", "B"]);

    // desc: C (9.0), A (8.5), B (missing — still last)
    await user.click(screen.getByTestId("specs-table-sort-speed"));
    expect(equipmentNamesInOrder()).toEqual(["C", "A", "B"]);
  });

  it("plies sorts by wood first, then composite (NULL last)", async () => {
    const user = userEvent.setup();
    const fields = [
      specField({
        name: "Plies (wood)",
        value: "plies_wood",
        field_type: "int",
      }),
      specField({
        name: "Plies (composite)",
        value: "plies_composite",
        field_type: "int",
      }),
    ];
    const items = [
      // Same wood (5); A has composite, B doesn't. asc → B first (NULL last? No — NULL last means B is LAST).
      // Actually with same primary, secondary tiebreak applies and NULL secondary sorts last.
      item("a", "A", { plies_wood: 5, plies_composite: 2 }),
      item("b", "B", { plies_wood: 5 }),
      item("c", "C", { plies_wood: 7, plies_composite: 0 }),
    ];
    render(<SpecsTable items={items} specFields={fields} />);

    // asc by primary: 5, 5, 7. Tie on 5 → A (composite=2) before B (composite NULL). Then C.
    await user.click(screen.getByTestId("specs-table-sort-plies_wood"));
    expect(equipmentNamesInOrder()).toEqual(["A", "B", "C"]);

    // desc: 7 (C), then ties on 5 → A (composite=2) and B (NULL). NULL secondary always last.
    await user.click(screen.getByTestId("specs-table-sort-plies_wood"));
    expect(equipmentNamesInOrder()).toEqual(["C", "A", "B"]);
  });

  it("switching to a different sortable row resets to ascending", async () => {
    const user = userEvent.setup();
    const fields = [
      specField({ name: "Speed", value: "speed", field_type: "float" }),
      specField({ name: "Spin", value: "spin", field_type: "float" }),
    ];
    const items = [
      item("a", "A", { speed: 9, spin: 7 }),
      item("b", "B", { speed: 8, spin: 8 }),
    ];
    render(<SpecsTable items={items} specFields={fields} />);

    // Speed asc → B (8), A (9). Then desc.
    await user.click(screen.getByTestId("specs-table-sort-speed"));
    await user.click(screen.getByTestId("specs-table-sort-speed"));
    expect(equipmentNamesInOrder()).toEqual(["A", "B"]);

    // Switch to Spin: should restart ascending → A (7), B (8).
    await user.click(screen.getByTestId("specs-table-sort-spin"));
    expect(equipmentNamesInOrder()).toEqual(["A", "B"]);
    const spinHeader = screen.getByRole("rowheader", { name: /Spin/ });
    expect(spinHeader.getAttribute("aria-sort")).toBe("ascending");
    const speedHeader = screen.getByRole("rowheader", { name: /Speed/ });
    expect(speedHeader.getAttribute("aria-sort")).toBe("none");
  });
});
