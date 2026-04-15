/**
 * MediaPipe WASM emits INFO/WARNING logs via stderr → console.error.
 * Next.js dev overlay treats those as real errors.
 * This utility suppresses known harmless WASM messages.
 */

const SUPPRESSED_PATTERNS = ["INFO:", "inference_feedback_manager"];

function isSuppressed(args: unknown[]): boolean {
  const msg = String(args[0] ?? "");
  return SUPPRESSED_PATTERNS.some((p) => msg.includes(p));
}

export function suppressWasmLogs(): () => void {
  const origError = console.error;
  const origWarn = console.warn;

  console.error = (...args: unknown[]) => {
    if (!isSuppressed(args)) origError.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    if (!isSuppressed(args)) origWarn.apply(console, args);
  };

  return () => {
    console.error = origError;
    console.warn = origWarn;
  };
}
