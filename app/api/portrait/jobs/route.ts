import path from "node:path";
import { after, NextResponse } from "next/server";
import { portraitPreset } from "@/lib/config/portrait-preset";
import { ensureJobRoot, writeFileBuffer } from "@/lib/server/portrait-storage";
import { createEmptyJob, mapJobToResponse, saveJob } from "@/lib/server/portrait-job-store";
import { getErrorInfo, getErrorMessage, PortraitError } from "@/lib/server/portrait-errors";
import { schedulePortraitJob } from "@/lib/server/portrait-job-runner";
import { ensureValidUpload, sanitizeFileName, createId } from "@/lib/server/portrait-utils";
import { getJobDir } from "@/lib/server/portrait-storage";
import type { SubjectGender } from "@/lib/server/portrait-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await ensureJobRoot();

    const formData = await request.formData();
    const image = formData.get("image");
    const subjectNote = String(formData.get("subjectNote") ?? "");
    const subjectGender = String(formData.get("subjectGender") ?? "male") as SubjectGender;
    const subjectAge = Number(formData.get("subjectAge") ?? 32);
    const promptTemplate = String(
      formData.get("promptTemplate") ?? portraitPreset.defaultPromptTemplate,
    );

    if (!(image instanceof File)) {
      throw new PortraitError("Image upload is required.");
    }

    if (subjectGender !== "male" && subjectGender !== "female") {
      throw new PortraitError("Subject gender must be either male or female.");
    }

    if (!Number.isFinite(subjectAge) || subjectAge < 18 || subjectAge > 80) {
      throw new PortraitError("Subject age must be between 18 and 80.");
    }

    await ensureValidUpload(image);

    const jobId = createId("job");
    const jobDir = getJobDir(jobId);
    const fileName = sanitizeFileName(image.name);
    const sourcePath = path.join(jobDir, `source-${fileName}`);
    const buffer = Buffer.from(await image.arrayBuffer());

    await writeFileBuffer(sourcePath, buffer);

    const job = createEmptyJob({
      jobId,
      sourceFileName: image.name,
      sourceMimeType: image.type,
      sourcePath,
      subjectNote,
      subjectGender,
      subjectAge,
      promptTemplate,
    });
    await saveJob(job);

    after(() => {
      schedulePortraitJob(jobId);
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
