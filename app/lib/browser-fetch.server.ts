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
// This is expensive — every call launches and tears down a browser
// session (metered browser-time on the Workers Paid plan) — so it is
// only wired where plain `fetch` is known to be blocked. The `BROWSER`
// binding exists only on the deployed Worker (wrangler.toml); local dev
// and CI have no binding, so callers pass `undefined` and fall back to
// the global `fetch`.

import puppeteer, {
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

// Returns a `fetch`-compatible function that loads the URL in real
// headless Chromium and resolves with a `Response` carrying the
// rendered HTML. The returned Response mirrors the upstream status code
// so the existing retry/throw logic in httpFetch / rateLimitedFetch
// behaves unchanged; request `init` (headers etc.) is intentionally
// ignored — driving a real browser is the whole point, and its native
// fingerprint is what defeats the block.
export function makeBrowserFetch(browser: BrowserWorker): typeof fetch {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const session = await puppeteer.launch(browser);
    try {
      const page = await session.newPage();
      let status = 200;
      try {
        const resp = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: NAVIGATION_TIMEOUT_MS,
        });
        status = resp?.status() ?? 200;
      } catch (err) {
        // Don't fail the fetch on a recoverable nav error — fall through
        // and salvage the loaded document. A genuinely fatal launch/nav
        // error (e.g. bad URL, session crash) still propagates so the
        // caller surfaces it. These used to fire Discord alerts (TT-245).
        if (!isRecoverableNavError(err)) throw err;
        Logger.debug(
          "browser-fetch: recoverable navigation error, salvaging document",
          createLogContext("browser-fetch", { url }),
          { error: errText(err) }
        );
      }
      const html = await readHtml(page);
      return new Response(html, {
        status,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } finally {
      // Always release the (billed) browser session, even if navigation
      // threw — a leaked session counts against the 120-concurrent cap.
      await session.close().catch(err => {
        Logger.warn(
          "browser-fetch: failed to close browser session",
          createLogContext("browser-fetch", { url }),
          err instanceof Error ? err : undefined
        );
      });
    }
  };
}
