import { Form, useNavigation } from "react-router";
import { ImagePlus, Loader2 } from "lucide-react";
import {
  ALLOWED_UPLOAD_MIMES,
  MAX_UPLOAD_BYTES,
} from "~/lib/photo-sourcing/upload-constants";

interface AdminPhotoUploadProps {
  slug: string;
  hasImage: boolean;
  csrfToken: string;
}

// Admin-only direct-upload bar for the public equipment detail page
// (TT-99). Mirrors AdminTrimToggle's purple visual language; sits in
// the same admin strip beneath the equipment header. Shown for every
// admin visit regardless of whether image_key is set — the no-image
// case is the whole point of this control.
export function AdminPhotoUpload({
  slug,
  hasImage,
  csrfToken,
}: AdminPhotoUploadProps) {
  const navigation = useNavigation();
  const action = `/admin/equipment/${slug}/upload-photo`;
  const isSubmitting =
    navigation.state === "submitting" && navigation.formAction === action;
  const accept = ALLOWED_UPLOAD_MIMES.join(",");
  const statusLabel = hasImage
    ? "Image set — uploading replaces it"
    : "No image";

  return (
    <div
      className="mt-3 flex flex-col gap-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="admin-photo-upload"
    >
      <div className="flex items-center gap-2 text-sm text-purple-900">
        <ImagePlus className="size-4" aria-hidden="true" />
        <span className="font-medium">Admin · equipment image</span>
        <span
          className="text-purple-700"
          data-testid="admin-photo-upload-status"
          data-has-image={hasImage ? "true" : "false"}
        >
          {statusLabel}
        </span>
      </div>
      <Form
        method="post"
        action={action}
        encType="multipart/form-data"
        className="flex items-center gap-2"
      >
        <input type="hidden" name="_csrf" value={csrfToken} />
        <input
          type="file"
          name="photo"
          accept={accept}
          required
          data-testid="admin-photo-upload-input"
          aria-label="Equipment image file"
          className="text-sm text-purple-900 file:mr-2 file:rounded file:border file:border-purple-300 file:bg-white file:px-2 file:py-1 file:text-sm file:font-medium file:text-purple-700 hover:file:bg-purple-100"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="admin-photo-upload-button"
          className="inline-flex items-center gap-2 rounded border border-purple-300 bg-white px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Uploading…
            </>
          ) : (
            "Upload image"
          )}
        </button>
      </Form>
      <p className="sr-only" id="admin-photo-upload-limits">
        Allowed types: {ALLOWED_UPLOAD_MIMES.join(", ")}. Maximum size:{" "}
        {MAX_UPLOAD_BYTES} bytes.
      </p>
    </div>
  );
}
