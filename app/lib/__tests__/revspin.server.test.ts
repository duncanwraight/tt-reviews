import { describe, expect, it } from "vitest";

import { listItemToProduct, type RevspinCategory } from "../revspin.server";

// TT-237: the admin equipment-import page lets an operator pick a tab
// (blade / rubber / pips_short / pips_medium / pips_long / anti) and
// fetch a list of products from revspin.net for staged import. Each tab
// implies a (db category, db subcategory) pair that must round-trip
// through `listItemToProduct` — those mappings are the bit users see
// when a fetched row lands in the equipment table. Lock the wiring so
// adding a sixth category (or accidentally dropping one) is a test
// failure, not a silent "everything imports as inverted" production
// surprise.
describe("listItemToProduct — category → (db category, subcategory) mapping", () => {
  const cases: Array<{
    category: RevspinCategory;
    expectedCategory: "blade" | "rubber";
    expectedSubcategory: string | undefined;
  }> = [
    {
      category: "blade",
      expectedCategory: "blade",
      expectedSubcategory: undefined,
    },
    {
      category: "rubber",
      expectedCategory: "rubber",
      expectedSubcategory: "inverted",
    },
    {
      category: "pips_short",
      expectedCategory: "rubber",
      expectedSubcategory: "short_pips",
    },
    {
      category: "pips_medium",
      expectedCategory: "rubber",
      expectedSubcategory: "medium_pips",
    },
    {
      category: "pips_long",
      expectedCategory: "rubber",
      expectedSubcategory: "long_pips",
    },
    {
      category: "anti",
      expectedCategory: "rubber",
      expectedSubcategory: "anti",
    },
  ];

  for (const { category, expectedCategory, expectedSubcategory } of cases) {
    it(`maps ${category} → ${expectedCategory}/${expectedSubcategory ?? "—"}`, () => {
      const product = listItemToProduct(
        {
          // Manufacturer parsing requires a known brand prefix — Butterfly
          // is in the hardcoded brand list at the top of revspin.server.ts.
          name: "Butterfly Test Product",
          slug: "butterfly-test-product",
          url: "https://revspin.net/rubber/butterfly-test-product.html",
        },
        category
      );
      expect(product).not.toBeNull();
      expect(product!.category).toBe(expectedCategory);
      expect(product!.subcategory).toBe(expectedSubcategory);
    });
  }
});
