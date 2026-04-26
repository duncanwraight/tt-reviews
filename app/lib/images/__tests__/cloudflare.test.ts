import { describe, it, expect, afterEach, vi } from "vitest";
import {
  uploadImageToCloudflare,
  deleteImageFromCloudflare,
  buildCloudflareImageUrl,
  CLOUDFLARE_IMAGE_VARIANTS,
} from "../cloudflare";

const ENV = {
  IMAGES_ACCOUNT_ID: "acct_123",
  IMAGES_ACCOUNT_HASH: "hashABC",
  IMAGES_API_TOKEN: "tok_xyz",
};

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(
  responder: (call: FetchCall) => Response | Promise<Response>
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = global.fetch;
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const call = { url, init };
    calls.push(call);
    return responder(call);
  }) as typeof global.fetch;
  return {
    calls,
    restore: () => {
      global.fetch = original;
    },
  };
}

describe("uploadImageToCloudflare", () => {
  let restore: () => void = () => {};
  afterEach(() => restore());

  it("posts to the v4 images endpoint with bearer auth and multipart body", async () => {
    let captured: FetchCall | null = null;
    const stub = stubFetch(call => {
      captured = call;
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            id: "img-uuid-1",
            filename: "upload.png",
            uploaded: "2026-04-26T00:00:00Z",
            variants: [
              "https://imagedelivery.net/hashABC/img-uuid-1/thumbnail",
              "https://imagedelivery.net/hashABC/img-uuid-1/card",
              "https://imagedelivery.net/hashABC/img-uuid-1/full",
            ],
            meta: {},
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    restore = stub.restore;

    const result = await uploadImageToCloudflare(ENV, PNG_BYTES, {
      filename: "upload.png",
      contentType: "image/png",
      metadata: { equipment_id: "abc-123" },
    });

    expect(result.id).toBe("img-uuid-1");
    expect(result.variants).toHaveLength(3);
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct_123/images/v1"
    );
    expect(captured!.init?.method).toBe("POST");
    expect(
      (captured!.init?.headers as Record<string, string>).Authorization
    ).toBe("Bearer tok_xyz");
    expect(captured!.init?.body).toBeInstanceOf(FormData);

    const body = captured!.init!.body as FormData;
    expect(body.get("file")).toBeInstanceOf(Blob);
    expect(body.get("metadata")).toBe(
      JSON.stringify({ equipment_id: "abc-123" })
    );
  });

  it("omits metadata when none supplied", async () => {
    let captured: FetchCall | null = null;
    const stub = stubFetch(call => {
      captured = call;
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            id: "img-uuid-2",
            uploaded: "2026-04-26T00:00:00Z",
            variants: [],
          },
        }),
        { status: 200 }
      );
    });
    restore = stub.restore;

    await uploadImageToCloudflare(ENV, PNG_BYTES);

    const body = captured!.init!.body as FormData;
    expect(body.has("metadata")).toBe(false);
  });

  it("throws when CF returns success:false", async () => {
    const stub = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 5400, message: "Bad image" }],
          }),
          { status: 400 }
        )
    );
    restore = stub.restore;

    await expect(uploadImageToCloudflare(ENV, PNG_BYTES)).rejects.toThrow(
      /5400: Bad image/
    );
  });

  it("throws when env vars are missing", async () => {
    await expect(uploadImageToCloudflare({}, PNG_BYTES)).rejects.toThrow(
      /IMAGES_ACCOUNT_ID|IMAGES_API_TOKEN/
    );
  });

  it("accepts an ArrayBuffer payload", async () => {
    const stub = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            success: true,
            result: {
              id: "img-uuid-3",
              uploaded: "2026-04-26T00:00:00Z",
              variants: [],
            },
          }),
          { status: 200 }
        )
    );
    restore = stub.restore;

    const ab = PNG_BYTES.buffer.slice(
      PNG_BYTES.byteOffset,
      PNG_BYTES.byteOffset + PNG_BYTES.byteLength
    );
    const result = await uploadImageToCloudflare(ENV, ab);
    expect(result.id).toBe("img-uuid-3");
  });
});

describe("deleteImageFromCloudflare", () => {
  let restore: () => void = () => {};
  afterEach(() => restore());

  it("DELETEs the image by id with bearer auth", async () => {
    let captured: FetchCall | null = null;
    const stub = stubFetch(call => {
      captured = call;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    restore = stub.restore;

    await deleteImageFromCloudflare(ENV, "img-uuid-1");

    expect(captured!.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct_123/images/v1/img-uuid-1"
    );
    expect(captured!.init?.method).toBe("DELETE");
    expect(
      (captured!.init?.headers as Record<string, string>).Authorization
    ).toBe("Bearer tok_xyz");
  });

  it("treats 404 as success (already gone is the desired state)", async () => {
    const stub = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 5404, message: "Not found" }],
          }),
          { status: 404 }
        )
    );
    restore = stub.restore;

    await expect(
      deleteImageFromCloudflare(ENV, "missing")
    ).resolves.toBeUndefined();
  });

  it("throws on other failures", async () => {
    const stub = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 10000, message: "Authentication error" }],
          }),
          { status: 401 }
        )
    );
    restore = stub.restore;

    await expect(deleteImageFromCloudflare(ENV, "img-1")).rejects.toThrow(
      /401|Authentication/
    );
  });

  it("encodes the image id into the URL path", async () => {
    let captured: FetchCall | null = null;
    const stub = stubFetch(call => {
      captured = call;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    restore = stub.restore;

    await deleteImageFromCloudflare(ENV, "weird id/with slash");

    expect(captured!.url).toContain(encodeURIComponent("weird id/with slash"));
  });
});

describe("buildCloudflareImageUrl", () => {
  it("returns delivery URLs for each known variant", () => {
    const variants = Object.keys(CLOUDFLARE_IMAGE_VARIANTS) as Array<
      keyof typeof CLOUDFLARE_IMAGE_VARIANTS
    >;
    for (const v of variants) {
      const url = buildCloudflareImageUrl(ENV, "img-uuid-1", v);
      expect(url).toBe(
        `https://imagedelivery.net/hashABC/img-uuid-1/${CLOUDFLARE_IMAGE_VARIANTS[v]}`
      );
    }
  });

  it("encodes the image id", () => {
    const url = buildCloudflareImageUrl(ENV, "id with space", "thumbnail");
    expect(url).toContain(encodeURIComponent("id with space"));
  });

  it("throws when the account hash is missing", () => {
    expect(() =>
      buildCloudflareImageUrl({ IMAGES_ACCOUNT_HASH: "" }, "id", "thumbnail")
    ).toThrow(/IMAGES_ACCOUNT_HASH/);
  });
});
