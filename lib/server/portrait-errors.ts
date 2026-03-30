import type { PortraitErrorInfo } from "@/lib/server/portrait-types";

export class PortraitError extends Error {
  readonly statusCode: number;
  readonly info?: PortraitErrorInfo;

  constructor(message: string, statusCode = 400, info?: PortraitErrorInfo) {
    super(message);
    this.name = "PortraitError";
    this.statusCode = statusCode;
    this.info = info;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected portrait processing error.";
}

export function getErrorInfo(error: unknown): PortraitErrorInfo | undefined {
  if (error instanceof PortraitError) {
    return error.info;
  }

  return undefined;
}
