import { describe, it, expect, vi } from "vitest";
import { detectTransparentEdges } from "../trim-detect";

// Helpers to build synthetic 2x2 RGBA buffers without invoking jsquash.
// The detector only inspects 4 corner-pixel alpha bytes, so the actual
// pixel layout we hand it is what matters.

function transparent2x2() {
  // All four pixels alpha=0.
  return {
    data: new Uint8ClampedArray([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]),
    width: 2,
    height: 2,
  };
}

function opaque2x2() {
  return {
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]),
    width: 2,
    height: 2,
  };
}

function mixedCorners() {
  // tl=0, tr=255, bl=0, br=0 — one opaque corner kills the auto-trim.
  return {
    data: new Uint8ClampedArray([
      0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0,
    ]),
    width: 2,
    height: 2,
  };
}

describe("detectTransparentEdges", () => {
  it("returns true for PNG when all four corners are alpha < 32", async () => {
    const decodePng = vi.fn().mockResolvedValue(transparent2x2());
    const result = await detectTransparentEdges(
      new ArrayBuffer(8),
      "image/png",
      { decodePng }
    );
    expect(result).toBe(true);
    expect(decodePng).toHaveBeenCalledOnce();
  });

  it("returns true for WebP via the webp decoder", async () => {
    const decodePng = vi.fn();
    const decodeWebp = vi.fn().mockResolvedValue(transparent2x2());
    const result = await detectTransparentEdges(
      new ArrayBuffer(8),
      "image/webp",
      { decodePng, decodeWebp }
    );
    expect(result).toBe(true);
    expect(decodePng).not.toHaveBeenCalled();
    expect(decodeWebp).toHaveBeenCalledOnce();
  });

  it("returns false when corners are opaque", async () => {
    const decodePng = vi.fn().mockResolvedValue(opaque2x2());
    expect(
      await detectTransparentEdges(new ArrayBuffer(8), "image/png", {
        decodePng,
      })
    ).toBe(false);
  });

  it("returns false when even one corner is opaque", async () => {
    const decodePng = vi.fn().mockResolvedValue(mixedCorners());
    expect(
      await detectTransparentEdges(new ArrayBuffer(8), "image/png", {
        decodePng,
      })
    ).toBe(false);
  });

  it("returns false for JPEG without invoking any decoder", async () => {
    const decodePng = vi.fn();
    const decodeWebp = vi.fn();
    expect(
      await detectTransparentEdges(new ArrayBuffer(8), "image/jpeg", {
        decodePng,
        decodeWebp,
      })
    ).toBe(false);
    expect(decodePng).not.toHaveBeenCalled();
    expect(decodeWebp).not.toHaveBeenCalled();
  });

  it("returns false when decode throws (graceful degradation)", async () => {
    const decodePng = vi.fn().mockRejectedValue(new Error("corrupt"));
    expect(
      await detectTransparentEdges(new ArrayBuffer(8), "image/png", {
        decodePng,
      })
    ).toBe(false);
  });

  it("handles content-type with charset suffix", async () => {
    const decodePng = vi.fn().mockResolvedValue(transparent2x2());
    expect(
      await detectTransparentEdges(
        new ArrayBuffer(8),
        "image/png; charset=binary",
        { decodePng }
      )
    ).toBe(true);
  });
});
