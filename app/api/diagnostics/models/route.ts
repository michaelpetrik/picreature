import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/server/portrait-errors";
import { GeminiPortraitClient } from "@/lib/server/portrait-gemini";
import { readRequestApiKey } from "@/lib/server/portrait-utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const requestApiKey = readRequestApiKey(request);
    const client = new GeminiPortraitClient(requestApiKey);
    const result = await client.runModelSelfCheck();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        warnings: [getErrorMessage(error)],
        entries: [],
      },
      { status: 503 },
    );
  }
}
