// Corner-pixel transparency detection for picked equipment images
// (TT-88). Decoded once on pick to decide whether to set
// equipment.image_trim_kind = 'auto'. JPEGs short-circuit (no alpha
// channel). PNG / WebP go through @jsquash to get raw RGBA pixels;
// we only look at the four corners.
//
// jsquash decode is lazy-imported so the WASM bundles don't bloat
// the Worker for non-pick code paths.

const ALPHA_TRANSPARENT_THRESHOLD = 32;

export interface DecodedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type DecodeFn = (bytes: ArrayBuffer) => Promise<DecodedImage>;

export interface TrimDetectDeps {
  // Lazy-load shims so tests can stub without resolving the real WASM
  // modules. Production code defaults to dynamic imports of @jsquash.
  decodePng?: DecodeFn;
  decodeWebp?: DecodeFn;
}

const defaultDecodePng: DecodeFn = async bytes => {
  const mod = await import("@jsquash/png");
  return mod.decode(bytes);
};

const defaultDecodeWebp: DecodeFn = async bytes => {
  const mod = await import("@jsquash/webp");
  return mod.decode(bytes);
};

function chooseDecoder(
  contentType: string,
  deps: TrimDetectDeps
): DecodeFn | null {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (ct === "image/png") return deps.decodePng ?? defaultDecodePng;
  if (ct === "image/webp") return deps.decodeWebp ?? defaultDecodeWebp;
  // image/jpeg etc. have no alpha channel.
  return null;
}

// Returns true if all four corner pixels of the decoded RGBA image
// have alpha < ALPHA_TRANSPARENT_THRESHOLD. Returns false on any
// other outcome (opaque corners, decode failure, unsupported format).
// Decode failures are swallowed because trim is non-critical — leaving
// image_trim_kind as NULL is the safe default.
export async function detectTransparentEdges(
  bytes: ArrayBuffer,
  contentType: string,
  deps: TrimDetectDeps = {}
): Promise<boolean> {
  const decode = chooseDecoder(contentType, deps);
  if (!decode) return false;

  let img: DecodedImage;
  try {
    img = await decode(bytes);
  } catch {
    return false;
  }

  const { data, width, height } = img;
  if (width < 1 || height < 1 || data.length < 4) return false;

  // RGBA layout: 4 bytes per pixel, alpha at offset +3.
  const tl = data[3];
  const tr = data[(width - 1) * 4 + 3];
  const bl = data[(height - 1) * width * 4 + 3];
  const br = data[(height * width - 1) * 4 + 3];

  return (
    tl < ALPHA_TRANSPARENT_THRESHOLD &&
    tr < ALPHA_TRANSPARENT_THRESHOLD &&
    bl < ALPHA_TRANSPARENT_THRESHOLD &&
    br < ALPHA_TRANSPARENT_THRESHOLD
  );
}
