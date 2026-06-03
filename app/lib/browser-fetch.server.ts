// Browser-Rendering-backed fetch (TT-245).
//
// revspin.net began returning HTTP 403 to every non-browser client: the
// block is on the TLS/HTTP-2 handshake fingerprint (SiteGround CDN),
// not our User-Agent or IP, so no header change from a Cloudflare
// Workers `fetch()` can pass. A genuine browser fingerprint is the only
// way through, so we drive real headless Chromium via Cloudflare
// Browser Rendering and expose it behind the same `typeof fetch` seam
// the spec/photo sourcing adapters already inject for testing.
//
// Browser sessions are billed by active time and acquisition is rate
// limited (the spec cron and a photo requeue colliding produced
// "Unable to connect to existing session … retry or launch a new
// browser" in prod), so this follows Cloudflare's documented lifecycle:
// reuse a free session when one exists, retry transient acquisition
// failures, and disconnect() — not close() — after a successful fetch
// so the warm session serves the next call. The `BROWSER` binding
// exists only on the deployed Worker (wrangler.toml); local dev and CI
// have no binding, so callers pass `undefined` and fall back to the
// global `fetch`.

import puppeteer, {
  type Browser,
  type BrowserWorker,
  type Page,
} from "@cloudflare/puppeteer";

import { Logger, createLogContext } from "./logger.server";

// Headless Chromium can hang on a slow upstream; cap the navigation so a
// stuck page can't pin a (billed) browser session open indefinitely.
const NAVIGATION_TIMEOUT_MS = 30_000;
// Once a navigation is mid-flight (revspin/SiteGround occasionally serves
// an interstitial that redirects), give it a short window to settle
// before re-reading the document.
const SETTLE_TIMEOUT_MS = 8_000;
// Acquisition is rate limited (1 new instance/sec account-wide); a
// couple of spaced retries ride out a collision with another consumer.
const LAUNCH_ATTEMPTS = 3;
const LAUNCH_RETRY_DELAY_MS = 1_500;

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// A goto/content failure we can recover from by salvaging whatever
// document is currently loaded, rather than failing the whole fetch:
//  - "Navigation timeout ... exceeded": domcontentloaded didn't fire in
//    time (heavy list page / slow CDN), but the DOM is usually usable.
//  - "Execution context was destroyed, most likely because of a
//    navigation": a redirect fired between load and read.
function isRecoverableNavError(err: unknown): boolean {
  return /navigation timeout|execution context was destroyed|frame (?:was )?detached/i.test(
    errText(err)
  );
}

// Acquisition failures worth retrying — the message Cloudflare returns
// when sessions collide literally says "retry or launch a new browser".
function isTransientLaunchError(err: unknown): boolean {
  return /unable to connect to existing session|retry or launch a new browser|too many active sessions|rate ?limit|not ready/i.test(
    errText(err)
  );
}

// Connect to an idle session left warm by a previous fetch (ours or a
// concurrent consumer's). Free sessions have no connectionId. Another
// isolate can win the race for one — just try the next.
async function connectToFreeSession(
  browser: BrowserWorker
): Promise<Browser | null> {
  try {
    const sessions = await puppeteer.sessions(browser);
    const free = sessions.filter(s => !s.connectionId);
    for (const s of free) {
      try {
        return await puppeteer.connect(browser, s.sessionId);
      } catch {
        // raced or expired — try the next free session
      }
    }
  } catch {
    // sessions() unavailable — fall through to a fresh launch
  }
  return null;
}

async function launchWithRetry(browser: BrowserWorker): Promise<Browser> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < LAUNCH_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, LAUNCH_RETRY_DELAY_MS * attempt));
      // A session may have freed up while we backed off.
      const reused = await connectToFreeSession(browser);
      if (reused) return reused;
    }
    try {
      return await puppeteer.launch(browser);
    } catch (err) {
      lastErr = err;
      if (!isTransientLaunchError(err)) throw err;
    }
  }
  throw lastErr;
}

interface AcquiredBrowser {
  session: Browser;
  reused: boolean;
}

async function acquireBrowser(
  browser: BrowserWorker
): Promise<AcquiredBrowser> {
  const reusedSession = await connectToFreeSession(browser);
  if (reusedSession) return { session: reusedSession, reused: true };
  return { session: await launchWithRetry(browser), reused: false };
}

// Best-effort cleanup that never throws — mocks/stale sessions may lack
// or reject these methods, and cleanup must not mask the real outcome.
async function quietly(fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await fn();
  } catch {
    // ignored — cleanup only
  }
}

// Read the page HTML, tolerating an in-flight navigation. `page.content()`
// throws "execution context was destroyed" if the frame navigates while
// it evaluates; wait for the navigation to settle and retry once.
async function readHtml(page: Page): Promise<string> {
  try {
    return await page.content();
  } catch (err) {
    if (
      !/execution context was destroyed|frame (?:was )?detached/i.test(
        errText(err)
      )
    ) {
      throw err;
    }
    await page
      .waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: SETTLE_TIMEOUT_MS,
      })
      .catch(() => {});
    return await page.content();
  }
}

// One navigation + extraction on an acquired session. On success the
// session is disconnected (stays warm for the next fetch); on failure
// it is closed outright so a wedged Chromium can't be reused.
async function fetchViaSession(
  session: Browser,
  url: string
): Promise<Response> {
  let ok = false;
  let page: Page | null = null;
  try {
    page = await session.newPage();
    let status = 200;
    let contentType = "";
    let resp: Awaited<ReturnType<Page["goto"]>> = null;
    try {
      resp = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      status = resp?.status() ?? 200;
      contentType = resp?.headers()["content-type"] ?? "";
    } catch (err) {
      // Don't fail the fetch on a recoverable nav error — fall through
      // and salvage the loaded document. A genuinely fatal nav error
      // still propagates so the caller surfaces it. These used to fire
      // Discord alerts (TT-245).
      if (!isRecoverableNavError(err)) throw err;
      Logger.debug(
        "browser-fetch: recoverable navigation error, salvaging document",
        createLogContext("browser-fetch", { url }),
        { error: errText(err) }
      );
    }
    // Non-HTML responses (e.g. revspin product images — same
    // fingerprint block as its pages) must round-trip as raw bytes:
    // page.content() would wrap them in Chromium's HTML viewer shell
    // and corrupt the download.
    let result: Response;
    if (resp && contentType && !contentType.includes("text/html")) {
      const body = await resp.buffer();
      result = new Response(body, {
        status,
        headers: { "content-type": contentType },
      });
    } else {
      const html = await readHtml(page);
      result = new Response(html, {
        status,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    ok = true;
    return result;
  } finally {
    if (page) await quietly(() => page!.close());
    if (ok) {
      // Keep the session warm — Browser Rendering reclaims it after its
      // idle keep-alive, and the next fetch reuses it instead of paying
      // (and rate-limiting on) a cold launch.
      await quietly(() => session.disconnect());
    } else {
      await quietly(() => session.close());
    }
  }
}

// Returns a `fetch`-compatible function that loads the URL in real
// headless Chromium and resolves with a `Response` carrying the
// rendered HTML (or raw bytes for non-HTML content). The returned
// Response mirrors the upstream status code so the existing retry/throw
// logic in httpFetch / rateLimitedFetch behaves unchanged; request
// `init` (headers etc.) is intentionally ignored — driving a real
// browser is the whole point, and its native fingerprint is what
// defeats the block.
export function makeBrowserFetch(browser: BrowserWorker): typeof fetch {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const acquired = await acquireBrowser(browser);
    try {
      return await fetchViaSession(acquired.session, url);
    } catch (err) {
      // A reused session can be stale in arbitrary ways (target closed,
      // protocol error). Pay for one fresh launch before giving up.
      if (!acquired.reused) throw err;
      Logger.debug(
        "browser-fetch: reused session failed, retrying on a fresh launch",
        createLogContext("browser-fetch", { url }),
        { error: errText(err) }
      );
      const fresh = await launchWithRetry(browser);
      return await fetchViaSession(fresh, url);
    }
  };
}
