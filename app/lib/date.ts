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
