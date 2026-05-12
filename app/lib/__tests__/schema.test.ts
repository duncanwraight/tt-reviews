import { describe, it, expect } from "vitest";
import { SchemaService } from "../schema";

describe("SchemaService.toJsonLd", () => {
  const svc = new SchemaService("https://example.test");

  it("escapes `<` so a review body cannot close the script tag", () => {
    const payload = svc.toJsonLd({
      "@context": "https://schema.org",
      "@type": "Review",
      reviewBody: "</script><img src=x onerror=alert(1)>",
    });

    // The literal substring `</script>` must never appear in the rendered JSON.
    expect(payload).not.toContain("</script>");
    // It should appear in escaped form instead.
    expect(payload).toContain("\\u003c/script");
  });

  it("escapes `<` inside nested Review arrays on a Product schema", () => {
    const payload = svc.generateEquipmentSchema({
      name: "Blade",
      slug: "blade",
      manufacturer: "Acme",
      category: "blade",
      averageRating: 4.5,
      reviewCount: 1,
      reviews: [
        {
          id: "1",
          overall_rating: 5,
          review_text: "</script><svg/onload=alert(1)>",
          created_at: "2026-01-01",
          user: { name: "Tester" },
        },
      ],
    });

    const jsonLd = svc.toJsonLd(payload);
    expect(jsonLd).not.toContain("</script>");
    expect(jsonLd).not.toContain("<svg");
    expect(jsonLd).toContain("\\u003c");
  });

  it("round-trips valid schema content through JSON parsing", () => {
    const payload = svc.toJsonLd({
      "@context": "https://schema.org",
      "@type": "Review",
      reviewBody: "</script>tricky",
    });

    // Browsers parse the <script type="application/ld+json"> body as
    // JSON, and < decodes back to `<`. So a valid JSON parse must
    // still succeed and return the original string.
    const parsed: any = JSON.parse(payload);
    expect(parsed.reviewBody).toBe("</script>tricky");
  });
});

describe("SchemaService.generateEquipmentSchema", () => {
  const svc = new SchemaService("https://example.test");

  const base = {
    name: "Tenergy 05",
    slug: "butterfly-tenergy-05",
    manufacturer: "Butterfly",
    category: "rubber",
  };

  it("returns null when neither specs nor reviews exist", () => {
    expect(svc.generateEquipmentSchema(base)).toBeNull();
    expect(
      svc.generateEquipmentSchema({ ...base, specifications: {} })
    ).toBeNull();
    expect(
      svc.generateEquipmentSchema({ ...base, specifications: null })
    ).toBeNull();
    // Reviews array present but empty also counts as "no reviews".
    expect(svc.generateEquipmentSchema({ ...base, reviews: [] })).toBeNull();
  });

  it("emits a Product with image + additionalProperty for specs-only items", () => {
    const schema = svc.generateEquipmentSchema({
      ...base,
      image: "https://example.test/cdn-cgi/image/width=1024/api/images/key.jpg",
      specifications: {
        speed: 9.7,
        spin: 9.9,
        control: 8.3,
      },
    });

    expect(schema).not.toBeNull();
    expect(schema!.image).toBe(
      "https://example.test/cdn-cgi/image/width=1024/api/images/key.jpg"
    );
    expect(schema!.additionalProperty).toEqual([
      { "@type": "PropertyValue", name: "speed", value: 9.7 },
      { "@type": "PropertyValue", name: "spin", value: 9.9 },
      { "@type": "PropertyValue", name: "control", value: 8.3 },
    ]);
    // No reviews → no rating/review fields.
    expect(schema!.aggregateRating).toBeUndefined();
    expect(schema!.review).toBeUndefined();
  });

  it("maps range specs to minValue/maxValue and lifts material/weight to first-class fields", () => {
    const schema = svc.generateEquipmentSchema({
      ...base,
      specifications: {
        hardness: { min: 36, max: 42 },
        material: "Arylate Carbon",
        weight: 86,
        sponge: "Spring Sponge",
      },
    });

    expect(schema!.material).toBe("Arylate Carbon");
    expect(schema!.weight).toEqual({
      "@type": "QuantitativeValue",
      value: 86,
      unitCode: "GRM",
    });
    expect(schema!.additionalProperty).toEqual([
      {
        "@type": "PropertyValue",
        name: "hardness",
        minValue: 36,
        maxValue: 42,
      },
      { "@type": "PropertyValue", name: "sponge", value: "Spring Sponge" },
    ]);
  });

  it("emits aggregateRating + review for items with reviews", () => {
    const schema = svc.generateEquipmentSchema({
      ...base,
      averageRating: 4.5,
      reviewCount: 2,
      reviews: [
        {
          id: "1",
          overall_rating: 5,
          review_text: "Great rubber",
          created_at: "2026-01-01",
          user: { name: "Alice" },
        },
        {
          id: "2",
          overall_rating: 4,
          review_text: "Good",
          created_at: "2026-02-01",
          user: { name: "Bob" },
        },
      ],
    });

    expect(schema!.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.5,
      reviewCount: 2,
      bestRating: 5,
      worstRating: 1,
    });
    expect(schema!.review).toHaveLength(2);
    expect(schema!.review![0].author.name).toBe("Alice");
  });

  it("combines specs + reviews when both exist", () => {
    const schema = svc.generateEquipmentSchema({
      ...base,
      image: "https://example.test/img.jpg",
      specifications: { speed: 9.7 },
      averageRating: 5,
      reviewCount: 1,
      reviews: [
        {
          id: "1",
          overall_rating: 5,
          review_text: "",
          created_at: "2026-01-01",
        },
      ],
    });

    expect(schema!.image).toBe("https://example.test/img.jpg");
    expect(schema!.additionalProperty).toHaveLength(1);
    expect(schema!.aggregateRating).toBeDefined();
    expect(schema!.review).toHaveLength(1);
  });

  it("caps reviews at 5 to keep the JSON-LD payload bounded", () => {
    const reviews = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      overall_rating: 5,
      review_text: `review ${i}`,
      created_at: "2026-01-01",
    }));
    const schema = svc.generateEquipmentSchema({
      ...base,
      averageRating: 5,
      reviewCount: 10,
      reviews,
    });
    expect(schema!.review).toHaveLength(5);
  });

  it("skips null/undefined/empty-string spec values", () => {
    const schema = svc.generateEquipmentSchema({
      ...base,
      specifications: {
        speed: 9.7,
        spin: null,
        control: undefined,
        sponge: "",
      },
    });
    expect(schema!.additionalProperty).toEqual([
      { "@type": "PropertyValue", name: "speed", value: 9.7 },
    ]);
  });
});

describe("SchemaService.generateBreadcrumbSchema", () => {
  const svc = new SchemaService("https://example.test");

  it("emits absolute URLs for entries with href", () => {
    const schema = svc.generateBreadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Equipment", href: "/equipment" },
    ]);
    expect(schema.itemListElement[0].item).toBe("https://example.test/");
    expect(schema.itemListElement[1].item).toBe(
      "https://example.test/equipment"
    );
  });

  it("omits `item` entirely when href is undefined (current-page entry)", () => {
    const schema = svc.generateBreadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Equipment", href: "/equipment" },
      { label: "Tenergy 05" },
    ]);
    expect(schema.itemListElement[2].item).toBeUndefined();
    // Previous bug: emitted `item: "https://example.test"` (the bare
    // baseUrl). Verify it's not falling back to that.
    expect(schema.itemListElement[2]).not.toHaveProperty(
      "item",
      "https://example.test"
    );
  });
});
