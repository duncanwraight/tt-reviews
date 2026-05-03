// Politeness throttle + retry helper shared across spec-sourcing
// adapters. Mirrors the photo-sourcing pattern (see
// app/lib/photo-sourcing/providers/megaspin.ts, brave.server.ts):
// module-level lastRequestTime per-host map, 1.1s minimum interval,
// honours Retry-After on 429/5xx with one bounded retry.
//
// fetchImpl is injected in tests so unit tests don't hit the network.
// The throttle still ticks during tests but with no real delay (tests
// run sequentially against a stubbed fetch).

const MIN_REQUEST_INTERVAL_MS = 1100;
const USER_AGENT = "tt-reviews-spec-sourcer/0.1 (+https://tabletennis.reviews)";

const lastRequestByHost = new Map<string, number>();

export interface HttpFetchOptions {
  fetchImpl?: typeof fetch;
  // Maximum retries on 429/5xx. Default 1.
  maxRetries?: number;
  // Test seam — caps the longest sleep so unit tests stay fast.
  maxSleepMs?: number;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

async function throttle(host: string, maxSleepMs: number): Promise<void> {
  const now = Date.now();
  const last = lastRequestByHost.get(host) ?? 0;
  const wait = Math.min(
    Math.max(0, MIN_REQUEST_INTERVAL_MS - (now - last)),
    maxSleepMs
  );
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestByHost.set(host, Date.now());
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : null;
  }
  return null;
}

// Test seam — clears the per-host throttle map. Production never
// calls this; unit tests use it to keep ordering predictable.
export function _resetSpecSourcingThrottle(): void {
  lastRequestByHost.clear();
}

// Public fetch wrapper. Throws on the final attempt's network error or
// non-success response so callers can catch and surface a 'no_results'
// outcome cleanly.
export async function httpFetch(
  url: string,
  options: HttpFetchOptions = {}
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRetries = options.maxRetries ?? 1;
  const maxSleepMs = options.maxSleepMs ?? 60_000;
  const host = hostOf(url);

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await throttle(host, maxSleepMs);
    try {
      const res = await fetchImpl(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          const retryAfter =
            parseRetryAfter(res.headers.get("retry-after")) ??
            Math.min(2 ** attempt * 1000, maxSleepMs);
          await new Promise(r => setTimeout(r, retryAfter));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries) throw err;
      const backoff = Math.min(2 ** attempt * 1000, maxSleepMs);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastError ?? new Error(`httpFetch exhausted retries for ${url}`);
}
