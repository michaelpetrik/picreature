"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import {
  createSegmenter,
  loadImage,
  segmentPerson,
} from "@/lib/client/segmentation";
import { renderComposite, downloadCanvas } from "@/lib/client/compositing";

type PhotoEditorProps = {
  imageUrl: string;
  imageName: string;
  onClose: () => void;
};

const PRESET_COLORS = [
  "#ffffff",
  "#000000",
  "#1a1a2e",
  "#16213e",
  "#0f3460",
  "#533483",
  "#e94560",
  "#f5f5dc",
  "#2d4059",
  "#ea5455",
  "#f07b3f",
  "#ffd460",
  "transparent",
];

type EditorPhase = "loading-model" | "segmenting" | "ready" | "error";

export function PhotoEditor({ imageUrl, imageName, onClose }: PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<Float32Array | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const segmenterRef = useRef<ImageSegmenter | null>(null);

  const [phase, setPhase] = useState<EditorPhase>("loading-model");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [feather, setFeather] = useState(2);

  const isReady = phase === "ready";

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const image = sourceImageRef.current;
    const mask = maskRef.current;
    if (canvas && image && mask) {
      renderComposite(canvas, image, mask, bgColor, feather);
    }
  }, [bgColor, feather]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const segmenter = await createSegmenter();
        if (cancelled) { segmenter.close(); return; }
        segmenterRef.current = segmenter;

        setPhase("segmenting");

        const image = await loadImage(imageUrl);
        if (cancelled) return;
        sourceImageRef.current = image;

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const mask = await segmentPerson(segmenter, image);
        if (cancelled) return;
        maskRef.current = mask;

        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : "Segmentation failed");
        setPhase("error");
      }
    }

    void init();

    return () => {
      cancelled = true;
      segmenterRef.current?.close();
    };
  }, [imageUrl]);

  useEffect(() => {
    if (isReady) render();
  }, [isReady, render]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const baseName = imageName.replace(/\.[^.]+$/, "");
    downloadCanvas(canvas, baseName, bgColor === "transparent");
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Photo editor">
      <div className="overlay-panel editor-panel">
        <div className="overlay-head">
          <span>edit</span>
          <button className="ghost-button text-button" type="button" onClick={onClose}>
            close
          </button>
        </div>

        <div className="editor-layout">
          <div className="editor-canvas-wrap">
            {phase === "loading-model" && <StatusMessage text="loading segmentation model" />}
            {phase === "segmenting" && <StatusMessage text="segmenting person" />}
            {phase === "error" && (
              <div className="editor-status">
                <div className="error">{errorMsg}</div>
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="editor-canvas"
              style={{ display: isReady ? "block" : "none" }}
            />
          </div>

          <div className="editor-controls">
            <div className="field">
              <label>background color</label>
              <div className="color-swatches">
                {PRESET_COLORS.map((color) => (
                  <ColorSwatch
                    key={color}
                    color={color}
                    isActive={bgColor === color}
                    disabled={!isReady}
                    onClick={() => setBgColor(color)}
                  />
                ))}
              </div>
              <div className="custom-color-row">
                <input
                  type="color"
                  className="color-picker-input"
                  value={bgColor === "transparent" ? "#ffffff" : bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  disabled={!isReady}
                  aria-label="Custom background color"
                />
                <input
                  type="text"
                  className="input color-hex-input"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  disabled={!isReady}
                  placeholder="#rrggbb"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="edge-feather">
                edge softness <span className="muted-inline">{feather}</span>
              </label>
              <input
                id="edge-feather"
                className="range-input"
                type="range"
                min="0"
                max="20"
                step="1"
                value={feather}
                onChange={(e) => setFeather(Number(e.target.value))}
                disabled={!isReady}
              />
            </div>

            <div className="actions">
              <button
                className="button"
                type="button"
                onClick={handleDownload}
                disabled={!isReady}
              >
                download
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusMessage({ text }: { text: string }) {
  return (
    <div className="editor-status">
      <span className="status-activity">
        <span>{text}</span>
        <span className="status-dots" aria-hidden="true" />
      </span>
    </div>
  );
}

function ColorSwatch({
  color,
  isActive,
  disabled,
  onClick,
}: {
  color: string;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`color-swatch${isActive ? " is-active" : ""}`}
      style={{
        background:
          color === "transparent"
            ? "repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 50% / 10px 10px"
            : color,
      }}
      title={color === "transparent" ? "transparent" : color}
      onClick={onClick}
      disabled={disabled}
      aria-label={color === "transparent" ? "Transparent" : color}
    />
  );
}
