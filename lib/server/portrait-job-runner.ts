import path from "node:path";
import { GeminiPortraitClient } from "@/lib/server/portrait-gemini";
import { getErrorInfo, getErrorMessage } from "@/lib/server/portrait-errors";
import { readJob, saveJob } from "@/lib/server/portrait-job-store";
import { writeFileBuffer } from "@/lib/server/portrait-storage";
import { createId } from "@/lib/server/portrait-utils";

const activeJobs = new Map<string, Promise<void>>();

export async function runPortraitJob(jobId: string, apiKey?: string) {
  const job = await readJob(jobId);

  job.status = "running";
  job.updatedAt = new Date().toISOString();
  job.statusMessage =
    "Trying the preferred Gemini image model and generating portrait candidates.";
  await saveJob(job);

  try {
    const client = new GeminiPortraitClient(apiKey);
    const result = await client.generateVariants({
      sourceFiles: job.sourceFiles,
      candidateCount: job.candidateCount,
      expression: job.expression,
      bgColor: job.bgColor,
      subjectNote: job.subjectNote,
      subjectGender: job.subjectGender,
      subjectAge: job.subjectAge,
      promptTemplate: job.promptTemplate,
    });

    const variants = result.variants;
    job.variants = [];
    job.warnings = result.warnings;
    job.selectedModel = result.selectedModel.apiName;
    job.selectedModelLabel = result.selectedModel.label;
    job.attemptedModels = result.attemptedModels;

    for (const variant of variants) {
      const variantId = createId("variant");
      const variantPath = path.join(path.dirname(job.sourceFiles[0].path), variant.fileName);
      await writeFileBuffer(variantPath, variant.bytes);

      job.variants.push({
        id: variantId,
        fileName: variant.fileName,
        filePath: variantPath,
        mimeType: variant.mimeType,
        width: variant.width,
        height: variant.height,
      });
    }

    job.status = "completed";
    job.updatedAt = new Date().toISOString();
    job.statusMessage = `${job.candidateCount} candidates are ready for review. Final model: ${result.selectedModel.label}.`;
    job.error = undefined;
    job.errorInfo = undefined;
    await saveJob(job);
  } catch (error) {
    job.status = "failed";
    job.updatedAt = new Date().toISOString();
    job.statusMessage = "Gemini could not complete this portrait job.";
    job.error = getErrorMessage(error);
    job.errorInfo = getErrorInfo(error);
    await saveJob(job);
  }
}

export function ensurePortraitJobRunning(jobId: string): Promise<void> {
  const existingTask = activeJobs.get(jobId);
  if (existingTask) {
    return existingTask;
  }

  const task = (async () => {
    const job = await readJob(jobId);
    if (job.status === "completed" || job.status === "failed") {
      return;
    }

    await runPortraitJob(jobId);
  })().finally(() => {
    activeJobs.delete(jobId);
  });

  activeJobs.set(jobId, task);
  return task;
}

export function schedulePortraitJob(jobId: string, apiKey?: string) {
  const existingTask = activeJobs.get(jobId);
  if (existingTask) {
    return;
  }

  const task = (async () => {
    const job = await readJob(jobId);
    if (job.status === "completed" || job.status === "failed") {
      return;
    }

    await runPortraitJob(jobId, apiKey);
  })().finally(() => {
    activeJobs.delete(jobId);
  });

  activeJobs.set(jobId, task);

  void task.catch((error) => {
    console.error(`Unable to finish portrait job ${jobId}:`, error);
  });
}
