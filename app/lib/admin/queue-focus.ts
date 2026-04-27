/**
 * Shared constants + helper for the "Open next pending" flow (TT-65).
 *
 * The dashboard's quick-action sets `?focus=oldest` on the queue URL it
 * navigates to. Each queue route reads that param and re-sorts its pending
 * section ascending so the globally-oldest pending row is the first row the
 * admin sees on landing.
 */

export const OLDEST_PENDING_PARAM = "focus" as const;
export const OLDEST_PENDING_VALUE = "oldest" as const;

function readCreatedAtMs(row: unknown): number {
  if (row && typeof row === "object" && "created_at" in row) {
    const val = (row as { created_at: unknown }).created_at;
    if (typeof val === "string") {
      const ms = new Date(val).getTime();
      return Number.isFinite(ms) ? ms : 0;
    }
  }
  return 0;
}

/**
 * Returns `rows` sorted oldest-first when the search params carry the
 * `focus=oldest` marker — otherwise returns the array untouched (preserving
 * the route's default newest-first order). Rows lacking `created_at` (or
 * with an unparsable value) are treated as the oldest possible.
 */
export function sortPendingByFocus<T>(
  rows: T[],
  searchParams: URLSearchParams
): T[] {
  if (searchParams.get(OLDEST_PENDING_PARAM) !== OLDEST_PENDING_VALUE) {
    return rows;
  }
  return [...rows].sort((a, b) => readCreatedAtMs(a) - readCreatedAtMs(b));
}
