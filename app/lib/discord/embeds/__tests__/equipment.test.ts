import { describe, expect, it } from "vitest";
import { renderEquipmentEmbed } from "../equipment";
import type { EquipmentEmbedInput } from "../types";

const SITE = "https://tabletennis.reviews";

function baseInput(
  over: Partial<EquipmentEmbedInput> = {}
): EquipmentEmbedInput {
  return {
    name: "Viscaria",
    manufacturer: "Butterfly",
    slug: "butterfly-viscaria",
    siteUrl: SITE,
    ...over,
  };
}

describe("renderEquipmentEmbed", () => {
  it("populates title, link, and author for a fully-specified row", () => {
    const embed = renderEquipmentEmbed(
      baseInput({
        description: "5-ply ALC blade favoured by Lin Yun-Ju and others.",
        imageKey: "equipment/butterfly-viscaria.webp",
        specifications: {
          weight: 86,
          thickness: 5.7,
          plies_wood: 5,
          plies_composite: null,
          material: "Arylate Carbon",
          speed: 9.8,
          control: 8.3,
        },
        reviewStats: { rating: 8.4, count: 37 },
      })
    );

    expect(embed.title).toBe("Viscaria");
    expect(embed.url).toBe(`${SITE}/equipment/butterfly-viscaria`);
    expect(embed.author).toEqual({ name: "Butterfly" });
    expect(embed.thumbnail?.url).toMatch(
      /^https:\/\/tabletennis\.reviews\/cdn-cgi\/image\/.+\/api\/images\/equipment\/butterfly-viscaria\.webp$/
    );
    expect(embed.description).toBe(
      "5-ply ALC blade favoured by Lin Yun-Ju and others."
    );
    expect(embed.footer?.text).toBe(
      "tabletennis.reviews/equipment/butterfly-viscaria"
    );

    // Manufacturer specs field is present and includes the units / labels.
    const specsField = embed.fields?.find(f => f.name === "Manufacturer specs");
    expect(specsField).toBeDefined();
    expect(specsField!.value).toContain("**Weight:** 86g");
    expect(specsField!.value).toContain("**Thickness:** 5.7mm");
    expect(specsField!.value).toContain("**Material:** Arylate Carbon");

    // plies_composite is null in the input — should be skipped.
    expect(specsField!.value).not.toContain("Plies (composite)");

    const reviewsField = embed.fields?.find(f => f.name === "Reviews");
    expect(reviewsField?.value).toBe("★★★★☆ 4.2 (37 reviews)");
  });

  it("omits thumbnail when image_key is null", () => {
    const embed = renderEquipmentEmbed(baseInput({ imageKey: null }));
    expect(embed.thumbnail).toBeUndefined();
  });

  it("omits thumbnail when image_key is undefined (treated identically)", () => {
    const embed = renderEquipmentEmbed(baseInput());
    expect(embed.thumbnail).toBeUndefined();
  });

  it("omits the Reviews field when count is 0", () => {
    const embed = renderEquipmentEmbed(
      baseInput({ reviewStats: { rating: 0, count: 0 } })
    );
    const reviewsField = embed.fields?.find(f => f.name === "Reviews");
    expect(reviewsField).toBeUndefined();
  });

  it("omits the Reviews field when reviewStats is undefined", () => {
    const embed = renderEquipmentEmbed(baseInput());
    const reviewsField = embed.fields?.find(f => f.name === "Reviews");
    expect(reviewsField).toBeUndefined();
  });

  it("renders all 12 typed spec fields, including hardness range", () => {
    const embed = renderEquipmentEmbed(
      baseInput({
        name: "Tenergy 05",
        manufacturer: "Butterfly",
        slug: "butterfly-tenergy-05",
        specifications: {
          // Blade-side
          weight: 90,
          thickness: 5.8,
          plies_wood: 5,
          plies_composite: 2,
          material: "ALC",
          // Rubber-side
          speed: 9.7,
          control: 8.3,
          spin: 9.9,
          sponge: "Spring Sponge",
          topsheet: "High Tension",
          hardness: { min: 36, max: 38 },
          year: "2008",
        },
      })
    );
    const specsField = embed.fields?.find(f => f.name === "Manufacturer specs");
    expect(specsField).toBeDefined();
    const v = specsField!.value;
    expect(v).toContain("**Weight:** 90g");
    expect(v).toContain("**Thickness:** 5.8mm");
    expect(v).toContain("**Plies (wood):** 5");
    expect(v).toContain("**Plies (composite):** 2");
    expect(v).toContain("**Material:** ALC");
    expect(v).toContain("**Speed:** 9.7");
    expect(v).toContain("**Control:** 8.3");
    expect(v).toContain("**Spin:** 9.9");
    expect(v).toContain("**Sponge:** Spring Sponge");
    expect(v).toContain("**Topsheet:** High Tension");
    expect(v).toContain("**Hardness:** 36–38");
    expect(v).toContain("**Year:** 2008");
  });

  it("renders a single-value hardness without a dash", () => {
    const embed = renderEquipmentEmbed(
      baseInput({
        specifications: { hardness: { min: 47.5, max: 47.5 } },
      })
    );
    const specsField = embed.fields?.find(f => f.name === "Manufacturer specs");
    expect(specsField?.value).toContain("**Hardness:** 47.5");
    expect(specsField?.value).not.toContain("–"); // en dash
  });

  it("only renders specs that are present (sparse data)", () => {
    const embed = renderEquipmentEmbed(
      baseInput({ specifications: { weight: 85, thickness: 5.6 } })
    );
    const specsField = embed.fields?.find(f => f.name === "Manufacturer specs");
    expect(specsField).toBeDefined();
    const lines = specsField!.value.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines).toContain("**Weight:** 85g");
    expect(lines).toContain("**Thickness:** 5.6mm");
  });

  it("omits the spec field entirely when specifications is null/undefined", () => {
    const embed = renderEquipmentEmbed(baseInput({ specifications: null }));
    const specsField = embed.fields?.find(f => f.name === "Manufacturer specs");
    expect(specsField).toBeUndefined();
  });

  it("truncates descriptions longer than 200 chars with an ellipsis", () => {
    const long = "x".repeat(250);
    const embed = renderEquipmentEmbed(baseInput({ description: long }));
    expect(embed.description).toHaveLength(200);
    expect(embed.description!.endsWith("…")).toBe(true);
  });

  it("leaves descriptions <=200 chars unchanged", () => {
    const exact = "y".repeat(200);
    const embed = renderEquipmentEmbed(baseInput({ description: exact }));
    expect(embed.description).toBe(exact);
  });

  it("omits the description when it's blank or whitespace-only", () => {
    expect(
      renderEquipmentEmbed(baseInput({ description: "" })).description
    ).toBeUndefined();
    expect(
      renderEquipmentEmbed(baseInput({ description: "   " })).description
    ).toBeUndefined();
  });

  it("rejects non-numeric numeric fields rather than rendering them", () => {
    const embed = renderEquipmentEmbed(
      baseInput({
        specifications: {
          // String values for numeric fields are old pre-TT-72 data; the
          // C2 contract says renderer takes typed input, so it's safe to
          // skip them silently rather than half-rendering "86g" → "86gg".
          weight: "86g",
          thickness: 5.7,
        },
      })
    );
    const specsField = embed.fields?.find(f => f.name === "Manufacturer specs");
    expect(specsField?.value).not.toContain("Weight");
    expect(specsField?.value).toContain("**Thickness:** 5.7mm");
  });
});
