// Shared parser for Magento `catalogsearch` responses. Both the
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

const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;

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

// Magento `catalogsearch` 302s straight to the canonical product page
// whenever exactly one product matches the query (TT-176). Default
// `fetch()` follows the redirect, so the adapter ends up reading
// product-page HTML rather than a result list. The product page
// happens to carry one `<a class="product-item-link">` of its own —
// the "Weight selection (rubber)" sidebar widget on Butterfly — so the
// result-list parser would mis-extract that link and prefilter would
// then drop it.
//
// Detect by URL shape: when the final URL has moved off
// `/catalogsearch/`, treat the response as a direct hit and synthesise
// one candidate from the page `<title>`. Otherwise fall through to the
// result-list parser unchanged.
export function parseMagentoSearchResponse(
  html: string,
  finalUrl: string,
  searchUrl: string,
  limit = 5
): SpecCandidate[] {
  if (finalUrl !== searchUrl && !finalUrl.includes("/catalogsearch/")) {
    const title = parseHtmlTitle(html);
    return title ? [{ url: finalUrl, title }] : [];
  }
  return parseMagentoSearchResults(html, limit);
}

function parseHtmlTitle(html: string): string {
  const m = TITLE_RE.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}
