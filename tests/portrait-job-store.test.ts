import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempRoot = path.join(os.tmpdir(), `picreature-test-${Date.now()}`);
vi.mock("@/lib/server/portrait-constants", () => ({
  JOB_TTL_MS: 1000,
  JOB_ROOT_DIR: tempRoot,
}));

const { cleanupExpiredJobs, saveJob } = await import("@/lib/server/portrait-job-store");

describe("cleanupExpiredJobs", () => {
  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("removes expired job directories", async () => {
    const jobId = "job_expired";
    await saveJob({
      jobId,
      status: "completed",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      expiresAt: new Date(0).toISOString(),
      sourceFiles: [{ fileName: "portrait.jpg", mimeType: "image/jpeg", path: path.join(tempRoot, jobId, "source.jpg") }],
      candidateCount: 4,
      aspectRatio: "4:5",
      expression: 4,
      bgColor: "#2a2a2a",
      enabledVars: { subject_gender: true, subject_age: true, expression: true, bg_color: true },
      subjectNote: "",
      subjectGender: "male",
      subjectAge: 32,
      promptTemplate: "prompt",
      warnings: [],
      attemptedModels: [],
      variants: [],
    });

    await cleanupExpiredJobs(Date.now());

    await expect(
      fs.access(path.join(tempRoot, jobId)),
    ).rejects.toThrow();
  });
});
