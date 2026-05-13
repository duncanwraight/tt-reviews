// Player headshot downloader + R2 uploader (TT-201).
//
// Pulls bytes from the upstream WTT (or ITTF) headshot URL, infers an
// extension from the content-type, and writes to R2 under
// player/<slug>/headshot.<ext>. The bytes are stored in their source
// format — Cloudflare Image Resizing handles WebP/AVIF transforms on
// read. Mirrors the approach in app/lib/photo-sourcing/source.server.ts.

const DOWNLOAD_TIMEOUT_MS = 8000;

const DOWNLOAD_USER_AGENT =
  "tt-reviews-importer/0.1 (+https://tabletennis.reviews; duncan@wraight-consulting.co.uk)";

// Minimal R2 surface so unit tests can stub without dragging in the
// cloudflare-workers types. The real R2Bucket binding satisfies this.
export interface R2PutBucket {
  put(
    key: string,
    body: ArrayBuffer | Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<unknown>;
}

export interface DownloadedHeadshot {
  image_key: string;
  content_type: string;
  byte_length: number;
}

async function fetchImageBytes(
  url: string,
  fetchImpl: typeof fetch
): Promise<{ bytes: ArrayBuffer; contentType: string | null } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": DOWNLOAD_USER_AGENT, Accept: "image/*" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) return null;
    return { bytes, contentType: res.headers.get("content-type") };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extensionFromContentType(
  ct: string | null,
  fallbackUrl: string
): string {
  const fromCt = (ct ?? "").split(";")[0].trim().toLowerCase();
  if (fromCt === "image/jpeg" || fromCt === "image/jpg") return "jpg";
  if (fromCt === "image/png") return "png";
  if (fromCt === "image/webp") return "webp";
  if (fromCt === "image/gif") return "gif";
  try {
    const u = new URL(fallbackUrl);
    const m = u.pathname.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/);
    if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  } catch {
    // ignore
  }
  return "bin";
}

export async function downloadAndStoreHeadshot(
  url: string,
  slug: string,
  bucket: R2PutBucket,
  ittfid: number,
  fetchImpl: typeof fetch = fetch
): Promise<DownloadedHeadshot | null> {
  const downloaded = await fetchImageBytes(url, fetchImpl);
  if (!downloaded) return null;

  const ext = extensionFromContentType(downloaded.contentType, url);
  const image_key = `player/${slug}/headshot.${ext}`;
  const content_type = downloaded.contentType ?? "application/octet-stream";

  try {
    await bucket.put(image_key, downloaded.bytes, {
      httpMetadata: { contentType: content_type },
      customMetadata: {
        ittfid: String(ittfid),
        player_slug: slug,
        source_url: url,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch {
    return null;
  }

  return {
    image_key,
    content_type,
    byte_length: downloaded.bytes.byteLength,
  };
}
