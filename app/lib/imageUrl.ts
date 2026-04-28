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

// Equipment images go through Cloudflare Image Resizing on the same
// zone — the `/cdn-cgi/image/<options>/<source>` URL pattern is
// intercepted at the edge and resized + format-converted before the
// Worker ever sees it. The source path is our own R2-backed
// `/api/images/<key>`, so this works without any cross-origin or
// auth dance.
//
// Variants: thumbnail (256), card (512), full (1024). Match the
// dimensions used by /admin/equipment-photos and the public
// equipment routes; widen here when adding a new size.

const EQUIPMENT_VARIANT_WIDTHS = {
  thumbnail: 256,
  card: 512,
  full: 1024,
} as const;

export type EquipmentImageVariant = keyof typeof EQUIPMENT_VARIANT_WIDTHS;

// TT-88: when set, the URL adds `,trim=border` so Cloudflare Image
// Transformations auto-detects the dominant border colour and trims
// it. 'auto' is system-set on pick after corner-pixel decode found
// transparent edges; 'border' is admin-set via the manual toggle for
// white/coloured edges. Both produce the same URL params — the column
// is kept distinct only for provenance.
export type EquipmentImageTrimKind = "auto" | "border" | null | undefined;

export function buildEquipmentImageUrl(
  imageKey: string,
  variant: EquipmentImageVariant,
  trimKind?: EquipmentImageTrimKind
): string {
  const width = EQUIPMENT_VARIANT_WIDTHS[variant];
  const trimSuffix = trimKind ? ",trim=border" : "";
  return `/cdn-cgi/image/width=${width},format=auto,fit=scale-down${trimSuffix}/api/images/${imageKey}`;
}
