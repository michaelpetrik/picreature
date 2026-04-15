import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import {
  ALLOWED_IMAGE_TYPES,
  CONVERTIBLE_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  MIN_SHORT_EDGE,
} from "@/lib/server/portrait-constants";
import { PortraitError } from "@/lib/server/portrait-errors";

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function readRequestApiKey(request: Request): string | undefined {
  const value = request.headers.get("x-gemini-api-key")?.trim();
  return value ? value : undefined;
}

export function sanitizeFileName(fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext).replace(/[^a-zA-Z0-9-_]/g, "-");
  return `${base || "portrait"}${ext.toLowerCase()}`;
}

export function guessExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return ".jpg";
  }
}

export async function ensureValidUpload(file: File): Promise<void> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new PortraitError(
      "Unsupported image format. Accepted: JPEG, PNG, WebP, HEIC, HEIF, AVIF, TIFF, BMP, GIF.",
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new PortraitError("Upload exceeds the 12 MB size limit.");
  }

  const dimensions = CONVERTIBLE_IMAGE_TYPES.has(file.type)
    ? await getImageDimensionsViaSharp(file)
    : await getImageDimensions(file);
  const shortEdge = Math.min(dimensions.width, dimensions.height);
  if (shortEdge < MIN_SHORT_EDGE) {
    throw new PortraitError(
      `Portrait is too small. Minimum short edge is ${MIN_SHORT_EDGE}px.`,
    );
  }
}

/**
 * Convert a non-native image format to JPEG via sharp.
 * Returns the converted buffer and the new MIME type + extension.
 */
export async function convertToNativeFormat(buffer: Buffer, mimeType: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  extension: string;
}> {
  if (!CONVERTIBLE_IMAGE_TYPES.has(mimeType)) {
    return { buffer, mimeType, extension: guessExtension(mimeType) };
  }

  try {
    const converted = await sharp(buffer)
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();

    return { buffer: converted, mimeType: "image/jpeg", extension: ".jpg" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("compression format") || msg.includes("heif") || msg.includes("heic")) {
      throw new PortraitError(
        `Unable to convert ${mimeType} — HEVC codec is not available in this environment. Convert the image to JPEG or PNG before uploading.`,
      );
    }
    throw new PortraitError(`Unable to convert ${mimeType} to JPEG: ${msg}`);
  }
}

async function getImageDimensionsViaSharp(
  file: Blob,
): Promise<{ width: number; height: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const meta = await sharp(Buffer.from(arrayBuffer)).metadata();
  if (!meta.width || !meta.height) {
    throw new PortraitError("Unable to determine image dimensions.");
  }
  return { width: meta.width, height: meta.height };
}

export async function getImageDimensions(
  file: Blob,
): Promise<{ width: number; height: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const png = getPngDimensions(buffer);
  if (png) {
    return png;
  }

  const jpeg = getJpegDimensions(buffer);
  if (jpeg) {
    return jpeg;
  }

  const webp = getWebpDimensions(buffer);
  if (webp) {
    return webp;
  }

  throw new PortraitError("Unable to determine image dimensions.");
}

function getPngDimensions(buffer: Buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function getJpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const size = buffer.readUInt16BE(offset + 2);

    const isFrameMarker =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);

    if (isFrameMarker) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + size;
  }

  return null;
}

function getWebpDimensions(buffer: Buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  if (chunkType === "VP8 ") {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunkType === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}
