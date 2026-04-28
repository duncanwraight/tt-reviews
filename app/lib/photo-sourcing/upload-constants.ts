// Shared upload constants for the TT-99 admin direct-upload flow.
// Lives outside upload.server.ts so AdminPhotoUpload.tsx can import the
// MIME allow-list and size cap on the client without dragging the
// server-only Supabase/R2 code through React Router's client bundle.

export const ALLOWED_UPLOAD_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIMES)[number];

// 2 MB. Existing equipment images are ~50 KB; the cap prevents an
// admin accidentally uploading a multi-megabyte source file that would
// inflate R2 storage and slow down Image Resizing transforms.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
