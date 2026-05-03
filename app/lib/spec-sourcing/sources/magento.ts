// Shared parser for Magento `catalogsearch` result pages. Both the
// Butterfly and TT11 adapters point at the same Magento product-card
// shape:
//
//   <a class="product-item-link"
//      href="https://<host>/<slug>(.html)?"
//      ...>
//       Display Name
//   </a>
//
// (Whitespace and attribute ordering vary; the regex below is tolerant
// of both.) The parser is intentionally regex-based rather than DOM-
// based because the Worker runtime doesn't ship a parser5/cheerio and
// these pages only need a flat link → name extract.

import type { SpecCandidate } from "./types";

const PRODUCT_LINK_RE =
  /<a\s+class=["']product-item-link["']\s+href=["']([^"']+)["'][^>]*>\s*([^<]+?)\s*<\/a>/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

export function parseMagentoSearchResults(
  html: string,
  limit = 5
): SpecCandidate[] {
  const seen = new Set<string>();
  const out: SpecCandidate[] = [];
  PRODUCT_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRODUCT_LINK_RE.exec(html)) !== null) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: decodeEntities(m[2]).replace(/\s+/g, " ").trim(),
    });
    if (out.length >= limit) break;
  }
  return out;
}
