import { describe, it, expect } from "vitest";
import { SUBMISSION_REGISTRY } from "../registry";

/**
 * Per-type assertions on formatForDiscord output. Pins the canonical
 * card shape documented in `docs/CODING-STANDARDS.md` →
 * "Discord moderation cards":
 *
 *   1. Subject identifier first.
 *   2. Slug (when available) and submitter line.
 *   3. Values OR before→after diff.
 *   4. Reason (when applicable).
 *
 * Each test drives the formatter directly with the data shape the
 * enrichment helper merges into the notification payload — so we
 * assert what a Discord-only moderator actually sees, independent of
 * whether the database lookups inside enrichSubmissionForNotification
 * resolved.
 */

const findField = (
  fields: Array<{ name: string; value: string }>,
  name: string
) => fields.find(f => f.name === name);

describe("formatForDiscord — equipment", () => {
  it("renders the canonical field order with optional Subcategory", () => {
    const card = SUBMISSION_REGISTRY.equipment.formatForDiscord!({
      id: "sub-1",
      name: "Hurricane 3",
      manufacturer: "DHS",
      category: "rubber",
      subcategory: "inverted",
      submitter_email: "u@example.com",
      specifications: { speed: 9.5, hardness: { min: 38, max: 40 } },
      description: "Tacky topsheet",
    });

    expect(card.fields[0]).toMatchObject({
      name: "Equipment",
      value: "Hurricane 3",
    });
    // Submitted by line is always present.
    expect(findField(card.fields, "Submitted by")?.value).toBe("u@example.com");
    // Specs render with range as min–max.
    expect(findField(card.fields, "Specifications")?.value).toContain(
      "hardness: 38–40"
    );
  });
});

describe("formatForDiscord — player", () => {
  it("uses the friendly country name + flag when enriched", () => {
    const card = SUBMISSION_REGISTRY.player.formatForDiscord!({
      id: "sub-1",
      name: "Ma Long",
      birth_country: "CHN",
      represents: "CHN",
      birth_country_flag: "🇨🇳",
      birth_country_name: "China",
      represents_flag: "🇨🇳",
      represents_name: "China",
      submitter_email: "u@example.com",
    });
    expect(findField(card.fields, "Birth Country")?.value).toBe("🇨🇳 China");
    expect(findField(card.fields, "Represents")?.value).toBe("🇨🇳 China");
  });

  it("falls back to the raw 3-letter code when enrichment didn't resolve", () => {
    const card = SUBMISSION_REGISTRY.player.formatForDiscord!({
      id: "sub-1",
      name: "Unknown",
      birth_country: "XYZ",
      submitter_email: "u@example.com",
    });
    expect(findField(card.fields, "Birth Country")?.value).toBe("XYZ");
  });

  it("omits equipment + videos summary when the submission carries neither", () => {
    const card = SUBMISSION_REGISTRY.player.formatForDiscord!({
      id: "sub-1",
      name: "Ma Long",
      submitter_email: "u@example.com",
    });
    expect(findField(card.fields, "Blade")).toBeUndefined();
    expect(findField(card.fields, "Year")).toBeUndefined();
    expect(findField(card.fields, "Video Count")).toBeUndefined();
  });

  it("surfaces blade/rubber names + top-3 videos when the cascade data is present", () => {
    // TT-131: the player submission can now carry an equipment_setup
    // JSONB and a videos array. The enricher resolves blade/rubber
    // names off setup.{blade_id,...}; the formatter renders them.
    const card = SUBMISSION_REGISTRY.player.formatForDiscord!({
      id: "sub-1",
      name: "Ma Long",
      submitter_email: "u@example.com",
      equipment_setup: { year: 2024 },
      blade_name: "Viscaria",
      forehand_rubber_name: "Hurricane 3",
      forehand_thickness: "2.1mm",
      backhand_rubber_name: "Tenergy 05",
      backhand_thickness: "2.0mm",
      videos: [
        { title: "Final 2024", platform: "youtube" },
        { title: "Practice", platform: "youtube" },
        { title: "Interview", platform: "other" },
        { title: "Old clip", platform: "other" },
      ],
    });
    expect(findField(card.fields, "Year")?.value).toBe("2024");
    expect(findField(card.fields, "Blade")?.value).toBe("Viscaria");
    expect(findField(card.fields, "Forehand Rubber")?.value).toBe(
      "Hurricane 3 (2.1mm)"
    );
    expect(findField(card.fields, "Backhand Rubber")?.value).toBe(
      "Tenergy 05 (2.0mm)"
    );
    expect(findField(card.fields, "Video Count")?.value).toBe("4");
    expect(findField(card.fields, "Video 1")?.value).toBe(
      "Final 2024 (youtube)"
    );
    expect(findField(card.fields, "Video 3")?.value).toBe("Interview (other)");
    expect(findField(card.fields, "Additional Videos")?.value).toBe(
      "... and 1 more video(s)"
    );
  });
});

describe("formatForDiscord — player_edit", () => {
  it("renders before→after diff lines and surfaces the reason", () => {
    const card = SUBMISSION_REGISTRY.player_edit.formatForDiscord!({
      id: "sub-1",
      player_name: "Ma Long",
      player_current: {
        name: "Ma Long",
        slug: "ma-long",
        highest_rating: "3000",
        active: true,
      },
      submitter_email: "u@example.com",
      edit_data: {
        highest_rating: "3050",
        active: false,
        edit_reason: "rating bump after world tour",
      },
    });

    expect(card.fields[0]).toMatchObject({ name: "Player", value: "Ma Long" });
    expect(findField(card.fields, "Slug")?.value).toBe("ma-long");
    const changes = findField(card.fields, "Changes")?.value || "";
    expect(changes).toContain("**highest_rating**: 3000 → 3050");
    // Boolean rendered as Active/Inactive, not "true → false".
    expect(changes).toContain("**active**: Active → Inactive");
    expect(findField(card.fields, "Reason")?.value).toBe(
      "rating bump after world tour"
    );
  });

  it("omits the Slug field when the current player row didn't resolve", () => {
    const card = SUBMISSION_REGISTRY.player_edit.formatForDiscord!({
      id: "sub-1",
      submitter_email: "u@example.com",
      edit_data: { name: "New Name" },
    });
    expect(findField(card.fields, "Slug")).toBeUndefined();
  });
});

describe("formatForDiscord — video", () => {
  it("uses enriched player_name on the Player line", () => {
    const card = SUBMISSION_REGISTRY.video.formatForDiscord!({
      id: "sub-1",
      player_id: "p-1",
      player_name: "Ma Long",
      submitter_email: "u@example.com",
      videos: [
        { title: "Final 2024", platform: "YouTube" },
        { title: "Practice", platform: "Bilibili" },
      ],
    });
    expect(findField(card.fields, "Player")?.value).toBe("Ma Long");
  });

  it("falls back to 'Unknown Player' when enrichment didn't resolve", () => {
    const card = SUBMISSION_REGISTRY.video.formatForDiscord!({
      id: "sub-1",
      player_id: "p-deleted",
      submitter_email: "u@example.com",
    });
    expect(findField(card.fields, "Player")?.value).toBe("Unknown Player");
  });
});

describe("formatForDiscord — review", () => {
  it("surfaces per-category ratings + reviewer context", () => {
    const card = SUBMISSION_REGISTRY.review.formatForDiscord!({
      id: "sub-1",
      equipment_name: "Hurricane 3",
      overall_rating: 9,
      category_ratings: { speed: 9, control: 7, spin: 10 },
      reviewer_context: {
        playing_level: "advanced",
        experience_duration: "1_to_3_months",
      },
      review_text: "Tacky and fast",
      submitter_email: "u@example.com",
    });
    const ratings = findField(card.fields, "Category ratings")?.value || "";
    expect(ratings).toContain("speed: 9/10");
    expect(ratings).toContain("control: 7/10");
    expect(ratings).toContain("spin: 10/10");

    expect(findField(card.fields, "Reviewer context")?.value).toBe(
      "Level: Advanced • Experience: 1-3 months"
    );
  });

  it("omits the optional fields when category_ratings + context are absent", () => {
    const card = SUBMISSION_REGISTRY.review.formatForDiscord!({
      id: "sub-1",
      equipment_name: "Hurricane 3",
      overall_rating: 7,
      review_text: "Decent",
      submitter_email: "u@example.com",
    });
    expect(findField(card.fields, "Category ratings")).toBeUndefined();
    expect(findField(card.fields, "Reviewer context")).toBeUndefined();
  });
});

describe("formatForDiscord — player_equipment_setup", () => {
  it("renders enriched player + blade + rubber names", () => {
    const card = SUBMISSION_REGISTRY.player_equipment_setup.formatForDiscord!({
      id: "sub-1",
      player_name: "Ma Long",
      blade_name: "Viscaria",
      forehand_rubber_name: "Hurricane 3",
      forehand_thickness: "2.1mm",
      backhand_rubber_name: "Tenergy 05",
      backhand_thickness: "2.1mm",
      year: 2024,
      submitter_email: "u@example.com",
    });
    expect(findField(card.fields, "Player")?.value).toBe("Ma Long");
    expect(findField(card.fields, "Blade")?.value).toBe("Viscaria");
    expect(findField(card.fields, "Forehand Rubber")?.value).toBe(
      "Hurricane 3 (2.1mm)"
    );
    expect(findField(card.fields, "Backhand Rubber")?.value).toBe(
      "Tenergy 05 (2.1mm)"
    );
  });
});

describe("formatForDiscord — equipment_edit", () => {
  it("renders before→after diff lines and surfaces the reason", () => {
    const card = SUBMISSION_REGISTRY.equipment_edit.formatForDiscord!({
      id: "sub-1",
      equipment_name: "Hurricane 3",
      equipment_current: {
        name: "Hurricane 3",
        slug: "hurricane-3",
        description: "Tacky",
        specifications: { speed: 9.0 },
      },
      submitter_email: "u@example.com",
      edit_data: {
        description: "Tacky and fast",
        specifications: { speed: 9.5 },
        edit_reason: "manufacturer updated speed rating",
      },
    });
    expect(findField(card.fields, "Equipment")?.value).toBe("Hurricane 3");
    expect(findField(card.fields, "Slug")?.value).toBe("hurricane-3");
    const changes = findField(card.fields, "Changes")?.value || "";
    expect(changes).toContain("**description**: Tacky → Tacky and fast");
    expect(changes).toContain("**speed**: 9 → 9.5");
    expect(findField(card.fields, "Reason")?.value).toBe(
      "manufacturer updated speed rating"
    );
  });
});
