import type { Route } from "./+types/api.images.$";

export async function loader({ params, context }: Route.LoaderArgs) {
  const { addApiSecurityHeaders, sanitizeError } = await import(
    "~/lib/security.server"
  );

  const { "*": splat } = params;
  const env = context.cloudflare.env as Cloudflare.Env;

  if (!splat) {
    const headers = new Headers();
    addApiSecurityHeaders(headers);
    return new Response("Image not found", { status: 404, headers });
  }

  try {
    // Get the image from R2
    const object = await env.IMAGE_BUCKET.get(splat);

    if (!object) {
      const headers = new Headers();
      addApiSecurityHeaders(headers);
      return new Response("Image not found", { status: 404, headers });
    }

    // Get the content type from metadata
    const contentType = object.httpMetadata?.contentType || "image/jpeg";

    // Return the image with proper headers including security headers
    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": object.size.toString(),
    });
    addApiSecurityHeaders(headers);

    return new Response(object.body, { headers });
  } catch (error) {
    const isDevelopment = process.env.NODE_ENV === "development";
    const errorMessage = sanitizeError(error, isDevelopment);
    const headers = new Headers();
    addApiSecurityHeaders(headers);

    return new Response(errorMessage, { status: 500, headers });
  }
}
