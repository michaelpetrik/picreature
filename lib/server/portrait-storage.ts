import fs from "node:fs/promises";
import path from "node:path";
import { JOB_ROOT_DIR } from "@/lib/server/portrait-constants";

export function getJobDir(jobId: string) {
  return path.join(JOB_ROOT_DIR, jobId);
}

export function getJobRecordPath(jobId: string) {
  return path.join(getJobDir(jobId), "job.json");
}

export async function ensureJobRoot() {
  await fs.mkdir(JOB_ROOT_DIR, { recursive: true });
}

export async function ensureJobDir(jobId: string) {
  const dir = getJobDir(jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeFileBuffer(filePath: string, buffer: Buffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

export async function readFileBase64(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return buffer.toString("base64");
}
