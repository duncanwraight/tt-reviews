import type { Route } from "./+types/.well-known.$";

export async function loader({ params }: Route.LoaderArgs) {
  // Handle Chrome DevTools .well-known requests silently
  // Return 204 No Content to suppress Chrome dev console spam
  return new Response(null, { status: 204 });
}