// Build a cache-bustable URL for an image stored in R2 under a
// deterministic key. The query string is ignored by the worker route
// (`api.images.$.tsx` reads only the splat path), but it forces the
// browser and the CDN to treat content with a new etag as a new URL,
// so re-applying the photo-sourcing pipeline shows up immediately.

export function buildImageUrl(
  imageKey: string | null | undefined,
  imageEtag?: string | null
): string | null {
  if (!imageKey) return null;
  const base = `/api/images/${imageKey}`;
  return imageEtag ? `${base}?v=${encodeURIComponent(imageEtag)}` : base;
}
