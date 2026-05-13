import { describe, expect, it, vi } from "vitest";

import { downloadAndStoreHeadshot, type R2PutBucket } from "../photo.server";

function makeBucket(): R2PutBucket & {
  puts: Array<{
    key: string;
    body: ArrayBuffer | Uint8Array;
    options: unknown;
  }>;
} {
  const puts: Array<{
    key: string;
    body: ArrayBuffer | Uint8Array;
    options: unknown;
  }> = [];
  return {
    puts,
    async put(key, body, options) {
      puts.push({ key, body, options });
    },
  };
}

function fetchReturning(
  status: number,
  contentType: string | null,
  bytes: Uint8Array
): typeof fetch {
  return vi.fn(async () => {
    const headers = new Headers();
    if (contentType) headers.set("content-type", contentType);
    return new Response(bytes.byteLength === 0 ? null : bytes, {
      status,
      headers,
    });
  }) as unknown as typeof fetch;
}

describe("downloadAndStoreHeadshot", () => {
  it("stores JPEG bytes under player/<slug>/headshot.jpg", async () => {
    const bucket = makeBucket();
    const result = await downloadAndStoreHeadshot(
      "https://wtt.example/headshots/lin.jpg",
      "lin-shidong",
      bucket,
      132473,
      fetchReturning(
        200,
        "image/jpeg",
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
      )
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.headshot).toMatchObject({
      image_key: "player/lin-shidong/headshot.jpg",
      content_type: "image/jpeg",
      byte_length: 4,
    });
    expect(bucket.puts).toHaveLength(1);
    expect(bucket.puts[0].key).toBe("player/lin-shidong/headshot.jpg");
  });

  it("falls back to URL extension when content-type is absent", async () => {
    const bucket = makeBucket();
    const result = await downloadAndStoreHeadshot(
      "https://wtt.example/headshots/lin.png",
      "lin-shidong",
      bucket,
      132473,
      fetchReturning(200, null, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.headshot.image_key).toBe("player/lin-shidong/headshot.png");
  });

  it("returns http_status failure on non-OK responses (TT-208)", async () => {
    const bucket = makeBucket();
    const result = await downloadAndStoreHeadshot(
      "https://wtt.example/headshots/missing.jpg",
      "lin-shidong",
      bucket,
      132473,
      fetchReturning(404, "text/plain", new Uint8Array())
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      reason: "http_status",
      status: 404,
    });
    expect(bucket.puts).toHaveLength(0);
  });

  it("returns zero_bytes failure on empty body (TT-208)", async () => {
    const bucket = makeBucket();
    const result = await downloadAndStoreHeadshot(
      "https://wtt.example/headshots/empty.jpg",
      "lin-shidong",
      bucket,
      132473,
      fetchReturning(200, "image/jpeg", new Uint8Array())
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      reason: "zero_bytes",
      status: 200,
    });
    expect(bucket.puts).toHaveLength(0);
  });

  it("returns r2_upload_error failure when R2 throws (TT-208)", async () => {
    const bucket: R2PutBucket = {
      put: vi.fn(async () => {
        throw new Error("R2 unavailable");
      }),
    };
    const result = await downloadAndStoreHeadshot(
      "https://wtt.example/headshots/lin.jpg",
      "lin-shidong",
      bucket,
      132473,
      fetchReturning(200, "image/jpeg", new Uint8Array([0xff, 0xd8, 0xff]))
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toMatchObject({
      reason: "r2_upload_error",
      message: expect.stringContaining("R2 unavailable"),
    });
  });

  it("attaches custom metadata (ittfid, slug, source URL)", async () => {
    const bucket = makeBucket();
    await downloadAndStoreHeadshot(
      "https://wtt.example/headshots/lin.jpg",
      "lin-shidong",
      bucket,
      132473,
      fetchReturning(200, "image/jpeg", new Uint8Array([0xff, 0xd8]))
    );

    const opts = bucket.puts[0].options as {
      customMetadata: Record<string, string>;
    };
    expect(opts.customMetadata).toMatchObject({
      ittfid: "132473",
      player_slug: "lin-shidong",
      source_url: "https://wtt.example/headshots/lin.jpg",
    });
  });
});
