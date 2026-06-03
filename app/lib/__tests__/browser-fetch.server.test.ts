import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserWorker } from "@cloudflare/puppeteer";

// Mock the Browser Rendering driver. makeBrowserFetch imports puppeteer
// as a default export and calls puppeteer.launch — we stand in a fake
// browser/page so the wrapper can be exercised without a real Chromium.
const goto = vi.fn();
const content = vi.fn();
const close = vi.fn();
const newPage = vi.fn();
const launch = vi.fn();
const waitForNavigation = vi.fn();

vi.mock("@cloudflare/puppeteer", () => ({
  default: {
    launch: (...args: unknown[]) => launch(...args),
  },
}));

import { makeBrowserFetch } from "../browser-fetch.server";

// A token binding — makeBrowserFetch only forwards it to puppeteer.launch.
const BROWSER = { fetch: vi.fn() } as unknown as BrowserWorker;

beforeEach(() => {
  goto.mockReset();
  content.mockReset();
  close.mockReset();
  newPage.mockReset();
  launch.mockReset();
  waitForNavigation.mockReset();

  content.mockResolvedValue("<html><body>rendered</body></html>");
  goto.mockResolvedValue({ status: () => 200 });
  waitForNavigation.mockResolvedValue(null);
  newPage.mockResolvedValue({ goto, content, waitForNavigation });
  close.mockResolvedValue(undefined);
  launch.mockResolvedValue({ newPage, close });
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
    goto.mockResolvedValue({ status: () => 403 });
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

  it("closes the browser session after a successful render", async () => {
    const browserFetch = makeBrowserFetch(BROWSER);
    await browserFetch("https://revspin.net/rubber/");
    expect(close).toHaveBeenCalledTimes(1);
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
    expect(close).toHaveBeenCalledTimes(1);
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
