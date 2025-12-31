import { memo } from "react";

/**
 * Configuration for different types of user content sanitization
 */
export const sanitizationProfiles = {
  // For review text - allows basic formatting
  review: ["p", "br", "b", "i", "strong", "em", "u"],

  // For rejection reasons and admin feedback - more restrictive
  admin: ["p", "br", "b", "i", "strong", "em"],

  // For player descriptions and equipment specs - minimal formatting
  description: ["p", "br", "b", "i", "strong", "em"],

  // For plain text - strips all HTML
  plain: [],
} as const;

/**
 * Lightweight HTML sanitizer for edge environments
 * Removes dangerous elements and attributes while preserving safe formatting
 */
export function sanitizeHtml(
  content: string,
  profile: keyof typeof sanitizationProfiles = "plain"
): string {
  if (!content || typeof content !== "string") {
    return "";
  }

  try {
    // Strip all HTML for plain profile
    if (profile === "plain") {
      return content.replace(/<[^>]*>/g, "").trim();
    }

    const allowedTags = sanitizationProfiles[profile];

    // Remove script, style, and other dangerous tags completely
    let sanitized = content
      .replace(/<script[^>]*>.*?<\/script>/gis, "")
      .replace(/<style[^>]*>.*?<\/style>/gis, "")
      .replace(/<iframe[^>]*>.*?<\/iframe>/gis, "")
      .replace(/<object[^>]*>.*?<\/object>/gis, "")
      .replace(/<embed[^>]*>.*?<\/embed>/gis, "")
      .replace(/<form[^>]*>.*?<\/form>/gis, "")
      .replace(/<input[^>]*>/gi, "")
      .replace(/<textarea[^>]*>.*?<\/textarea>/gis, "")
      .replace(/<select[^>]*>.*?<\/select>/gis, "");

    // Remove all event handlers and javascript: links
    sanitized = sanitized
      .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
      .replace(/\s*javascript\s*:/gi, "")
      .replace(/\s*data\s*:/gi, "")
      .replace(/\s*vbscript\s*:/gi, "");

    // Remove any tags not in the allowed list
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
    sanitized = sanitized.replace(tagRegex, (match, tagName) => {
      const lowerTagName = tagName.toLowerCase();
      if (allowedTags.includes(lowerTagName as any)) {
        // Keep only the tag name, strip all attributes for security
        const isClosing = match.startsWith("</");
        return isClosing ? `</${lowerTagName}>` : `<${lowerTagName}>`;
      }
      return ""; // Remove disallowed tags
    });

    return sanitized.trim();
  } catch (error) {
    console.error("Error sanitizing HTML:", error);
    // Fallback to plain text if sanitization fails
    return content.replace(/<[^>]*>/g, "").trim();
  }
}

/**
 * React component for safely rendering user-generated HTML content
 */
interface SafeHtmlProps {
  content: string;
  profile?: keyof typeof sanitizationProfiles;
  className?: string;
  fallback?: React.ReactNode;
}

export const SafeHtml = memo(function SafeHtml({
  content,
  profile = "plain",
  className = "",
  fallback = null,
}: SafeHtmlProps) {
  if (!content || typeof content !== "string") {
    return <>{fallback}</>;
  }

  const sanitized = sanitizeHtml(content, profile);

  // If the profile is 'plain', just render as text
  if (profile === "plain") {
    return <span className={className}>{sanitized}</span>;
  }

  // For other profiles that allow HTML, use dangerouslySetInnerHTML
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
});

/**
 * Sanitize text input on the client side (for forms)
 */
export function sanitizeInput(value: string): string {
  if (!value || typeof value !== "string") {
    return "";
  }

  // Remove any HTML tags from user input
  return sanitizeHtml(value, "plain");
}

/**
 * Validate and sanitize review text
 */
export function sanitizeReviewText(text: string): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  // Allow basic formatting in reviews
  const sanitized = sanitizeHtml(text, "review");

  // Additional validation: check length
  if (sanitized.length > 5000) {
    throw new Error("Review text too long (max 5000 characters)");
  }

  return sanitized;
}

/**
 * Sanitize admin feedback and rejection reasons
 */
export function sanitizeAdminContent(content: string): string {
  if (!content || typeof content !== "string") {
    return "";
  }

  return sanitizeHtml(content, "admin");
}
