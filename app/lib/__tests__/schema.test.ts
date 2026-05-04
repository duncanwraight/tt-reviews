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
