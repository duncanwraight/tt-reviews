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

    expect(result).toMatchObject({
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

    expect(result?.image_key).toBe("player/lin-shidong/headshot.png");
  });

  it("returns null on non-OK responses", async () => {
    const bucket = makeBucket();
    const result = await downloadAndStoreHeadshot(
      "https://wtt.example/headshots/missing.jpg",
      "lin-shidong",
      bucket,
      132473,
      fetchReturning(404, "text/plain", new Uint8Array())
    );

    expect(result).toBeNull();
    expect(bucket.puts).toHaveLength(0);
  });

  it("returns null on empty body", async () => {
    const bucket = makeBucket();
    const result = await downloadAndStoreHeadshot(
      "https://wtt.example/headshots/empty.jpg",
      "lin-shidong",
      bucket,
      132473,
      fetchReturning(200, "image/jpeg", new Uint8Array())
    );

    expect(result).toBeNull();
    expect(bucket.puts).toHaveLength(0);
  });

  it("returns null and skips R2 PUT when R2 throws", async () => {
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

    expect(result).toBeNull();
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
