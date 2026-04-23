import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  SafeHtml,
  sanitizeReviewText,
  sanitizeAdminContent,
} from "../sanitize";

describe("sanitizeReviewText", () => {
  it("strips script tags", () => {
    expect(sanitizeReviewText("hi<script>alert(1)</script>bye")).toBe("hibye");
  });

  it("strips on* event handler attributes", () => {
    const out = sanitizeReviewText('<p onclick="alert(1)">click</p>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("click");
  });

  it("strips svg/animate nested vectors the old regex missed", () => {
    const out = sanitizeReviewText(
      '<svg><animate onbegin="alert(1)" attributeName="x"/></svg>'
    );
    expect(out).not.toMatch(/svg|animate|onbegin|alert/i);
  });

  it("strips entity-encoded tag payloads", () => {
    const out = sanitizeReviewText("&lt;script&gt;alert(1)&lt;/script&gt;safe");
    expect(out).not.toContain("<script>");
    expect(out).toContain("safe");
  });

  it("keeps allowed formatting tags", () => {
    const out = sanitizeReviewText("<p><b>bold</b> and <em>emph</em></p>");
    expect(out).toContain("<b>bold</b>");
    expect(out).toContain("<em>emph</em>");
    expect(out).toContain("<p>");
  });

  it("drops attributes on allowed tags", () => {
    const out = sanitizeReviewText(
      '<b class="x" onmouseover="alert(1)">hi</b>'
    );
    expect(out).toBe("<b>hi</b>");
  });

  it("throws over 5000 chars after sanitization", () => {
    const long = "a".repeat(5001);
    expect(() => sanitizeReviewText(long)).toThrow(/too long/i);
  });

  it("returns empty string for falsy input", () => {
    expect(sanitizeReviewText("")).toBe("");
    // @ts-expect-error — runtime guard
    expect(sanitizeReviewText(null)).toBe("");
  });
});

// Collection of real-world XSS vectors pulled from OWASP, PortSwigger,
// and the Sonar mXSS cheatsheet. Payloads are expected to be rendered as
// text (or stripped) given our narrow allowlist + `allowedAttributes: {}`
// config. Each line documents what the payload is probing.
describe("sanitizeReviewText attack corpus", () => {
  const mustNotExecute = [
    // Classic img/onerror
    ['<img src=x onerror="alert(1)">', "img + onerror"],
    // Case variation
    ['<IMG SRC="x" ONERROR="alert(1)">', "upper-case IMG"],
    // SVG onload — a foreign-content vector
    ['<svg onload="alert(1)">', "svg onload"],
    // SVG + <style> namespace confusion (mXSS) — outer svg must be stripped
    [
      '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
      "SVG/style mXSS",
    ],
    // MathML + mglyph + style (DOMPurify 2.0.17 bypass)
    [
      "<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>",
      "MathML mtext mglyph mXSS",
    ],
    // Noscript confusion (Mozilla Bleach 3.1.0 bypass)
    [
      "<noscript><style></noscript><img src=x onerror=alert(1)>",
      "noscript+style",
    ],
    // foreignObject / annotation-xml (DOMPurify 3.0.8 bypass)
    [
      "<svg><annotation-xml><foreignobject><style><!--</style><p id=\"--><img src='x' onerror='alert(1)'>\">",
      "foreignObject+annotation-xml",
    ],
    // iframe srcdoc
    [
      '<iframe srcdoc="<img src=x onerror=alert(1)>"></iframe>',
      "iframe srcdoc",
    ],
    // javascript: URL on href (we allow no attributes, but confirm)
    ['<a href="javascript:alert(1)">click</a>', "javascript: URL in href"],
    // data: URL in src (attribute strip)
    ['<img src="data:text/html,<script>alert(1)</script>">', "data: URL img"],
    // Comment-splitting + img (TYPO3 2.0.15 bypass)
    [
      "<!--a foo=--!><img src=x onerror=alert(1)><!--<a>>",
      "comment manipulation",
    ],
    // nonTextTags entity bypass (sanitize-html unpatched vector, needs `option` allowed — we don't)
    [
      "<option>&lt;img src=x onerror=alert(1)&gt;</option>",
      "nonTextTags entity bypass",
    ],
    // Entity-encoded script
    ["&lt;script&gt;alert(1)&lt;/script&gt;", "entity-encoded script"],
    // Zero-padded numeric character reference (htmlparser2 10.1 fix target)
    [
      "&#0000060;script&#0000062;alert(1)&#0000060;/script&#0000062;",
      "zero-padded numeric char refs",
    ],
  ] as const;

  for (const [payload, label] of mustNotExecute) {
    it(`neutralises: ${label}`, () => {
      const out = sanitizeReviewText(payload);
      // None of these should produce an executable construct in the
      // output. Check the four places an executable thing would land:
      //  - a raw <script> tag
      //  - a raw <img, <svg, <iframe etc. (any disallowed tag)
      //  - any "on*=" attribute
      //  - a `javascript:` scheme
      expect(out).not.toMatch(/<script/i);
      expect(out).not.toMatch(
        /<(svg|img|iframe|math|mtext|mglyph|annotation|foreignobject|noscript|style|form|option|a)\b/i
      );
      expect(out).not.toMatch(/\son\w+\s*=/i);
      expect(out).not.toMatch(/javascript:/i);
    });
  }
});

describe("sanitizeAdminContent", () => {
  it("disallows <u> which is only in the review profile", () => {
    expect(sanitizeAdminContent("<u>admin note</u>")).toBe("admin note");
  });

  it("keeps strong/em", () => {
    const out = sanitizeAdminContent("<strong>rejected</strong> reason");
    expect(out).toContain("<strong>rejected</strong>");
  });

  it("returns empty for non-string", () => {
    // @ts-expect-error — runtime guard
    expect(sanitizeAdminContent(undefined)).toBe("");
  });
});

describe("<SafeHtml>", () => {
  it("renders XSS payload as text in plain profile", () => {
    const out = renderToString(
      <SafeHtml content="<img src=x onerror=alert(1)>hi" profile="plain" />
    );
    expect(out).not.toContain("<img");
    expect(out).not.toContain("onerror");
    expect(out).toContain("hi");
  });

  it("renders sanitized HTML in review profile", () => {
    const out = renderToString(
      <SafeHtml
        content='<b>bold</b><script>alert(1)</script><p onclick="x">p</p>'
        profile="review"
      />
    );
    expect(out).toContain("<b>bold</b>");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("onclick");
  });

  it("renders fallback for empty content", () => {
    const out = renderToString(
      <SafeHtml content="" fallback={<span>no content</span>} />
    );
    expect(out).toContain("no content");
  });
});
