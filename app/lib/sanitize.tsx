import { memo } from "react";
import sanitizeHtml, { type IOptions } from "sanitize-html";

/**
 * User-supplied HTML is parsed and filtered by `sanitize-html`
 * (htmlparser2 under the hood). This replaced a hand-rolled regex
 * allowlist that could be bypassed with nested tags, SVG animations,
 * HTML entities, and unclosed attributes (SECURITY.md Phase 4).
 *
 * `nodejs_compat_v2` in wrangler.toml makes `process` available on the
 * Worker so sanitize-html runs at the edge without polyfills.
 *
 * Allowlists are narrow and attribute-free, so there's no surface for
 * `onerror`, `href="javascript:..."`, etc.
 */

type Profile = "review" | "admin" | "plain";

const PROFILES: Record<Profile, IOptions> = {
  review: {
    allowedTags: ["p", "br", "b", "i", "strong", "em", "u"],
    allowedAttributes: {},
    allowedSchemes: [],
    disallowedTagsMode: "discard",
  },
  admin: {
    allowedTags: ["p", "br", "b", "i", "strong", "em"],
    allowedAttributes: {},
    allowedSchemes: [],
    disallowedTagsMode: "discard",
  },
  plain: {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  },
};

interface SafeHtmlProps {
  content: string;
  profile?: Profile;
  className?: string;
  fallback?: React.ReactNode;
}

/**
 * Render user content with the given sanitization profile. `plain` strips
 * every tag and renders as text; other profiles render sanitized HTML.
 * This component is the only sanctioned path to `dangerouslySetInnerHTML`
 * for user content.
 */
export const SafeHtml = memo(function SafeHtml({
  content,
  profile = "plain",
  className = "",
  fallback = null,
}: SafeHtmlProps) {
  if (!content || typeof content !== "string") {
    return <>{fallback}</>;
  }

  const sanitized = sanitizeHtml(content, PROFILES[profile]).trim();

  if (profile === "plain") {
    return <span className={className}>{sanitized}</span>;
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
});

/**
 * Sanitize + length-check a review body at the storage boundary.
 */
export function sanitizeReviewText(text: string): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  const sanitized = sanitizeHtml(text, PROFILES.review).trim();

  if (sanitized.length > 5000) {
    throw new Error("Review text too long (max 5000 characters)");
  }

  return sanitized;
}

/**
 * Sanitize admin-entered rejection reasons before storing.
 */
export function sanitizeAdminContent(content: string): string {
  if (!content || typeof content !== "string") {
    return "";
  }
  return sanitizeHtml(content, PROFILES.admin).trim();
}
