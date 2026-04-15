/**
 * Composites a foreground image over a solid background using a segmentation mask.
 */

export function renderComposite(
  canvas: HTMLCanvasElement,
  sourceImage: HTMLImageElement,
  mask: Float32Array,
  bgColor: string,
  feather: number,
): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  drawBackground(ctx, w, h, bgColor);

  const srcPixels = getSourcePixels(sourceImage, w, h);
  const outPixels = ctx.getImageData(0, 0, w, h);
  const isTransparent = bgColor === "transparent";

  applyMask(outPixels.data, srcPixels.data, mask, feather, isTransparent);

  ctx.putImageData(outPixels, 0, 0);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bgColor: string,
): void {
  if (bgColor === "transparent") {
    ctx.clearRect(0, 0, w, h);
    const size = 12;
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? "#2a2a2a" : "#1a1a1a";
        ctx.fillRect(x, y, size, size);
      }
    }
  } else {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
  }
}

function getSourcePixels(
  image: HTMLImageElement,
  w: number,
  h: number,
): ImageData {
  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext("2d")!;
  ctx.drawImage(image, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function featherAlpha(raw: number, feather: number): number {
  const t = feather * 0.1;
  if (t <= 0) return raw > 0.5 ? 1 : 0;
  if (raw <= t) return 0;
  if (raw >= 1 - t) return 1;
  return (raw - t) / (1 - 2 * t);
}

function applyMask(
  out: Uint8ClampedArray,
  src: Uint8ClampedArray,
  mask: Float32Array,
  feather: number,
  transparent: boolean,
): void {
  for (let i = 0; i < mask.length; i++) {
    const alpha = featherAlpha(mask[i], feather);
    const px = i * 4;

    if (transparent) {
      out[px] = src[px];
      out[px + 1] = src[px + 1];
      out[px + 2] = src[px + 2];
      out[px + 3] = Math.round(alpha * 255);
    } else {
      const inv = 1 - alpha;
      out[px] = Math.round(src[px] * alpha + out[px] * inv);
      out[px + 1] = Math.round(src[px + 1] * alpha + out[px + 1] * inv);
      out[px + 2] = Math.round(src[px + 2] * alpha + out[px + 2] * inv);
      out[px + 3] = 255;
    }
  }
}

export function downloadCanvas(
  canvas: HTMLCanvasElement,
  baseName: string,
  transparent: boolean,
): void {
  const mimeType = transparent ? "image/png" : "image/jpeg";
  const ext = transparent ? "png" : "jpg";

  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}-edited.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    mimeType,
    transparent ? undefined : 0.95,
  );
}
