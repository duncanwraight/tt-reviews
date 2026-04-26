export interface ImageUploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export type AllowedImageType = "image/jpeg" | "image/png" | "image/webp";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// `cf/` prefix is for Cloudflare Images IDs (TT-48). `api.images.$.tsx`
// detects it and 302-redirects to the CF delivery URL — keeps every
// caller's `<img src="/api/images/${image_key}">` working unchanged.
const ALLOWED_KEY_PREFIXES = ["equipment/", "player/", "cf/"] as const;

export interface ImageValidation {
  valid: boolean;
  detectedType?: AllowedImageType;
  extension?: string;
  error?: string;
}

// Read the first 12 bytes of the upload and match against known image
// magic numbers. `file.type` is browser-supplied and must not be trusted —
// a .svg renamed to .jpg with Content-Type: image/jpeg would sail past a
// MIME-only check.
async function detectImageType(file: File): Promise<AllowedImageType | null> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (header.length < 12) return null;

  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export async function validateImageFile(file: File): Promise<ImageValidation> {
  if (file.size === 0) {
    return { valid: false, error: "File is empty." };
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return {
      valid: false,
      error: "File too large. Maximum size is 10MB.",
    };
  }

  const detectedType = await detectImageType(file);
  if (!detectedType) {
    return {
      valid: false,
      error: "Invalid image. Only JPEG, PNG, and WebP are allowed.",
    };
  }

  return {
    valid: true,
    detectedType,
    extension: EXTENSION_BY_TYPE[detectedType],
  };
}

// Sanitize a path segment to a URL/object-storage-safe token. The caller
// uses this for the `id` portion of the key; anything the client could
// influence (submission temp-UUIDs aside) is rejected to path-separator,
// null byte, and unicode control characters.
function sanitizeKeySegment(segment: string): string {
  return (
    segment
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, "")
      .replace(/[\\/]/g, "")
      .replace(/\.{2,}/g, "")
      .slice(0, 128)
  );
}

export function generateImageKey(
  category: "equipment" | "player",
  id: string,
  extension: string
): string {
  const safeId = sanitizeKeySegment(id) || "unknown";
  const safeExt = sanitizeKeySegment(extension).toLowerCase() || "bin";
  const timestamp = Date.now();
  return `${category}/${safeId}/${timestamp}.${safeExt}`;
}

// Gate for the public `/api/images/*` reader. Rejects keys that try to
// traverse outside the two allowlisted prefixes or that contain `..` /
// null bytes. `R2Bucket.get` would happily return any key the Worker
// asked for, so path validation lives here.
export function isValidImageKey(key: string): boolean {
  if (!key) return false;
  if (key.includes("..")) return false;
  if (key.includes("\x00")) return false;
  if (key.startsWith("/")) return false;
  return ALLOWED_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
}

export async function uploadImageToR2Native(
  bucket: R2Bucket,
  key: string,
  file: File,
  contentType: AllowedImageType,
  metadata: Record<string, string> = {}
): Promise<{ url: string; key: string }> {
  const buffer = await file.arrayBuffer();

  await bucket.put(key, buffer, {
    httpMetadata: {
      contentType,
    },
    customMetadata: {
      originalName: sanitizeKeySegment(file.name),
      uploadedAt: new Date().toISOString(),
      ...metadata,
    },
  });

  const url = `/api/images/${key}`;

  return { url, key };
}

export async function deleteImageFromR2Native(
  bucket: R2Bucket,
  key: string
): Promise<void> {
  await bucket.delete(key);
}

export async function handleImageUploadNative(
  formData: FormData,
  bucket: R2Bucket,
  category: "equipment" | "player",
  id: string,
  fieldName: string = "image"
): Promise<ImageUploadResult> {
  const file = formData.get(fieldName) as File | null;

  if (!file || file.size === 0) {
    return { success: false, error: "No image file provided" };
  }

  const validation = await validateImageFile(file);
  if (!validation.valid || !validation.detectedType || !validation.extension) {
    return { success: false, error: validation.error };
  }

  try {
    const key = generateImageKey(category, id, validation.extension);

    const { url } = await uploadImageToR2Native(
      bucket,
      key,
      file,
      validation.detectedType,
      {
        category,
        entityId: id,
      }
    );

    return {
      success: true,
      url,
      key,
    };
  } catch {
    return {
      success: false,
      error: "Failed to upload image. Please try again.",
    };
  }
}
