/**
 * Hydration-stable date formatters.
 *
 * `Date.prototype.toLocaleDateString()` called without an explicit
 * locale uses the runtime's default, which is different on Cloudflare
 * Workers (SSR) than in the user's browser (client) — producing values
 * like "01/01/2026" vs "1/1/2026" and breaking React hydration. Always
 * format dates through these helpers.
 */

const SHORT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const LONG = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** DD/MM/YYYY, e.g. "01/01/2026". */
export function formatDate(input: string | Date): string {
  return SHORT.format(toDate(input));
}

/** "1 January 2026". */
export function formatDateLong(input: string | Date): string {
  return LONG.format(toDate(input));
}

function toDate(input: string | Date): Date {
  return input instanceof Date ? input : new Date(input);
}

/**
 * Compact "time ago" label, computed against a reference instant (defaults
 * to `Date.now()`). Caller passes `now` explicitly when SSR must produce a
 * value tied to a specific timestamp (e.g. so a server-rendered "4 hours
 * ago" stays consistent if the page is later inspected). Result is frozen
 * at format time — it won't tick on the client without a re-render.
 *
 * Buckets: <60s "just now"; <60m "Nm ago"; <24h "Nh ago"; else "Nd ago".
 */
export function formatRelativeTime(
  input: string | Date,
  now: Date = new Date()
): string {
  const target = toDate(input);
  const diffMs = now.getTime() - target.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
