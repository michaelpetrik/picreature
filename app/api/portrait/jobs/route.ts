import path from "node:path";
import { after, NextResponse } from "next/server";
import { portraitPreset } from "@/lib/config/portrait-preset";
import { ensureJobRoot, writeFileBuffer } from "@/lib/server/portrait-storage";
import { createEmptyJob, mapJobToResponse, saveJob } from "@/lib/server/portrait-job-store";
import { getErrorInfo, getErrorMessage, PortraitError } from "@/lib/server/portrait-errors";
import { schedulePortraitJob } from "@/lib/server/portrait-job-runner";
import {
  ensureValidUpload,
  sanitizeFileName,
  createId,
  readRequestApiKey,
} from "@/lib/server/portrait-utils";
import { getJobDir } from "@/lib/server/portrait-storage";
import type { SubjectGender } from "@/lib/server/portrait-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await ensureJobRoot();
    const requestApiKey = readRequestApiKey(request);
    const hasRuntimeApiKey = Boolean(process.env.GEMINI_API_KEY?.trim() || requestApiKey);
    if (!hasRuntimeApiKey) {
      throw new PortraitError("Gemini API key is missing.");
    }

    const formData = await request.formData();
    const images = formData.getAll("image").filter((f): f is File => f instanceof File);
    const subjectNote = String(formData.get("subjectNote") ?? "");
    const subjectGender = String(formData.get("subjectGender") ?? "male") as SubjectGender;
    const subjectAge = Number(formData.get("subjectAge") ?? 32);
    const candidateCount = Math.min(8, Math.max(1, Number(formData.get("candidateCount") ?? portraitPreset.candidateCount)));
    const expression = Math.min(10, Math.max(0, Number(formData.get("expression") ?? 4)));
    const bgColor = String(formData.get("bgColor") ?? "#2a2a2a");
    const promptTemplate = String(
      formData.get("promptTemplate") ?? portraitPreset.defaultPromptTemplate,
    );

    if (images.length === 0) {
      throw new PortraitError("At least one image upload is required.");
    }

    if (subjectGender !== "male" && subjectGender !== "female") {
      throw new PortraitError("Subject gender must be either male or female.");
    }

    if (!Number.isFinite(subjectAge) || subjectAge < 18 || subjectAge > 80) {
      throw new PortraitError("Subject age must be between 18 and 80.");
    }

    for (const image of images) {
      await ensureValidUpload(image);
    }

    const jobId = createId("job");
    const jobDir = getJobDir(jobId);

    const sourceFiles: Array<{ fileName: string; mimeType: string; path: string }> = [];
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const fileName = sanitizeFileName(image.name);
      const sourcePath = path.join(jobDir, `source-${i}-${fileName}`);
      const buffer = Buffer.from(await image.arrayBuffer());
      await writeFileBuffer(sourcePath, buffer);
      sourceFiles.push({ fileName: image.name, mimeType: image.type, path: sourcePath });
    }

    const job = createEmptyJob({
      jobId,
      sourceFiles,
      candidateCount,
      expression,
      bgColor,
      subjectNote,
      subjectGender,
      subjectAge,
      promptTemplate,
    });
    await saveJob(job);

    after(() => {
      schedulePortraitJob(jobId, requestApiKey);
    });

    return NextResponse.json(mapJobToResponse(job), { status: 202 });
  } catch (error) {
    const status =
      error instanceof PortraitError ? error.statusCode : 500;
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
