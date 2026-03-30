import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { PortraitError } from "@/lib/server/portrait-errors";
import { readJob } from "@/lib/server/portrait-job-store";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ jobId: string; variantId: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    const { jobId, variantId } = await context.params;
    const job = await readJob(jobId);
    const variant = job.variants.find((item) => item.id === variantId);

    if (!variant) {
      throw new PortraitError("Portrait variant not found.", 404);
    }

    const content = await fs.readFile(variant.filePath);
    const isDownload = new URL(request.url).searchParams.get("download") === "1";

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": variant.mimeType,
        "Cache-Control": "no-store",
        "Content-Disposition": isDownload
          ? `attachment; filename="${variant.fileName}"`
          : `inline; filename="${variant.fileName}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "File not found.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
