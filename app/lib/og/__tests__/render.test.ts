import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// workers-og statically imports a yoga WASM file that node/vitest can't
// resolve (the package targets the Workers runtime). Stub it — these
// tests don't exercise the Satori → PNG pipeline, only the hero-image
// fetch path.
vi.mock("workers-og", () => ({
  ImageResponse: class {},
  loadGoogleFont: vi.fn(),
}));

import { fetchImageAsDataUrl } from "../render.server";
import { Logger } from "~/lib/logger.server";

// Regression coverage for TT-153: the OG hero fetch must call CF Image
// Transformations via the `cf.image` fetch option, not via a
// `/cdn-cgi/image/...` URL. URL-form transforms only intercept at the
// edge — Worker subrequests on the same zone bounce back into the
// router and 404, so every dynamic OG card was rendering the no-hero
// placeholder in prod.

const ctx = { requestId: "test-req" };
const REQUEST = new Request("https://tabletennis.reviews/og/equipment/x.png");

function pngResponse(): Response {
  // Minimal "PNG" body — the function only inspects content-type and
  // base64-encodes the bytes, so any byte string works.
  return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, {
    headers: { "Content-Type": "image/png" },
  });
}

describe("fetchImageAsDataUrl", () => {
  // The fetch signature has multiple overloads under cf workers types,
  // so the inferred MockInstance generic can't satisfy ReturnType<typeof
  // vi.spyOn>. Type the spies loosely — we only need .mock.calls and
  // .mockResolvedValueOnce, both of which exist on every spy variant.

  let fetchSpy: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    warnSpy = vi
      .spyOn(Logger, "warn")
      .mockImplementation(() => {}) as unknown as ReturnType<typeof vi.fn>;
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        pngResponse() as unknown as Response
      ) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("passes width/format/fit through cf.image (not a /cdn-cgi/image URL)", async () => {
    await fetchImageAsDataUrl(
      "/api/images/abc",
      { width: 512, format: "png", fit: "scale-down" },
      REQUEST,
      ctx
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    // Must be the bare source URL, not the URL-form transform path.
    expect(url).toBe("https://tabletennis.reviews/api/images/abc");
    expect(url).not.toMatch(/\/cdn-cgi\/image\//);
    // cf.image carries the transform spec.
    expect((init as { cf?: { image?: unknown } }).cf?.image).toEqual({
      width: 512,
      format: "png",
      fit: "scale-down",
    });
  });

  it("forwards trim:'border' when set", async () => {
    await fetchImageAsDataUrl(
      "/api/images/abc",
      { width: 512, format: "png", fit: "scale-down", trim: "border" },
      REQUEST,
      ctx
    );
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(
      (init as { cf?: { image?: { trim?: unknown } } }).cf?.image?.trim
    ).toBe("border");
  });

  it("returns a data URL when content-type is image/png", async () => {
    const result = await fetchImageAsDataUrl(
      "/api/images/abc",
      { width: 512, format: "png", fit: "scale-down" },
      REQUEST,
      ctx
    );
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null and warns when the source returns a non-image body", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("<!doctype html><html>", {
        headers: { "Content-Type": "text/html" },
      }) as unknown as Response
    );
    const result = await fetchImageAsDataUrl(
      "/api/images/abc",
      { width: 512, format: "png", fit: "scale-down" },
      REQUEST,
      ctx
    );
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "og.image_fetch.unsupported_format",
      ctx,
      expect.objectContaining({
        contentType: expect.stringContaining("text/html"),
      })
    );
  });

  it("returns null and warns when the source 404s", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("not found", { status: 404 }) as unknown as Response
    );
    const result = await fetchImageAsDataUrl(
      "/api/images/abc",
      { width: 512, format: "png", fit: "scale-down" },
      REQUEST,
      ctx
    );
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "og.image_fetch.failed",
      ctx,
      expect.objectContaining({ status: 404 })
    );
  });
});
