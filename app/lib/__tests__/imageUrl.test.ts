import { describe, it, expect } from "vitest";
import {
  buildEquipmentImageUrl,
  buildEquipmentImageSrcSet,
  buildPlayerImageUrl,
  buildPlayerImageSrcSet,
} from "../imageUrl";

describe("buildEquipmentImageUrl", () => {
  it("emits a cdn-cgi/image transform URL with the variant width", () => {
    expect(buildEquipmentImageUrl("eq/abc.jpg", "card")).toBe(
      "/cdn-cgi/image/width=512,format=auto,fit=scale-down/api/images/eq/abc.jpg"
    );
  });

  it("appends ,trim=border when trimKind is set", () => {
    expect(buildEquipmentImageUrl("eq/abc.jpg", "thumbnail", "auto")).toBe(
      "/cdn-cgi/image/width=256,format=auto,fit=scale-down,trim=border/api/images/eq/abc.jpg"
    );
  });
});

describe("buildEquipmentImageSrcSet", () => {
  it("emits one entry per declared variant width, smallest first", () => {
    const srcset = buildEquipmentImageSrcSet("eq/abc.jpg");
    expect(srcset).toBe(
      [
        "/cdn-cgi/image/width=256,format=auto,fit=scale-down/api/images/eq/abc.jpg 256w",
        "/cdn-cgi/image/width=512,format=auto,fit=scale-down/api/images/eq/abc.jpg 512w",
        "/cdn-cgi/image/width=1024,format=auto,fit=scale-down/api/images/eq/abc.jpg 1024w",
      ].join(", ")
    );
  });

  it("propagates trimKind to every entry", () => {
    const srcset = buildEquipmentImageSrcSet("eq/abc.jpg", "border");
    expect(srcset).toContain("width=256");
    expect(srcset).toContain("width=512");
    expect(srcset).toContain("width=1024");
    // trim=border should appear in every entry — three matches total.
    expect(srcset.match(/trim=border/g)?.length).toBe(3);
  });
});

describe("buildPlayerImageUrl", () => {
  it("transforms via cdn-cgi/image with the requested width", () => {
    expect(buildPlayerImageUrl("pl/lin-shidong.jpg", null, 288)).toBe(
      "/cdn-cgi/image/width=288,format=auto,fit=cover/api/images/pl/lin-shidong.jpg"
    );
  });

  it("preserves the etag cache-buster on the source URL", () => {
    expect(buildPlayerImageUrl("pl/lin-shidong.jpg", "abc123", 144)).toBe(
      "/cdn-cgi/image/width=144,format=auto,fit=cover/api/images/pl/lin-shidong.jpg?v=abc123"
    );
  });

  it("URL-encodes etag values that contain special chars", () => {
    expect(buildPlayerImageUrl("pl/x.jpg", "abc/def=", 144)).toContain(
      "?v=abc%2Fdef%3D"
    );
  });
});

describe("buildPlayerImageSrcSet", () => {
  it("emits 144w/288w/576w pairs", () => {
    const srcset = buildPlayerImageSrcSet("pl/lin-shidong.jpg", null);
    expect(srcset.split(", ")).toHaveLength(3);
    expect(srcset).toContain("144w");
    expect(srcset).toContain("288w");
    expect(srcset).toContain("576w");
  });
});
