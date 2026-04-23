import { describe, it, expect } from "vitest";
import {
  validateImageFile,
  generateImageKey,
  isValidImageKey,
  handleImageUploadNative,
  uploadImageToR2Native,
} from "../r2-native.server";

/**
 * Regression guard for SECURITY.md Phase 6 (TT-15). Before this phase:
 *  - /api/images/* happily fetched any R2 key, including path-traversal.
 *  - Upload validation trusted the browser-supplied `file.type`, so a .svg
 *    renamed to foo.jpg with `Content-Type: image/jpeg` was stored verbatim
 *    and served back under its forged header.
 *  - The object key's extension was pulled from `file.name`, so attackers
 *    controlled part of the stored path.
 *
 * These tests pin the new magic-byte + prefix-allowlist behaviour.
 */

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const JPEG_MAGIC = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0);
const PNG_MAGIC = bytes(
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0,
  0,
  0,
  0
);
const WEBP_MAGIC = bytes(
  0x52,
  0x49,
  0x46,
  0x46,
  0,
  0,
  0,
  0,
  0x57,
  0x45,
  0x42,
  0x50
);
const SVG_BODY = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
);

function makeFile(
  name: string,
  type: string,
  payload: Uint8Array,
  padding = 0
): File {
  const buffers: BlobPart[] = [payload as unknown as BlobPart];
  if (padding > 0) {
    buffers.push(new Uint8Array(padding));
  }
  return new File(buffers, name, { type });
}

describe("validateImageFile — magic-byte detection", () => {
  it("accepts a JPEG payload regardless of filename case", async () => {
    const file = makeFile("foo.JPEG", "image/jpeg", JPEG_MAGIC);
    const result = await validateImageFile(file);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("image/jpeg");
    expect(result.extension).toBe("jpg");
  });

  it("accepts a PNG payload", async () => {
    const file = makeFile("foo.png", "image/png", PNG_MAGIC);
    const result = await validateImageFile(file);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("image/png");
    expect(result.extension).toBe("png");
  });

  it("accepts a WebP payload", async () => {
    const file = makeFile("foo.webp", "image/webp", WEBP_MAGIC);
    const result = await validateImageFile(file);
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("image/webp");
    expect(result.extension).toBe("webp");
  });

  it("rejects an SVG renamed to .jpg with image/jpeg content-type", async () => {
    const file = makeFile("malicious.jpg", "image/jpeg", SVG_BODY);
    const result = await validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.detectedType).toBeUndefined();
  });

  it("rejects a plain text file with a fake image extension", async () => {
    const file = makeFile(
      "payload.png",
      "image/png",
      new TextEncoder().encode("not-an-image-at-all".padEnd(32, "x"))
    );
    const result = await validateImageFile(file);
    expect(result.valid).toBe(false);
  });

  it("rejects a file under 12 bytes", async () => {
    const file = makeFile("tiny.jpg", "image/jpeg", bytes(0xff, 0xd8, 0xff));
    const result = await validateImageFile(file);
    expect(result.valid).toBe(false);
  });

  it("rejects an empty file", async () => {
    const file = new File([], "empty.jpg", { type: "image/jpeg" });
    const result = await validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it("rejects a file larger than 10MB even if it starts with a JPEG magic", async () => {
    const oversize = concat(JPEG_MAGIC, new Uint8Array(10 * 1024 * 1024));
    const file = makeFile("huge.jpg", "image/jpeg", oversize);
    const result = await validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/10MB/);
  });
});

describe("generateImageKey", () => {
  it("places the validated extension in the key, not whatever the client sent", () => {
    const key = generateImageKey("equipment", "abc-123", "jpg");
    expect(key).toMatch(/^equipment\/abc-123\/\d+\.jpg$/);
  });

  it("strips path separators from the id segment", () => {
    const key = generateImageKey("player", "../etc/passwd", "png");
    expect(key).not.toMatch(/\.\./);
    expect(key).not.toMatch(/\//g.source.length > 1 ? /\/.*\/.*\// : /never/);
    expect(key.split("/")).toHaveLength(3);
    expect(key.startsWith("player/")).toBe(true);
  });

  it("strips null bytes and control chars from the id", () => {
    const key = generateImageKey("equipment", "ab\x00cd\x1f", "jpg");
    expect(key.includes("\x00")).toBe(false);
    expect(key.includes("\x1f")).toBe(false);
  });

  it("falls back to 'unknown' when the id sanitizes to empty", () => {
    const key = generateImageKey("equipment", "../..", "jpg");
    expect(key).toMatch(/^equipment\/unknown\/\d+\.jpg$/);
  });
});

describe("isValidImageKey", () => {
  it("accepts well-formed equipment and player keys", () => {
    expect(isValidImageKey("equipment/abc/123.jpg")).toBe(true);
    expect(isValidImageKey("player/xyz/999.png")).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(isValidImageKey("equipment/../etc/passwd")).toBe(false);
    expect(isValidImageKey("../secrets")).toBe(false);
    expect(isValidImageKey("equipment/..\\foo")).toBe(false);
  });

  it("rejects keys outside the allowlist", () => {
    expect(isValidImageKey("secrets/foo.jpg")).toBe(false);
    expect(isValidImageKey("admin/anything")).toBe(false);
    expect(isValidImageKey("")).toBe(false);
  });

  it("rejects absolute-path keys", () => {
    expect(isValidImageKey("/equipment/foo.jpg")).toBe(false);
  });

  it("rejects null bytes", () => {
    expect(isValidImageKey("equipment/foo\x00.jpg")).toBe(false);
  });
});

describe("handleImageUploadNative — integration", () => {
  function makeBucketStub() {
    const store = new Map<
      string,
      {
        body: ArrayBuffer;
        httpMetadata: { contentType: string };
        customMetadata: Record<string, string>;
      }
    >();
    const bucket = {
      put: async (
        key: string,
        body: ArrayBuffer,
        opts: {
          httpMetadata: { contentType: string };
          customMetadata: Record<string, string>;
        }
      ) => {
        store.set(key, {
          body,
          httpMetadata: opts.httpMetadata,
          customMetadata: opts.customMetadata,
        });
      },
    } as unknown as R2Bucket;
    return { bucket, store };
  }

  it("stores the validated content-type, not the client-supplied one", async () => {
    const { bucket, store } = makeBucketStub();
    const formData = new FormData();
    formData.set("image", makeFile("shot.png", "image/jpeg", PNG_MAGIC));

    const result = await handleImageUploadNative(
      formData,
      bucket,
      "equipment",
      "abc",
      "image"
    );

    expect(result.success).toBe(true);
    expect(result.key).toMatch(/^equipment\/abc\/\d+\.png$/);
    const stored = store.get(result.key!);
    expect(stored?.httpMetadata.contentType).toBe("image/png");
  });

  it("rejects an SVG disguised as JPEG without writing anything to R2", async () => {
    const { bucket, store } = makeBucketStub();
    const formData = new FormData();
    formData.set("image", makeFile("evil.jpg", "image/jpeg", SVG_BODY));

    const result = await handleImageUploadNative(
      formData,
      bucket,
      "equipment",
      "abc",
      "image"
    );

    expect(result.success).toBe(false);
    expect(store.size).toBe(0);
  });
});

describe("uploadImageToR2Native", () => {
  it("sanitizes the stored originalName metadata", async () => {
    const store = new Map<string, { customMetadata: Record<string, string> }>();
    const bucket = {
      put: async (
        key: string,
        _body: ArrayBuffer,
        opts: { customMetadata: Record<string, string> }
      ) => {
        store.set(key, { customMetadata: opts.customMetadata });
      },
    } as unknown as R2Bucket;

    await uploadImageToR2Native(
      bucket,
      "equipment/abc/1.jpg",
      makeFile("../../evil\x00.jpg", "image/jpeg", JPEG_MAGIC),
      "image/jpeg"
    );

    const stored = store.get("equipment/abc/1.jpg");
    expect(stored?.customMetadata.originalName).not.toContain("..");
    expect(stored?.customMetadata.originalName).not.toContain("/");
    expect(stored?.customMetadata.originalName).not.toContain("\x00");
  });
});
