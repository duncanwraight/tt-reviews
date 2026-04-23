import type { Route } from "./+types/api.images.$";
import { isDevelopment } from "~/lib/env.server";

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
