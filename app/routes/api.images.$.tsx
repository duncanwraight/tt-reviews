import type { Route } from "./+types/api.images.$";

export async function loader({ params, context }: Route.LoaderArgs) {
  const { "*": splat } = params;
  const env = context.cloudflare.env as Cloudflare.Env;
  
  if (!splat) {
    return new Response("Image not found", { status: 404 });
  }

  try {
    // Get the image from R2
    const object = await env.IMAGE_BUCKET.get(splat);
    
    if (!object) {
      return new Response("Image not found", { status: 404 });
    }

    // Get the content type from metadata
    const contentType = object.httpMetadata?.contentType || "image/jpeg";
    
    // Return the image with proper headers
    return new Response(object.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": object.size.toString(),
      },
    });
  } catch (error) {
    return new Response("Internal server error", { status: 500 });
  }
}