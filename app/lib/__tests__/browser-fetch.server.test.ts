import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserWorker } from "@cloudflare/puppeteer";

// Mock the Browser Rendering driver. makeBrowserFetch imports puppeteer
// as a default export and calls puppeteer.launch — we stand in a fake
// browser/page so the wrapper can be exercised without a real Chromium.
const goto = vi.fn();
const content = vi.fn();
const close = vi.fn();
const disconnect = vi.fn();
const newPage = vi.fn();
const launch = vi.fn();
const sessions = vi.fn();
const connect = vi.fn();
const waitForNavigation = vi.fn();
const pageClose = vi.fn();

vi.mock("@cloudflare/puppeteer", () => ({
  default: {
    launch: (...args: unknown[]) => launch(...args),
    sessions: (...args: unknown[]) => sessions(...args),
    connect: (...args: unknown[]) => connect(...args),
  },
}));

import { makeBrowserFetch } from "../browser-fetch.server";

// A token binding — makeBrowserFetch only forwards it to puppeteer.launch.
const BROWSER = { fetch: vi.fn() } as unknown as BrowserWorker;

// Minimal HTTPResponse stand-in: status + headers are all the wrapper
// reads; an HTML content-type keeps it on the rendered-DOM path.
function htmlResp(status: number) {
  return {
    status: () => status,
    headers: () => ({ "content-type": "text/html; charset=utf-8" }),
  };
}

beforeEach(() => {
  goto.mockReset();
  content.mockReset();
  close.mockReset();
  disconnect.mockReset();
  newPage.mockReset();
  launch.mockReset();
  sessions.mockReset();
  connect.mockReset();
  waitForNavigation.mockReset();
  pageClose.mockReset();

  content.mockResolvedValue("<html><body>rendered</body></html>");
  goto.mockResolvedValue(htmlResp(200));
  waitForNavigation.mockResolvedValue(null);
  pageClose.mockResolvedValue(undefined);
  newPage.mockResolvedValue({
    goto,
    content,
    waitForNavigation,
    close: pageClose,
  });
  close.mockResolvedValue(undefined);
  disconnect.mockResolvedValue(undefined);
  // No idle sessions by default — every test starts on the fresh-launch
  // path unless it stubs `sessions` itself.
  sessions.mockResolvedValue([]);
  launch.mockResolvedValue({ newPage, close, disconnect });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("makeBrowserFetch", () => {
  it("launches the bound browser and returns the rendered HTML as a Response", async () => {
    const browserFetch = makeBrowserFetch(BROWSER);
    const res = await browserFetch("https://revspin.net/rubber/");

    expect(launch).toHaveBeenCalledWith(BROWSER);
    expect(goto).toHaveBeenCalledWith(
      "https://revspin.net/rubber/",
      expect.objectContaining({ waitUntil: "domcontentloaded" })
    );
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe("<html><body>rendered</body></html>");
  });

  it("mirrors the upstream status code so retry/throw logic is unchanged", async () => {
    goto.mockResolvedValue(htmlResp(403));
    const browserFetch = makeBrowserFetch(BROWSER);

    const res = await browserFetch("https://revspin.net/blade/");
    expect(res.status).toBe(403);
    expect(res.ok).toBe(false);
  });

  it("defaults to 200 when navigation yields no response object", async () => {
    goto.mockResolvedValue(null);
    const browserFetch = makeBrowserFetch(BROWSER);

    const res = await browserFetch("https://revspin.net/blade/");
    expect(res.status).toBe(200);
  });

  it("disconnects (keeps warm) rather than closes after a successful render", async () => {
    const browserFetch = makeBrowserFetch(BROWSER);
    await browserFetch("https://revspin.net/rubber/");
    expect(pageClose).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("propagates a non-recoverable navigation error and still closes the session", async () => {
    goto.mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));
    const browserFetch = makeBrowserFetch(BROWSER);

    await expect(browserFetch("https://revspin.net/rubber/")).rejects.toThrow(
      "ERR_NAME_NOT_RESOLVED"
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  // TT-245 follow-up: revspin's large /rubber/ list page timed out at the
  // 30s domcontentloaded cap, and SiteGround interstitials redirected
  // mid-read — both fired Discord alerts. Salvage the loaded document
  // instead of failing the fetch.
  it("salvages the loaded document when navigation times out (no throw)", async () => {
    goto.mockRejectedValue(
      new Error("Navigation timeout of 30000 ms exceeded")
    );
    content.mockResolvedValue("<html><body>partial list</body></html>");
    const browserFetch = makeBrowserFetch(BROWSER);

    const res = await browserFetch("https://revspin.net/rubber/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html><body>partial list</body></html>");
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("retries content() once after an execution-context-destroyed race", async () => {
    content
      .mockRejectedValueOnce(
        new Error(
          "Execution context was destroyed, most likely because of a navigation."
        )
      )
      .mockResolvedValueOnce("<html><body>settled</body></html>");
    const browserFetch = makeBrowserFetch(BROWSER);

    const res = await browserFetch("https://revspin.net/rubber/");
    expect(waitForNavigation).toHaveBeenCalledTimes(1);
    expect(content).toHaveBeenCalledTimes(2);
    expect(await res.text()).toBe("<html><body>settled</body></html>");
  });

  it("propagates when content() fails for a non-navigation reason", async () => {
    content.mockRejectedValue(new Error("target closed"));
    const browserFetch = makeBrowserFetch(BROWSER);

    await expect(browserFetch("https://revspin.net/rubber/")).rejects.toThrow(
      "target closed"
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  // TT-245 follow-up: revspin's images sit behind the same fingerprint
  // block as its pages. A browser-driven image download must return the
  // raw response bytes — page.content() would wrap them in Chromium's
  // HTML viewer shell and corrupt the stored candidate.
  it("returns raw bytes (not rendered DOM) for non-HTML responses", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    goto.mockResolvedValue({
      status: () => 200,
      headers: () => ({ "content-type": "image/jpeg" }),
      buffer: async () => Buffer.from(jpeg),
    });
    const browserFetch = makeBrowserFetch(BROWSER);

    const res = await browserFetch(
      "https://revspin.net/images/rubber/palio-cj8000-36-38.jpg"
    );
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg);
    expect(content).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  // TT-245 follow-up #2: the 18:00 spec cron and a photo requeue
  // colliding produced "Unable to connect to existing session … retry
  // or launch a new browser" in prod. Follow Cloudflare's lifecycle:
  // reuse idle sessions, retry transient acquisition failures, and fall
  // back to a fresh launch when a reused session turns out stale.
  it("reuses an idle session instead of launching a new browser", async () => {
    sessions.mockResolvedValue([
      { sessionId: "sess-1", startTime: 0 },
      { sessionId: "sess-busy", startTime: 0, connectionId: "conn-9" },
    ]);
    connect.mockResolvedValue({ newPage, close, disconnect });
    const browserFetch = makeBrowserFetch(BROWSER);

    const res = await browserFetch("https://revspin.net/rubber/");
    expect(connect).toHaveBeenCalledWith(BROWSER, "sess-1");
    expect(launch).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("retries a transient launch failure (session-collision error)", async () => {
    launch
      .mockRejectedValueOnce(
        new Error(
          "Unable to connect to existing session cf845358 (it may still be in use or not ready yet) - retry or launch a new browser: TypeError: Cannot read properties of null (reading 'accept')"
        )
      )
      .mockResolvedValueOnce({ newPage, close, disconnect });
    const browserFetch = makeBrowserFetch(BROWSER);

    const res = await browserFetch("https://revspin.net/rubber/");
    expect(launch).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  }, 15_000);

  it("does not retry a non-transient launch failure", async () => {
    launch.mockRejectedValue(new Error("Browser Rendering is not enabled"));
    const browserFetch = makeBrowserFetch(BROWSER);

    await expect(browserFetch("https://revspin.net/rubber/")).rejects.toThrow(
      "not enabled"
    );
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("falls back to a fresh launch when a reused session is stale", async () => {
    const staleClose = vi.fn().mockResolvedValue(undefined);
    sessions.mockResolvedValueOnce([{ sessionId: "sess-stale", startTime: 0 }]);
    connect.mockResolvedValue({
      newPage: vi
        .fn()
        .mockRejectedValue(
          new Error("Protocol error (Target.createTarget): Target closed.")
        ),
      close: staleClose,
      disconnect: vi.fn(),
    });
    const browserFetch = makeBrowserFetch(BROWSER);

    const res = await browserFetch("https://revspin.net/rubber/");
    // Stale session is closed outright (not kept warm), then the fetch
    // succeeds on a freshly launched browser.
    expect(staleClose).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html><body>rendered</body></html>");
  });

  it("accepts URL and Request-like inputs, not just strings", async () => {
    const browserFetch = makeBrowserFetch(BROWSER);

    await browserFetch(new URL("https://revspin.net/pips/long/"));
    expect(goto).toHaveBeenLastCalledWith(
      "https://revspin.net/pips/long/",
      expect.anything()
    );

    await browserFetch({ url: "https://revspin.net/rubber/" } as Request);
    expect(goto).toHaveBeenLastCalledWith(
      "https://revspin.net/rubber/",
      expect.anything()
    );
  });
});
