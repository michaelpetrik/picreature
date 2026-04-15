import path from "node:path";

export const JOB_TTL_MS = 1000 * 60 * 60 * 24;
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MIN_SHORT_EDGE = 500;
export const NATIVE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Image types that sharp can convert to a native format before upload. */
export const CONVERTIBLE_IMAGE_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
  "image/bmp",
  "image/gif",
]);

/** All image types accepted by the upload endpoint (native + convertible). */
export const ALLOWED_IMAGE_TYPES = new Set([
  ...NATIVE_IMAGE_TYPES,
  ...CONVERTIBLE_IMAGE_TYPES,
]);
export const JOB_ROOT_DIR = path.join(process.cwd(), ".cache", "picreature", "jobs");
