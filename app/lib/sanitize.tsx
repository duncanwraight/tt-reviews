import DOMPurify from "isomorphic-dompurify";
import { memo } from "react";

/**
 * Configuration for different types of user content sanitization
 */
export const sanitizationProfiles = {
  // For review text - allows basic formatting
  review: {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'strong', 'em', 'u', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: [],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
  },
  
  // For rejection reasons and admin feedback - more restrictive
  admin: {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'strong', 'em'],
    ALLOWED_ATTR: [],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'img', 'a'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
  },
  
  // For player descriptions and equipment specs - minimal formatting
  description: {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'strong', 'em'],
    ALLOWED_ATTR: [],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'img'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
  },
  
  // For plain text - strips all HTML
  plain: {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  }
} as const;

/**
 * Sanitize HTML content based on profile
 */
export function sanitizeHtml(
  content: string, 
  profile: keyof typeof sanitizationProfiles = 'plain'
): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  try {
    return DOMPurify.sanitize(content, sanitizationProfiles[profile]);
  } catch (error) {
    console.error('Error sanitizing HTML:', error);
    // Fallback to plain text if sanitization fails
    return DOMPurify.sanitize(content, sanitizationProfiles.plain);
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
  profile = 'plain',
  className = '',
  fallback = null,
}: SafeHtmlProps) {
  if (!content || typeof content !== 'string') {
    return <>{fallback}</>;
  }

  const sanitized = sanitizeHtml(content, profile);
  
  // If the profile is 'plain', just render as text
  if (profile === 'plain') {
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
  if (!value || typeof value !== 'string') {
    return '';
  }

  // Remove any HTML tags from user input
  return sanitizeHtml(value, 'plain');
}

/**
 * Validate and sanitize review text
 */
export function sanitizeReviewText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Allow basic formatting in reviews
  const sanitized = sanitizeHtml(text, 'review');
  
  // Additional validation: check length
  if (sanitized.length > 5000) {
    throw new Error('Review text too long (max 5000 characters)');
  }
  
  return sanitized;
}

/**
 * Sanitize admin feedback and rejection reasons
 */
export function sanitizeAdminContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  return sanitizeHtml(content, 'admin');
}