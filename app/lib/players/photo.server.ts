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

// TT-208: structured failure shape so the run_log entry can show
// *why* the fetch failed, not just "not_found". Renders to a short
// human-readable reason on the proposal detail page.
export type FetchImageFailure =
  | { reason: "http_status"; status: number; statusText: string }
  | { reason: "timeout"; afterMs: number }
  | { reason: "zero_bytes"; status: number }
  | { reason: "r2_upload_error"; message: string }
  | { reason: "fetch_error"; message: string };

async function fetchImageBytes(
  url: string,
  fetchImpl: typeof fetch
): Promise<
  | { ok: true; bytes: ArrayBuffer; contentType: string | null; status: number }
  | { ok: false; failure: FetchImageFailure }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": DOWNLOAD_USER_AGENT, Accept: "image/*" },
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        failure: {
          reason: "http_status",
          status: res.status,
          statusText: res.statusText,
        },
      };
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) {
      return {
        ok: false,
        failure: { reason: "zero_bytes", status: res.status },
      };
    }
    return {
      ok: true,
      bytes,
      contentType: res.headers.get("content-type"),
      status: res.status,
    };
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError");
    if (aborted) {
      return {
        ok: false,
        failure: { reason: "timeout", afterMs: DOWNLOAD_TIMEOUT_MS },
      };
    }
    return {
      ok: false,
      failure: {
        reason: "fetch_error",
        message: err instanceof Error ? err.message : String(err),
      },
    };
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

// TT-208: structured result. `ok=true` carries the stored headshot
// metadata (image_key, content_type, byte_length); `ok=false` carries
// the FetchImageFailure so the caller (queue.server.ts) can log
// status / timeout / r2_upload_error in the run_log.
export type StoreHeadshotResult =
  | { ok: true; headshot: DownloadedHeadshot }
  | { ok: false; failure: FetchImageFailure };

export async function downloadAndStoreHeadshot(
  url: string,
  slug: string,
  bucket: R2PutBucket,
  ittfid: number,
  fetchImpl: typeof fetch = fetch
): Promise<StoreHeadshotResult> {
  const downloaded = await fetchImageBytes(url, fetchImpl);
  if (!downloaded.ok) return { ok: false, failure: downloaded.failure };

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
  } catch (err) {
    return {
      ok: false,
      failure: {
        reason: "r2_upload_error",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  return {
    ok: true,
    headshot: {
      image_key,
      content_type,
      byte_length: downloaded.bytes.byteLength,
    },
  };
}
