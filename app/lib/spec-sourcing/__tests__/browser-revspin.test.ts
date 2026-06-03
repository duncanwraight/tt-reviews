import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TT-245 — revspin.net 403s plain Workers `fetch()` on a TLS
// fingerprint check, so on the deployed Worker the spec source and
// photo provider must route through Cloudflare Browser Rendering. This
// test stands in a fake headless Chromium (mocked puppeteer) that
// renders a canned revspin page, then drives both factories with a
// BROWSER binding present and asserts the revspin entry fetches via the
// browser and parses correctly — and that with no binding (local / CI)
// the factories fall back to the plain-`fetch` singletons untouched.

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

import { buildSpecSourcingFromEnv } from "../factory";
import { revspinSource } from "../sources/revspin";
import { _clearRevspinListCache } from "../sources/revspin";
import { _resetSpecSourcingThrottle } from "../sources/http";
import { buildProvidersFromEnv } from "../../photo-sourcing/providers/factory";
import {
  revspinProvider,
  _clearListCache,
} from "../../photo-sourcing/providers/revspin";
import type { SourcingEnv } from "../../photo-sourcing/source.server";
import type { EquipmentSeed } from "../../photo-sourcing/brave.server";

// The canned page doubles as both a category list (the <a>+<tr> rows
// parseProductTable reads) and a product detail page (the og:image meta
// parseProductImageUrl reads), so one render serves list + detail.
const REVSPIN_HTML = `<html><head>
<meta property="og:image" content="https://revspin.net/images/blade/butterfly-viscaria.jpg">
</head><body><table>
<tr><td><a href="blade/butterfly-viscaria.html">Butterfly Viscaria</a></td><td>9.5</td><td>8.0</td><td>7.0</td><td>9.2</td></tr>
</table></body></html>`;

const BROWSER = { fetch: vi.fn() } as unknown as Fetcher;

// Minimal HTTPResponse stand-in: status + headers are all the wrapper
// reads; an HTML content-type keeps it on the rendered-DOM path.
function htmlResp(status: number) {
  return {
    status: () => status,
    headers: () => ({ "content-type": "text/html; charset=utf-8" }),
  };
}

beforeEach(() => {
  launch.mockReset();
  goto.mockReset();
  content.mockReset();
  newPage.mockReset();
  close.mockReset();

  content.mockResolvedValue(REVSPIN_HTML);
  goto.mockResolvedValue(htmlResp(200));
  newPage.mockResolvedValue({ goto, content });
  close.mockResolvedValue(undefined);
  launch.mockResolvedValue({ newPage, close });

  _clearRevspinListCache();
  _clearListCache();
  _resetSpecSourcingThrottle();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("spec-sourcing factory — revspin via Browser Rendering", () => {
  it("fetches the revspin list through headless Chromium when BROWSER is bound", async () => {
    const { sources } = buildSpecSourcingFromEnv({
      GEMINI_API_KEY: "stub",
      BROWSER,
    });
    const revspin = sources.find(s => s.id === "revspin");
    expect(revspin).toBeDefined();
    // Swapped for a browser-backed instance, not the plain-fetch singleton.
    expect(revspin).not.toBe(revspinSource);

    const candidates = await revspin!.search({
      brand: "Butterfly",
      name: "Viscaria",
      slug: "butterfly-viscaria",
      category: "blade",
    });

    expect(launch).toHaveBeenCalledWith(BROWSER);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].url).toBe(
      "https://revspin.net/blade/butterfly-viscaria.html"
    );
  });

  it("falls back to the plain-fetch singleton when no BROWSER binding exists", () => {
    const { sources } = buildSpecSourcingFromEnv({ GEMINI_API_KEY: "stub" });
    const revspin = sources.find(s => s.id === "revspin");
    expect(revspin).toBe(revspinSource);
    expect(launch).not.toHaveBeenCalled();
  });
});

describe("photo-sourcing factory — revspin via Browser Rendering", () => {
  it("resolves a candidate through headless Chromium when BROWSER is bound", async () => {
    const providers = buildProvidersFromEnv({ BROWSER });
    const revspin = providers.find(p => p.name === "revspin");
    expect(revspin).toBeDefined();
    expect(revspin).not.toBe(revspinProvider);

    const seed = {
      name: "Butterfly Viscaria",
      slug: "butterfly-viscaria",
      category: "blade",
      subcategory: null,
    } as unknown as EquipmentSeed;

    const result = await revspin!.resolveCandidates(
      seed,
      {} as unknown as SourcingEnv
    );

    expect(launch).toHaveBeenCalledWith(BROWSER);
    expect(result.status).toBe("ok");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].imageUrl).toBe(
      "https://revspin.net/images/blade/butterfly-viscaria.jpg"
    );
  });

  it("falls back to the plain-fetch singleton when no BROWSER binding exists", () => {
    const providers = buildProvidersFromEnv({});
    const revspin = providers.find(p => p.name === "revspin");
    expect(revspin).toBe(revspinProvider);
    expect(launch).not.toHaveBeenCalled();
  });
});
