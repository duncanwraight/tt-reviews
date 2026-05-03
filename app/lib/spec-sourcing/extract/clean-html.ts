// HTML preprocessor for the LLM extractor (TT-148). Product pages on
// Magento storefronts (Butterfly, TT11) carry 500K+ of bytes per page,
// 95% of which is theme CSS, tracking scripts, embedded SVG icons,
// and HTML comments. Stripping those before the model sees them cuts
// token cost by ~10x without losing any spec / description content.
//
// The brief locks the cleanup to:
//   - <script>, <style>, <svg>, <noscript>, <template> tag bodies
//   - HTML comments
//   - <link>, <meta>, <iframe>, <picture>, <source> tags (presentation-only)
//   - Truncate to 30K chars max (with a "[truncated]" marker) so the
//     model knows the input was capped.
//
// Regex-based on purpose: the Worker runtime doesn't ship a DOM
// parser, and the spec data lives in flat <table> / <dl> / <p>
// structures the model handles fine even with surrounding noise.

const TRUNCATION_MARKER = "\n[...truncated]";
const MAX_CHARS_DEFAULT = 30_000;

const REMOVE_TAGS = ["script", "style", "svg", "noscript", "template"] as const;

function stripTagBlock(html: string, tag: string): string {
  // Tolerant of whitespace / attributes; non-greedy on the body.
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  return html.replace(re, "");
}

function stripVoidTags(html: string): string {
  // Tags that are rarely useful for extraction and never carry text.
  return html.replace(
    /<(link|meta|iframe|picture|source|img)\b[^>]*\/?>(?:<\/(?:link|meta|iframe|picture|source|img)>)?/gi,
    ""
  );
}

function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function collapseWhitespace(html: string): string {
  return html.replace(/[ \t\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n");
}

export interface CleanHtmlOptions {
  maxChars?: number;
}

export function cleanHtml(input: string, opts: CleanHtmlOptions = {}): string {
  let out = input;
  out = stripComments(out);
  for (const tag of REMOVE_TAGS) out = stripTagBlock(out, tag);
  out = stripVoidTags(out);
  out = collapseWhitespace(out);
  out = out.trim();

  const cap = opts.maxChars ?? MAX_CHARS_DEFAULT;
  if (out.length > cap) {
    out = out.slice(0, cap - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
  }
  return out;
}

// Test seam — used by gemini.ts to take a 1KB excerpt for the
// admin-UI rawHtmlExcerpt field.
export function takeExcerpt(html: string, maxChars = 1024): string {
  const cleaned = cleanHtml(html, { maxChars });
  return cleaned.length > maxChars
    ? cleaned.slice(0, maxChars - 1) + "…"
    : cleaned;
}
