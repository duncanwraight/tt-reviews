import type { Route } from "./+types/api.images.$";
import { isDevelopment } from "~/lib/env.server";
import { isValidImageKey } from "~/lib/r2-native.server";
import {
  buildCloudflareImageUrl,
  type CloudflareImageVariant,
} from "~/lib/images/cloudflare";

// Default variant when the client doesn't specify one in the path
// (e.g. `/api/images/cf/<id>` → full). Variants below `full` are opt-in
// via `/api/images/cf/<id>/<variant>` so the existing `<img>` callers
// don't need to change to keep working.
const DEFAULT_CF_VARIANT: CloudflareImageVariant = "full";
const KNOWN_CF_VARIANTS = new Set<CloudflareImageVariant>([
  "thumbnail",
  "card",
  "full",
]);

export async function loader({ params, context }: Route.LoaderArgs) {
  const { addApiSecurityHeaders, sanitizeError } =
    await import("~/lib/security.server");

  const { "*": splat } = params;
  const env = context.cloudflare.env as Cloudflare.Env;
  const isDev = isDevelopment(context);

  if (!splat) {
    const headers = new Headers();
    addApiSecurityHeaders(headers, isDev);
    return new Response("Image not found", { status: 404, headers });
  }

  if (!isValidImageKey(splat)) {
    const headers = new Headers();
    addApiSecurityHeaders(headers, isDev);
    return new Response("Bad request", { status: 400, headers });
  }

  // Cloudflare Images path: `cf/<id>` or `cf/<id>/<variant>`. Redirect
  // to the imagedelivery.net CDN so we don't proxy bytes through the
  // Worker. 302 is fine — the browser caches the redirect, and on
  // re-source the candidate UUID changes anyway.
  if (splat.startsWith("cf/")) {
    const rest = splat.slice("cf/".length);
    const [imageId, requestedVariant] = rest.split("/", 2);
    if (!imageId) {
      const headers = new Headers();
      addApiSecurityHeaders(headers, isDev);
      return new Response("Image not found", { status: 404, headers });
    }
    const variant: CloudflareImageVariant =
      requestedVariant &&
      KNOWN_CF_VARIANTS.has(requestedVariant as CloudflareImageVariant)
        ? (requestedVariant as CloudflareImageVariant)
        : DEFAULT_CF_VARIANT;

    const cfEnv = env as unknown as { IMAGES_ACCOUNT_HASH?: string };
    if (!cfEnv.IMAGES_ACCOUNT_HASH) {
      const headers = new Headers();
      addApiSecurityHeaders(headers, isDev);
      return new Response("Image delivery not configured", {
        status: 500,
        headers,
      });
    }
    const url = buildCloudflareImageUrl(
      { IMAGES_ACCOUNT_HASH: cfEnv.IMAGES_ACCOUNT_HASH },
      imageId,
      variant
    );
    const headers = new Headers({
      Location: url,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    addApiSecurityHeaders(headers, isDev);
    return new Response(null, { status: 302, headers });
  }

  try {
    const object = await env.IMAGE_BUCKET.get(splat);

    if (!object) {
      const headers = new Headers();
      addApiSecurityHeaders(headers, isDev);
      return new Response("Image not found", { status: 404, headers });
    }

    const contentType = object.httpMetadata?.contentType || "image/jpeg";

    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": object.size.toString(),
    });
    addApiSecurityHeaders(headers, isDev);

    return new Response(object.body, { headers });
  } catch (error) {
    const errorMessage = sanitizeError(error, isDev);
    const headers = new Headers();
    addApiSecurityHeaders(headers, isDev);

    return new Response(errorMessage, { status: 500, headers });
  }
}
