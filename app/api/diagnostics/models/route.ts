import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/server/portrait-errors";
import { GeminiPortraitClient } from "@/lib/server/portrait-gemini";

export const runtime = "nodejs";

export async function GET() {
  try {
    const client = new GeminiPortraitClient();
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
