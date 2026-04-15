import fs from "node:fs/promises";
import path from "node:path";
import { after, NextResponse } from "next/server";
import { getErrorInfo, getErrorMessage, PortraitError } from "@/lib/server/portrait-errors";
import { createEmptyJob, mapJobToResponse, readJob, saveJob } from "@/lib/server/portrait-job-store";
import { schedulePortraitJob } from "@/lib/server/portrait-job-runner";
import { createId, sanitizeFileName, readRequestApiKey } from "@/lib/server/portrait-utils";
import { getJobDir, writeFileBuffer } from "@/lib/server/portrait-storage";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: Request, context: Context) {
  try {
    const requestApiKey = readRequestApiKey(request);
    const hasRuntimeApiKey = Boolean(process.env.GEMINI_API_KEY?.trim() || requestApiKey);
    if (!hasRuntimeApiKey) {
      throw new PortraitError("Gemini API key is missing.");
    }

    const { jobId } = await context.params;
    const previousJob = await readJob(jobId);
    const nextJobId = createId("job");
    const nextDir = getJobDir(nextJobId);

    const nextSourceFiles: Array<{ fileName: string; mimeType: string; path: string }> = [];
    for (let i = 0; i < previousJob.sourceFiles.length; i++) {
      const sf = previousJob.sourceFiles[i];
      const sourceBuffer = await fs.readFile(sf.path);
      const nextSourcePath = path.join(
        nextDir,
        `source-${i}-${sanitizeFileName(sf.fileName)}`,
      );
      await writeFileBuffer(nextSourcePath, sourceBuffer);
      nextSourceFiles.push({ fileName: sf.fileName, mimeType: sf.mimeType, path: nextSourcePath });
    }

    const nextJob = createEmptyJob({
      jobId: nextJobId,
      sourceFiles: nextSourceFiles,
      candidateCount: previousJob.candidateCount,
      subjectNote: previousJob.subjectNote,
      subjectGender: previousJob.subjectGender,
      subjectAge: previousJob.subjectAge,
      promptTemplate: previousJob.promptTemplate,
    });

    nextJob.statusMessage = `Regenerated from ${jobId.slice(0, 8)}. Waiting for Gemini generation.`;
    await saveJob(nextJob);

    after(() => {
      schedulePortraitJob(nextJobId, requestApiKey);
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
