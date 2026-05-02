// Dynamic OG image generation for TT-138.
//
// Pipeline: HTML → Satori (via yoga-wasm) → SVG → resvg-wasm → PNG.
// All three pieces are bundled by workers-og into a single import; the
// .wasm files are statically imported by the package and inlined by the
// Cloudflare Vite plugin into the Worker bundle. See docs/SEO.md.
//
// Pitfalls handled here (per the dev.to "6 pitfalls" article):
// - WASM compilation: workers-og uses static imports, no dynamic compile.
// - Image fetches: Satori's internal fetch fails silently on Workers, so
//   hero images are pre-fetched and embedded as base64 data URLs by the
//   route loader before passing into the template.
// - Font loading: Inter Latin subset fetched from Google Fonts on cold
//   start, cached in the Cloudflare Cache API so subsequent requests skip
//   the round-trip.
//
// Known noise: the second-and-onward render in any isolate logs
// `Error: Already initialized. The initWasm() function can be used only
// once.` to stderr — workers-og's resvg init wrapper console.log()s the
// caught error before checking the message and returning. The render
// still succeeds. Don't try to "fix" this by suppressing the import or
// monkey-patching workers-og; the right fix is upstream and downstream
// callers shouldn't see the noise.
//
// workers-og's type definitions reference @vercel/og (not installed); we
// declare a local subset of `ImageResponseOptions` so callers can build
// the options without pulling in @vercel/og.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — workers-og ships ambient types referencing @vercel/og,
// which we deliberately don't install. The runtime export is fine; the
// types we care about are wrapped in OgRenderOptions below.
import { ImageResponse, loadGoogleFont } from "workers-og";

import { Logger, type LogContext } from "../logger.server";

export interface OgRenderOptions {
  width?: number;
  height?: number;
  // ETag for client/CDN cache validation. Derived by the caller from
  // the entity's updated_at so a content edit busts the cached image.
  etag?: string;
  // Populated by the route — never logged.
  cacheKey: string;
}

// Single canonical OG card size. Both width and height appear in
// og:image:width / og:image:height, so this constant has to match the
// meta tags in app/lib/seo.ts.
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// Font cache key — bumped when the font file or weights change.
const FONT_CACHE_VERSION = "v1";

interface FontEntry {
  data: ArrayBuffer;
  weight: 400 | 700;
}

// Per-isolate memo so a warm isolate doesn't even hit the Cache API.
let fontPromise: Promise<FontEntry[]> | null = null;

async function fetchFontWeight(
  weight: 400 | 700,
  ctx: LogContext
): Promise<ArrayBuffer> {
  // The Cache API is keyed by a Request URL; build a synthetic URL that
  // includes the version so a deploy with a different font config gets a
  // fresh fetch.
  const cacheUrl = `https://og-fonts.tt-reviews.local/inter/${FONT_CACHE_VERSION}/${weight}`;
  const cache = await caches.open("og-fonts");
  const cached = await cache.match(cacheUrl);
  if (cached) {
    return cached.arrayBuffer();
  }

  Logger.info("og.font.cache_miss", ctx, { weight });
  const data = await loadGoogleFont({ family: "Inter", weight });

  // Store the bytes so the next request gets a hit. CF Cache requires
  // a Response with a fresh body — wrap the buffer in one with a long
  // immutable cache directive.
  const response = new Response(data, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "font/ttf",
    },
  });
  await cache.put(cacheUrl, response.clone());

  return data;
}

async function loadFonts(ctx: LogContext): Promise<FontEntry[]> {
  if (!fontPromise) {
    fontPromise = (async () => {
      const [regular, bold] = await Promise.all([
        fetchFontWeight(400, ctx),
        fetchFontWeight(700, ctx),
      ]);
      return [
        { data: regular, weight: 400 as const },
        { data: bold, weight: 700 as const },
      ];
    })().catch(err => {
      // Don't memoize a failure — let the next request retry.
      fontPromise = null;
      throw err;
    });
  }
  return fontPromise;
}

/**
 * Render an HTML string to a 1200×630 PNG response.
 *
 * The HTML must be Satori-compatible: every container needs an explicit
 * `display: flex`, dimensions are absolute, no CSS shorthand quirks. See
 * the Satori CSS reference. Font family must be "Inter" — we ship 400
 * and 700 weights only.
 *
 * Caching:
 * - Cache-Control public, 1d browser, 7d CDN, 30d stale-while-revalidate.
 * - ETag from the caller (typically `entity.updated_at`); busts the
 *   cached image when content changes.
 * - The dynamic OG URL itself is slug-keyed, so a slug rename produces
 *   a different URL anyway.
 */
export async function renderOgImage(
  html: string,
  options: OgRenderOptions,
  ctx: LogContext
): Promise<Response> {
  const fonts = await loadFonts(ctx);
  const width = options.width ?? OG_WIDTH;
  const height = options.height ?? OG_HEIGHT;

  // workers-og's ImageResponse extends Response; we read its body and
  // wrap with our own headers so caching is consistent across routes.
  const imageResponse = new ImageResponse(html, {
    width,
    height,
    fonts: fonts.map(f => ({
      name: "Inter",
      data: f.data,
      weight: f.weight,
      style: "normal" as const,
    })),
  });

  const headers = new Headers({
    "Content-Type": "image/png",
    "Cache-Control":
      "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
    "X-Content-Type-Options": "nosniff",
  });
  if (options.etag) {
    headers.set("ETag", `"${options.etag}"`);
  }

  return new Response(imageResponse.body, {
    status: imageResponse.status,
    headers,
  });
}

/**
 * Pre-fetch a hero image and return it as a `data:image/png;base64,...`
 * data URL suitable for inlining into a Satori `<img>` tag.
 *
 * Satori's internal fetch fails silently on Cloudflare Workers (one of
 * the documented pitfalls) — so we fetch on the route's behalf, which
 * also lets us decide what to do when the source is missing (return
 * null and let the template render without the image).
 *
 * `imageUrl` should be absolute or a same-origin path; we resolve it
 * against the request URL.
 */
export async function fetchImageAsDataUrl(
  imageUrl: string,
  request: Request,
  ctx: LogContext
): Promise<string | null> {
  try {
    const absolute = new URL(imageUrl, request.url).toString();
    const response = await fetch(absolute, {
      headers: {
        // Satori needs PNG/JPEG; CF Image Resizing returns whatever the
        // accept header asks for. We force PNG to match Satori's support.
        Accept: "image/png,image/jpeg",
      },
    });
    if (!response.ok) {
      Logger.warn("og.image_fetch.failed", ctx, {
        url: absolute,
        status: response.status,
      });
      return null;
    }
    const contentType = response.headers.get("Content-Type") ?? "image/png";
    // Satori only supports PNG/JPEG — bail on anything else (notably WebP,
    // which the equipment pipeline auto-converts to via /cdn-cgi/image).
    if (
      !contentType.startsWith("image/png") &&
      !contentType.startsWith("image/jpeg")
    ) {
      Logger.warn("og.image_fetch.unsupported_format", ctx, {
        url: absolute,
        contentType,
      });
      return null;
    }
    const buffer = await response.arrayBuffer();
    // Base64-encode without using Node's Buffer (not available on Workers).
    // btoa expects a binary string; chunk the bytes to avoid stack overflow
    // on large images (apply().call with >100k args throws RangeError).
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch (err) {
    Logger.warn(
      "og.image_fetch.error",
      ctx,
      err instanceof Error ? { error: err.message } : undefined
    );
    return null;
  }
}
