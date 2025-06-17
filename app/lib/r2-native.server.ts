export interface ImageUploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export async function uploadImageToR2Native(
  bucket: R2Bucket,
  key: string,
  file: File,
  metadata: Record<string, string> = {}
): Promise<{ url: string; key: string }> {
  const buffer = await file.arrayBuffer();

  await bucket.put(key, buffer, {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      originalName: file.name,
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

export function generateImageKey(
  category: "equipment" | "player",
  id: string,
  filename: string
): string {
  const timestamp = Date.now();
  const extension = filename.split(".").pop();
  return `${category}/${id}/${timestamp}.${extension}`;
}

export function validateImageFile(file: File): {
  valid: boolean;
  error?: string;
} {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: "Invalid file type. Only JPEG, PNG, and WebP images are allowed.",
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: "File too large. Maximum size is 10MB.",
    };
  }

  return { valid: true };
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

  // Validate the file
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Generate unique key for the image
    const key = generateImageKey(category, id, file.name);

    // Upload to R2
    const { url } = await uploadImageToR2Native(bucket, key, file, {
      category,
      entityId: id,
    });

    return {
      success: true,
      url,
      key,
    };
  } catch (error) {
    return {
      success: false,
      error: "Failed to upload image. Please try again.",
    };
  }
}
