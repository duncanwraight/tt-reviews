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

import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";

import { Logger, createLogContext } from "./logger.server";

// Headless Chromium can hang on a slow upstream; cap the navigation so a
// stuck page can't pin a (billed) browser session open indefinitely.
const NAVIGATION_TIMEOUT_MS = 30_000;

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
      const resp = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      const html = await page.content();
      const status = resp?.status() ?? 200;
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
