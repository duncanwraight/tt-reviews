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

  content.mockResolvedValue("<html><body>rendered</body></html>");
  goto.mockResolvedValue({ status: () => 200 });
  newPage.mockResolvedValue({ goto, content });
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

  it("closes the browser session even when navigation throws", async () => {
    goto.mockRejectedValue(new Error("nav timeout"));
    const browserFetch = makeBrowserFetch(BROWSER);

    await expect(browserFetch("https://revspin.net/rubber/")).rejects.toThrow(
      "nav timeout"
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
