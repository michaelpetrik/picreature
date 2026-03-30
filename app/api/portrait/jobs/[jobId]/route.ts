import { NextResponse } from "next/server";
import { getErrorMessage, PortraitError } from "@/lib/server/portrait-errors";
import { mapJobToResponse, readJob } from "@/lib/server/portrait-job-store";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_: Request, context: Context) {
  try {
    const { jobId } = await context.params;
    const job = await readJob(jobId);
    return NextResponse.json(mapJobToResponse(job), { status: 200 });
  } catch (error) {
    const status = error instanceof PortraitError ? error.statusCode : 500;
    return NextResponse.json(
      {
        jobId: "",
        status: "failed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: getErrorMessage(error),
        warnings: [],
        attemptedModels: [],
        variants: [],
      },
      { status },
    );
  }
}
