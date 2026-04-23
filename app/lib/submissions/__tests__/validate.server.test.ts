import { describe, it, expect } from "vitest";
import { validateSubmission, validateUrl } from "../validate.server";

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
  it("caps specifications (textarea) at 5000 chars", () => {
    const result = validateSubmission(
      "equipment",
      fd({
        name: "Hurricane 3",
        manufacturer: "DHS",
        category: "rubber",
        specifications: "x".repeat(5001),
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.specifications).toMatch(/5000/);
  });

  it("rejects a missing name", () => {
    const result = validateSubmission(
      "equipment",
      fd({ manufacturer: "DHS", category: "rubber" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors?.name).toMatch(/required/);
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
