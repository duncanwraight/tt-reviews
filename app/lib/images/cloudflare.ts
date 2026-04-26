// Cloudflare Images REST helpers for the equipment photo sourcing flow
// (TT-48). CF Images is account-level and isn't a wrangler binding —
// uploads go through `https://api.cloudflare.com/client/v4` with a
// short-lived API token, and rendering uses the `imagedelivery.net`
// CDN with a per-account hash.
//
// Why CF Images and not R2 (which TT-36 uses for player photos):
// product images need normalization (webp + EXIF strip + resize to
// the variants below). R2 just stores bytes. The Workers runtime can't
// run sharp, so the choice is "do nothing" or "let CF Images do it".
// Players stay on R2 — TT-36 ships byte-perfect Wikimedia/WTT photos
// where re-encoding would be wrong.
//
// Variant names below MUST match variants configured in the CF Images
// dashboard for `IMAGES_ACCOUNT_HASH`. Adjust both ends together.

const API_BASE = "https://api.cloudflare.com/client/v4";
const DELIVERY_BASE = "https://imagedelivery.net";

export const CLOUDFLARE_IMAGE_VARIANTS = {
  thumbnail: "thumbnail",
  card: "card",
  full: "full",
} as const;

export type CloudflareImageVariant = keyof typeof CLOUDFLARE_IMAGE_VARIANTS;

export interface CloudflareImagesEnv {
  IMAGES_ACCOUNT_ID: string;
  IMAGES_ACCOUNT_HASH: string;
  IMAGES_API_TOKEN: string;
}

export interface CloudflareImageUploadResult {
  id: string;
  filename: string | null;
  uploaded: string;
  variants: string[];
  meta: Record<string, string>;
}

export interface CloudflareImageUploadOptions {
  // Caller-supplied filename; CF Images echoes this back in the result
  // and uses it for the `Content-Disposition` of original downloads.
  filename?: string;
  // Optional metadata stored alongside the image (≤1024 bytes total).
  // Useful for tracing back to the equipment row and source URL.
  metadata?: Record<string, string>;
  // Optional content type; if omitted, CF Images sniffs from bytes.
  contentType?: string;
}

interface CloudflareApiResponse<T> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: T;
}

function readEnv(env: Partial<CloudflareImagesEnv>): CloudflareImagesEnv {
  const accountId = env.IMAGES_ACCOUNT_ID;
  const accountHash = env.IMAGES_ACCOUNT_HASH;
  const apiToken = env.IMAGES_API_TOKEN;
  if (!accountId || !accountHash || !apiToken) {
    throw new Error(
      "Cloudflare Images env not configured: need IMAGES_ACCOUNT_ID, IMAGES_ACCOUNT_HASH, IMAGES_API_TOKEN"
    );
  }
  return {
    IMAGES_ACCOUNT_ID: accountId,
    IMAGES_ACCOUNT_HASH: accountHash,
    IMAGES_API_TOKEN: apiToken,
  };
}

function formatErrors(
  errors: CloudflareApiResponse<unknown>["errors"]
): string {
  if (!errors?.length) return "unknown error";
  return errors.map(e => `${e.code}: ${e.message}`).join("; ");
}

// Upload bytes to Cloudflare Images. Returns the assigned image ID
// (UUID) and the variant URLs CF generated. The caller persists the
// ID; variant URLs are reconstructed at render time via
// `buildCloudflareImageUrl` so we don't store CDN URLs in the DB.
export async function uploadImageToCloudflare(
  env: Partial<CloudflareImagesEnv>,
  bytes: ArrayBuffer | Uint8Array | Blob,
  options: CloudflareImageUploadOptions = {}
): Promise<CloudflareImageUploadResult> {
  const cfg = readEnv(env);
  const url = `${API_BASE}/accounts/${cfg.IMAGES_ACCOUNT_ID}/images/v1`;

  const blob =
    bytes instanceof Blob
      ? bytes
      : new Blob(
          [bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).buffer],
          options.contentType ? { type: options.contentType } : undefined
        );

  const form = new FormData();
  form.set("file", blob, options.filename ?? "upload.bin");
  if (options.metadata && Object.keys(options.metadata).length > 0) {
    form.set("metadata", JSON.stringify(options.metadata));
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.IMAGES_API_TOKEN}`,
    },
    body: form,
  });

  const json = (await res.json()) as CloudflareApiResponse<{
    id: string;
    filename?: string;
    uploaded: string;
    variants: string[];
    meta?: Record<string, string>;
  }>;

  if (!res.ok || !json.success || !json.result) {
    throw new Error(
      `Cloudflare Images upload failed (${res.status}): ${formatErrors(json.errors)}`
    );
  }

  return {
    id: json.result.id,
    filename: json.result.filename ?? null,
    uploaded: json.result.uploaded,
    variants: json.result.variants ?? [],
    meta: json.result.meta ?? {},
  };
}

// Delete an image by its CF Images ID. Idempotent — a 404 from CF is
// treated as success because the desired state (image gone) holds.
export async function deleteImageFromCloudflare(
  env: Partial<CloudflareImagesEnv>,
  imageId: string
): Promise<void> {
  const cfg = readEnv(env);
  const url = `${API_BASE}/accounts/${cfg.IMAGES_ACCOUNT_ID}/images/v1/${encodeURIComponent(imageId)}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${cfg.IMAGES_API_TOKEN}`,
    },
  });

  if (res.status === 404) return;

  if (!res.ok) {
    let detail = "";
    try {
      const json = (await res.json()) as CloudflareApiResponse<unknown>;
      detail = formatErrors(json.errors);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(
      `Cloudflare Images delete failed (${res.status}): ${detail}`
    );
  }
}

// Build a delivery URL for a CF Image at a known variant. Pure string
// work — no fetch, safe to call from loaders.
export function buildCloudflareImageUrl(
  env: Pick<CloudflareImagesEnv, "IMAGES_ACCOUNT_HASH">,
  imageId: string,
  variant: CloudflareImageVariant
): string {
  if (!env.IMAGES_ACCOUNT_HASH) {
    throw new Error("IMAGES_ACCOUNT_HASH not configured");
  }
  return `${DELIVERY_BASE}/${env.IMAGES_ACCOUNT_HASH}/${encodeURIComponent(imageId)}/${CLOUDFLARE_IMAGE_VARIANTS[variant]}`;
}
