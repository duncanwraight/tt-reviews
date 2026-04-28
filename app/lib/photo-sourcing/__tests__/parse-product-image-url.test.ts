import { describe, it, expect } from "vitest";
import { parseProductImageUrl } from "../../revspin.server";

describe("parseProductImageUrl", () => {
  it("prefers og:image when present", () => {
    const html = `<html>
      <head>
        <meta property="og:image" content="https://revspin.net/assets/table-tennis-images/blades/butterfly-zhang-jike-zlc.jpg"/>
      </head>
      <body>
        <img class="product_detail_image" itemprop="image" src="/images/blade/butterfly-zhang-jike-zlc.jpg" alt="..." />
      </body>
    </html>`;
    expect(parseProductImageUrl(html)).toBe(
      "https://revspin.net/assets/table-tennis-images/blades/butterfly-zhang-jike-zlc.jpg"
    );
  });

  it("falls back to product_detail_image when og:image is missing", () => {
    const html = `<html><body>
      <img class="product_detail_image" src="/images/blade/foo.jpg" />
    </body></html>`;
    expect(parseProductImageUrl(html)).toBe(
      "https://revspin.net/images/blade/foo.jpg"
    );
  });

  it("preserves an absolute product_detail_image URL", () => {
    const html = `<img class="product_detail_image" src="https://cdn.example/foo.jpg" />`;
    expect(parseProductImageUrl(html)).toBe("https://cdn.example/foo.jpg");
  });

  it("returns null when no candidates are found", () => {
    expect(
      parseProductImageUrl("<html><body>nothing</body></html>")
    ).toBeNull();
  });

  it("ignores other img tags that don't have the product_detail_image class", () => {
    const html = `<html><body>
      <img src="/images/layout/logo.png" />
      <img class="some-other-image" src="/foo.jpg" />
    </body></html>`;
    expect(parseProductImageUrl(html)).toBeNull();
  });
});
