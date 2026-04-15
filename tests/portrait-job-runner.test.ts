import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tempRoot = path.join(os.tmpdir(), `picreature-runner-test-${Date.now()}`);
const generateVariantsMock = vi.fn();
const writeFileBufferMock = vi.fn(async (filePath: string, buffer: Buffer) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
});

vi.mock("@/lib/server/portrait-constants", () => ({
  JOB_TTL_MS: 1000 * 60 * 60,
  JOB_ROOT_DIR: tempRoot,
}));

vi.mock("@/lib/server/portrait-gemini", () => ({
  GeminiPortraitClient: class {
    generateVariants = generateVariantsMock;
  },
}));

vi.mock("@/lib/server/portrait-storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/portrait-storage")>(
    "@/lib/server/portrait-storage",
  );

  return {
    ...actual,
    writeFileBuffer: writeFileBufferMock,
  };
});

const { createEmptyJob, readJob, saveJob } = await import("@/lib/server/portrait-job-store");
const { ensurePortraitJobRunning } = await import("@/lib/server/portrait-job-runner");

describe("ensurePortraitJobRunning", () => {
  beforeEach(async () => {
    generateVariantsMock.mockReset();
    writeFileBufferMock.mockClear();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("completes a queued job and persists variants", async () => {
    const jobId = "job_resume";
    const sourcePath = path.join(tempRoot, jobId, "source.jpg");
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, Buffer.from("source"));

    await saveJob(
      createEmptyJob({
        jobId,
        sourceFiles: [{ fileName: "portrait.jpg", mimeType: "image/jpeg", path: sourcePath }],
        candidateCount: 4,
        aspectRatio: "4:5",
        expression: 4,
        bgColor: "#2a2a2a",
        enabledVars: { subject_gender: true, subject_age: true, expression: true, bg_color: true },
        subjectNote: "",
        subjectGender: "male",
        subjectAge: 32,
      }),
    );

    generateVariantsMock.mockResolvedValueOnce({
      warnings: [],
      selectedModel: {
        apiName: "gemini-test",
        label: "Gemini Test",
      },
      attemptedModels: [
        {
          model: "gemini-test",
          label: "Gemini Test",
          status: "success",
        },
      ],
      variants: [
        {
          fileName: "variant-1.jpg",
          bytes: Buffer.from("variant"),
          mimeType: "image/jpeg",
          width: 1000,
          height: 1250,
        },
      ],
    });

    await ensurePortraitJobRunning(jobId);

    const savedJob = await readJob(jobId);
    expect(savedJob.status).toBe("completed");
    expect(savedJob.variants).toHaveLength(1);
    expect(savedJob.selectedModel).toBe("gemini-test");
    expect(writeFileBufferMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent scheduling for the same job", async () => {
    const jobId = "job_dedupe";
    const sourcePath = path.join(tempRoot, jobId, "source.jpg");
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, Buffer.from("source"));
    let releaseGeneration!: () => void;

    await saveJob(
      createEmptyJob({
        jobId,
        sourceFiles: [{ fileName: "portrait.jpg", mimeType: "image/jpeg", path: sourcePath }],
        candidateCount: 4,
        aspectRatio: "4:5",
        expression: 4,
        bgColor: "#2a2a2a",
        enabledVars: { subject_gender: true, subject_age: true, expression: true, bg_color: true },
        subjectNote: "",
        subjectGender: "female",
        subjectAge: 28,
      }),
    );

    const generationStarted = new Promise<void>((resolve) => {
      generateVariantsMock.mockImplementationOnce(
        () =>
          new Promise((innerResolve) => {
            releaseGeneration = () => {
              innerResolve({
                warnings: [],
                selectedModel: {
                  apiName: "gemini-test",
                  label: "Gemini Test",
                },
                attemptedModels: [],
                variants: [],
              });
            };
            resolve();
          }),
      );
    });

    const firstRun = ensurePortraitJobRunning(jobId);
    const secondRun = ensurePortraitJobRunning(jobId);
    await generationStarted;

    expect(firstRun).toBe(secondRun);
    expect(generateVariantsMock).toHaveBeenCalledTimes(1);

    releaseGeneration();
    await firstRun;
  });
});
