import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";
import { suppressWasmLogs } from "./suppress-wasm-logs";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

export type SegmentationResult = {
  mask: Float32Array;
  width: number;
  height: number;
  sourceImage: HTMLImageElement;
};

export async function createSegmenter(): Promise<ImageSegmenter> {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);

  const restore = suppressWasmLogs();
  try {
    return await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL },
      outputCategoryMask: false,
      outputConfidenceMasks: true,
      runningMode: "IMAGE",
    });
  } finally {
    restore();
  }
}

export async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  if (!url.startsWith("blob:")) {
    img.crossOrigin = "anonymous";
  }
  img.src = url;
  await img.decode();
  return img;
}

function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return canvas;
}

export async function segmentPerson(
  segmenter: ImageSegmenter,
  image: HTMLImageElement,
): Promise<Float32Array> {
  const canvas = imageToCanvas(image);

  const restore = suppressWasmLogs();
  try {
    return await new Promise<Float32Array>((resolve, reject) => {
      try {
        segmenter.segment(canvas, (result) => {
          const confidenceMask = result.confidenceMasks?.[0];
          if (!confidenceMask) {
            reject(new Error("Segmentation produced no mask"));
            return;
          }
          resolve(new Float32Array(confidenceMask.getAsFloat32Array()));
        });
      } catch (err) {
        reject(err);
      }
    });
  } finally {
    restore();
  }
}
