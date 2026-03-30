import fs from "node:fs/promises";
import path from "node:path";
import { after, NextResponse } from "next/server";
import { getErrorInfo, getErrorMessage, PortraitError } from "@/lib/server/portrait-errors";
import { createEmptyJob, mapJobToResponse, readJob, saveJob } from "@/lib/server/portrait-job-store";
import { schedulePortraitJob } from "@/lib/server/portrait-job-runner";
import { createId, sanitizeFileName } from "@/lib/server/portrait-utils";
import { getJobDir, writeFileBuffer } from "@/lib/server/portrait-storage";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_: Request, context: Context) {
  try {
    const { jobId } = await context.params;
    const previousJob = await readJob(jobId);
    const nextJobId = createId("job");
    const nextDir = getJobDir(nextJobId);
    const sourceBuffer = await fs.readFile(previousJob.sourcePath);
    const nextSourcePath = path.join(
      nextDir,
      `source-${sanitizeFileName(previousJob.sourceFileName)}`,
    );

    await writeFileBuffer(nextSourcePath, sourceBuffer);

    const nextJob = createEmptyJob({
      jobId: nextJobId,
      sourceFileName: previousJob.sourceFileName,
      sourceMimeType: previousJob.sourceMimeType,
      sourcePath: nextSourcePath,
      subjectNote: previousJob.subjectNote,
      subjectGender: previousJob.subjectGender,
      subjectAge: previousJob.subjectAge,
      promptTemplate: previousJob.promptTemplate,
    });

    nextJob.statusMessage = `Regenerated from ${jobId.slice(0, 8)}. Waiting for Gemini generation.`;
    await saveJob(nextJob);

    after(() => {
      schedulePortraitJob(nextJobId);
    });

    return NextResponse.json(mapJobToResponse(nextJob), { status: 202 });
  } catch (error) {
    const status = error instanceof PortraitError ? error.statusCode : 500;
    return NextResponse.json(
      {
        jobId: "",
        status: "failed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: getErrorMessage(error),
        errorInfo: getErrorInfo(error),
        warnings: [],
        attemptedModels: [],
        variants: [],
      },
      { status },
    );
  }
}
