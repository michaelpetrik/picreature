import path from "node:path";

export const JOB_TTL_MS = 1000 * 60 * 60 * 24;
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MIN_SHORT_EDGE = 500;
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const JOB_ROOT_DIR = path.join(process.cwd(), ".cache", "picreature", "jobs");
