import fs from "node:fs/promises";
import path from "node:path";
import { JOB_TTL_MS, JOB_ROOT_DIR } from "@/lib/server/portrait-constants";
import { portraitPreset } from "@/lib/config/portrait-preset";
import { PortraitError } from "@/lib/server/portrait-errors";
import { getJobDir, getJobRecordPath } from "@/lib/server/portrait-storage";
import type { PortraitJobRecord, PortraitJobResponse, PortraitVariantSummary } from "@/lib/server/portrait-types";

export async function cleanupExpiredJobs(now = Date.now()) {
  try {
    const entries = await fs.readdir(JOB_ROOT_DIR, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const recordPath = getJobRecordPath(entry.name);
          try {
            const raw = await fs.readFile(recordPath, "utf-8");
            const record = JSON.parse(raw) as PortraitJobRecord;
            if (new Date(record.expiresAt).getTime() < now) {
              await fs.rm(getJobDir(entry.name), { recursive: true, force: true });
            }
          } catch {
            await fs.rm(getJobDir(entry.name), { recursive: true, force: true });
          }
        }),
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

export async function saveJob(record: PortraitJobRecord) {
  const recordPath = getJobRecordPath(record.jobId);
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  await fs.writeFile(recordPath, JSON.stringify(record, null, 2), "utf-8");
}

export async function readJob(jobId: string) {
  await cleanupExpiredJobs();

  try {
    const raw = await fs.readFile(getJobRecordPath(jobId), "utf-8");
    const record = JSON.parse(raw) as PortraitJobRecord & {
      sourceFileName?: string;
      sourceMimeType?: string;
      sourcePath?: string;
    };

    // Migrate legacy single-source jobs to sourceFiles array
    if (!record.sourceFiles && record.sourcePath) {
      record.sourceFiles = [{
        fileName: record.sourceFileName ?? "source.jpg",
        mimeType: record.sourceMimeType ?? "image/jpeg",
        path: record.sourcePath,
      }];
      delete record.sourceFileName;
      delete record.sourceMimeType;
      delete record.sourcePath;
    }

    // Default candidateCount for legacy jobs
    if (!record.candidateCount) {
      record.candidateCount = portraitPreset.candidateCount;
    }

    return record as PortraitJobRecord;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new PortraitError("Portrait job not found or already expired.", 404);
    }
    throw error;
  }
}

export function mapJobToResponse(record: PortraitJobRecord): PortraitJobResponse {
  return {
    jobId: record.jobId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    statusMessage: record.statusMessage,
    error: record.error,
    errorInfo: record.errorInfo,
    warnings: record.warnings,
    selectedModel: record.selectedModel,
    selectedModelLabel: record.selectedModelLabel,
    attemptedModels: record.attemptedModels,
    variants: record.variants.map<PortraitVariantSummary>((variant) => ({
      id: variant.id,
      mimeType: variant.mimeType,
      width: variant.width,
      height: variant.height,
      previewUrl: `/api/portrait/files/${record.jobId}/${variant.id}`,
      downloadUrl: `/api/portrait/files/${record.jobId}/${variant.id}?download=1`,
    })),
  };
}

export function createEmptyJob(params: {
  jobId: string;
  sourceFiles: Array<{ fileName: string; mimeType: string; path: string }>;
  candidateCount: number;
  subjectNote: string;
  subjectGender: "male" | "female";
  subjectAge: number;
  promptTemplate?: string;
}): PortraitJobRecord {
  const now = new Date().toISOString();
  return {
    jobId: params.jobId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + JOB_TTL_MS).toISOString(),
    sourceFiles: params.sourceFiles,
    candidateCount: params.candidateCount,
    subjectNote: params.subjectNote,
    subjectGender: params.subjectGender,
    subjectAge: params.subjectAge,
    promptTemplate: params.promptTemplate?.trim() || portraitPreset.defaultPromptTemplate,
    statusMessage:
      "Upload accepted. Starting with Nano Banana Pro and falling back automatically if your project does not have access.",
    errorInfo: undefined,
    warnings: [],
    attemptedModels: [],
    variants: [],
  };
}
