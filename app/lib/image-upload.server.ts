import { handleImageUploadNative, type ImageUploadResult } from "./r2-native.server";

export type { ImageUploadResult };

export async function handleImageUpload(
  formData: FormData,
  env: Cloudflare.Env,
  category: "equipment" | "player",
  id: string,
  fieldName: string = "image"
): Promise<ImageUploadResult> {
  return handleImageUploadNative(
    formData,
    env.IMAGE_BUCKET,
    category,
    id,
    fieldName
  );
}

