import { describe, it, expect } from "vitest";
import {
  validateSubmission,
  validateUrl,
  parseEquipmentSpecs,
} from "../validate.server";
import type { CategoryOption } from "~/lib/categories.server";

/**
 * SECURITY.md Phase 7 (TT-16). The submission action used to pass form
 * fields straight to a service-role insert with no size, type, or URL
 * checks. This suite pins the boundary-layer rejections that keep
 * oversize payloads out of the DB, `javascript:` / `data:` / SSRF URLs
 * out of stored source_url fields, and malformed UUIDs out of FK
 * columns.
 */

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("validateSubmission — review", () => {
  const valid = {
    equipment_id: VALID_UUID,
    playing_level: "intermediate",
    experience_duration: "1_to_3_months",
    overall_rating: "7.5",
    review_text: "Great rubber — good all-round feel.",
  };

  it("accepts a well-formed review payload", () => {
    const result = validateSubmission("review", fd(valid));
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("rejects a review_text larger than 5000 chars", () => {
    const result = validateSubmission(
      "review",
      fd({ ...valid, review_text: "x".repeat(5001) })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.review_text).toMatch(/5000/);
  });

  it("rejects a non-UUID equipment_id", () => {
    const result = validateSubmission(
      "review",
      fd({ ...valid, equipment_id: "not-a-uuid" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.equipment_id).toMatch(/UUID/);
  });

  it("rejects a playing_level outside the enum", () => {
    const result = validateSubmission(
      "review",
      fd({ ...valid, playing_level: "godlike" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.playing_level).toMatch(/beginner/);
  });

  it("rejects overall_rating outside 1..10", () => {
    const result = validateSubmission(
      "review",
      fd({ ...valid, overall_rating: "11" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.overall_rating).toMatch(/between/);
  });

  it("rejects a non-numeric overall_rating", () => {
    const result = validateSubmission(
      "review",
      fd({ ...valid, overall_rating: "high" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.overall_rating).toBeDefined();
  });

  it("reports missing required fields", () => {
    const result = validateSubmission("review", fd({}));
    expect(result.valid).toBe(false);
    expect(result.errors?.equipment_id).toMatch(/required/);
    expect(result.errors?.review_text).toMatch(/required/);
  });
});

describe("validateSubmission — player_equipment_setup (source_url)", () => {
  const base = { player_id: VALID_UUID };

  it("accepts an https source_url", () => {
    const result = validateSubmission(
      "player_equipment_setup",
      fd({ ...base, source_url: "https://example.com/story" })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    const result = validateSubmission(
      "player_equipment_setup",
      fd({ ...base, source_url: "javascript:alert(1)" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.source_url).toMatch(/https/);
  });

  it("rejects data: URLs", () => {
    const result = validateSubmission(
      "player_equipment_setup",
      fd({ ...base, source_url: "data:text/html,<script>alert(1)</script>" })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects plain http://", () => {
    const result = validateSubmission(
      "player_equipment_setup",
      fd({ ...base, source_url: "http://example.com" })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects private-network URLs (SSRF guard)", () => {
    const cases = [
      "https://localhost/secret",
      "https://127.0.0.1/foo",
      "https://10.0.0.5/foo",
      "https://192.168.1.1/foo",
      "https://172.16.0.1/foo",
      "https://169.254.169.254/latest/meta-data",
      "https://somehost.local/foo",
      "https://[::1]/foo",
    ];
    for (const url of cases) {
      const result = validateSubmission(
        "player_equipment_setup",
        fd({ ...base, source_url: url })
      );
      expect(result.valid, `should reject ${url}`).toBe(false);
    }
  });

  it("rejects a malformed URL", () => {
    const result = validateSubmission(
      "player_equipment_setup",
      fd({ ...base, source_url: "not-a-url" })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects URL over 2048 chars", () => {
    const longUrl =
      "https://example.com/" +
      "a".repeat(2048 - "https://example.com/".length + 10);
    const result = validateSubmission(
      "player_equipment_setup",
      fd({ ...base, source_url: longUrl })
    );
    expect(result.valid).toBe(false);
  });

  it("validates integer year range", () => {
    const bad = validateSubmission(
      "player_equipment_setup",
      fd({ ...base, year: "1800" })
    );
    expect(bad.valid).toBe(false);

    const decimal = validateSubmission(
      "player_equipment_setup",
      fd({ ...base, year: "2024.5" })
    );
    expect(decimal.valid).toBe(false);

    const good = validateSubmission(
      "player_equipment_setup",
      fd({ ...base, year: "2024" })
    );
    expect(good.valid).toBe(true);
  });
});

describe("validateSubmission — player_edit", () => {
  it("requires player_id + edit_reason", () => {
    const result = validateSubmission("player_edit", fd({}));
    expect(result.valid).toBe(false);
    expect(result.errors?.player_id).toBeDefined();
    expect(result.errors?.edit_reason).toBeDefined();
  });

  it("caps edit_reason at 2000 chars", () => {
    const result = validateSubmission(
      "player_edit",
      fd({
        player_id: VALID_UUID,
        edit_reason: "x".repeat(2001),
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.edit_reason).toMatch(/2000/);
  });

  it("rejects an out-of-enum active value", () => {
    const result = validateSubmission(
      "player_edit",
      fd({
        player_id: VALID_UUID,
        edit_reason: "fix",
        active: "maybe",
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.active).toMatch(/true|false/);
  });
});

describe("validateSubmission — equipment", () => {
  it("rejects a missing name", () => {
    const result = validateSubmission(
      "equipment",
      fd({ manufacturer: "DHS", category: "rubber" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.name).toMatch(/required/);
  });

  it("ignores raw `specifications` from formData (handled by parseEquipmentSpecs)", () => {
    // The freeform textarea is gone; if a stale client posts a stray
    // `specifications` text field it should not block validation.
    const result = validateSubmission(
      "equipment",
      fd({
        name: "Hurricane 3",
        manufacturer: "DHS",
        category: "rubber",
        specifications: "x".repeat(5001),
      })
    );
    expect(result.valid).toBe(true);
  });

  it("accepts an optional description within the 2000-char cap", () => {
    const result = validateSubmission(
      "equipment",
      fd({
        name: "Hurricane 3",
        manufacturer: "DHS",
        category: "rubber",
        description: "A crisp, fast rubber with excellent control.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("rejects a description longer than 2000 chars", () => {
    const result = validateSubmission(
      "equipment",
      fd({
        name: "Hurricane 3",
        manufacturer: "DHS",
        category: "rubber",
        description: "x".repeat(2001),
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.description).toMatch(/2000/);
  });
});

/**
 * parseEquipmentSpecs walks the spec_field metadata, reads `spec_*` form
 * fields, and emits typed JSONB matching archive/EQUIPMENT-SPECS.md.
 * scale_min / scale_max are display hints only — never enforced as bounds.
 */
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

describe("parseEquipmentSpecs", () => {
  it("parses int fields with whitespace and writes JSONB number", () => {
    const result = parseEquipmentSpecs(fd({ spec_weight: " 86 " }), [
      specField("weight", "int", { unit: "g" }),
    ]);
    expect(result.errors).toEqual({});
    expect(result.specifications).toEqual({ weight: 86 });
  });

  it("rejects non-integer in int field", () => {
    const result = parseEquipmentSpecs(fd({ spec_weight: "86.5" }), [
      specField("weight", "int"),
    ]);
    expect(result.errors.spec_weight).toMatch(/whole number/);
    expect(result.specifications.weight).toBeUndefined();
  });

  it("parses float fields", () => {
    const result = parseEquipmentSpecs(fd({ spec_thickness: "5.7" }), [
      specField("thickness", "float", { unit: "mm" }),
    ]);
    expect(result.errors).toEqual({});
    expect(result.specifications).toEqual({ thickness: 5.7 });
  });

  it("rejects garbage in float field", () => {
    const result = parseEquipmentSpecs(fd({ spec_thickness: "thick" }), [
      specField("thickness", "float"),
    ]);
    expect(result.errors.spec_thickness).toMatch(/number/);
  });

  it("does NOT enforce scale_min / scale_max as bounds", () => {
    // Per design doc: some manufacturers publish 12 on a 0-10 scale.
    const result = parseEquipmentSpecs(fd({ spec_speed: "12" }), [
      specField("speed", "float", { scale_min: 0, scale_max: 10 }),
    ]);
    expect(result.errors).toEqual({});
    expect(result.specifications).toEqual({ speed: 12 });
  });

  it("collapses range with min-only into {min, max:min}", () => {
    const result = parseEquipmentSpecs(fd({ spec_hardness_min: "40" }), [
      specField("hardness", "range"),
    ]);
    expect(result.errors).toEqual({});
    expect(result.specifications).toEqual({ hardness: { min: 40, max: 40 } });
  });

  it("parses range with both min and max", () => {
    const result = parseEquipmentSpecs(
      fd({ spec_hardness_min: "40", spec_hardness_max: "42" }),
      [specField("hardness", "range")]
    );
    expect(result.errors).toEqual({});
    expect(result.specifications).toEqual({ hardness: { min: 40, max: 42 } });
  });

  it("rejects range with min > max", () => {
    const result = parseEquipmentSpecs(
      fd({ spec_hardness_min: "50", spec_hardness_max: "40" }),
      [specField("hardness", "range")]
    );
    expect(result.errors.spec_hardness).toMatch(/max/);
    expect(result.specifications.hardness).toBeUndefined();
  });

  it("rejects range with only max", () => {
    const result = parseEquipmentSpecs(fd({ spec_hardness_max: "42" }), [
      specField("hardness", "range"),
    ]);
    expect(result.errors.spec_hardness).toMatch(/minimum/);
  });

  it("passes through text fields trimmed", () => {
    const result = parseEquipmentSpecs(
      fd({ spec_material: "  Arylate Carbon  " }),
      [specField("material", "text")]
    );
    expect(result.errors).toEqual({});
    expect(result.specifications).toEqual({ material: "Arylate Carbon" });
  });

  it("caps text field length", () => {
    const result = parseEquipmentSpecs(fd({ spec_material: "x".repeat(201) }), [
      specField("material", "text"),
    ]);
    expect(result.errors.spec_material).toMatch(/200/);
  });

  it("plies: wood-only blade omits plies_composite", () => {
    const result = parseEquipmentSpecs(fd({ spec_plies_wood: "5" }), [
      specField("plies_wood", "int"),
      specField("plies_composite", "int"),
    ]);
    expect(result.errors).toEqual({});
    expect(result.specifications).toEqual({ plies_wood: 5 });
  });

  it("plies: composite blade has both fields", () => {
    const result = parseEquipmentSpecs(
      fd({ spec_plies_wood: "5", spec_plies_composite: "2" }),
      [specField("plies_wood", "int"), specField("plies_composite", "int")]
    );
    expect(result.errors).toEqual({});
    expect(result.specifications).toEqual({
      plies_wood: 5,
      plies_composite: 2,
    });
  });

  it("plies: composite without wood is rejected", () => {
    const result = parseEquipmentSpecs(fd({ spec_plies_composite: "2" }), [
      specField("plies_wood", "int"),
      specField("plies_composite", "int"),
    ]);
    expect(result.errors.spec_plies_wood).toMatch(/Wood plies are required/);
  });

  it("empty payload yields empty specifications and no errors", () => {
    const result = parseEquipmentSpecs(fd({}), [
      specField("weight", "int"),
      specField("hardness", "range"),
      specField("material", "text"),
    ]);
    expect(result.errors).toEqual({});
    expect(result.specifications).toEqual({});
  });

  it("dedupes spec keys that appear under multiple parents", () => {
    // `speed` exists under blade + every rubber subcategory; the parser
    // must not double-write or error on the duplicate metadata.
    const speed = specField("speed", "float", { scale_min: 0, scale_max: 10 });
    const result = parseEquipmentSpecs(fd({ spec_speed: "9.5" }), [
      speed,
      speed,
      speed,
    ]);
    expect(result.errors).toEqual({});
    expect(result.specifications).toEqual({ speed: 9.5 });
  });
});

describe("validateUrl helper", () => {
  it("accepts a well-formed https URL", () => {
    expect(validateUrl("https://example.com/path", true, 2048)).toBeNull();
  });

  it("rejects javascript: regardless of scheme requirements", () => {
    expect(validateUrl("javascript:alert(1)", false, 2048)).not.toBeNull();
  });

  it("accepts http:// when requireHttps is false", () => {
    expect(validateUrl("http://example.com", false, 2048)).toBeNull();
  });

  it("still rejects private hosts when requireHttps is false", () => {
    expect(validateUrl("http://127.0.0.1", false, 2048)).not.toBeNull();
  });
});
