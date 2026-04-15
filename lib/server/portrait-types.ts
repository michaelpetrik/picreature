export type JobStatus = "queued" | "running" | "completed" | "failed";

export type BrandBackground = {
  label: string;
  prompt: string;
};

export type PortraitModelOption = {
  apiName: string;
  label: string;
  summary: string;
};

export type SubjectGender = "male" | "female";

export type PortraitErrorInfo = {
  retryable: boolean;
  retryAfterSeconds?: number;
  actionLabel?: string;
  actionUrl?: string;
};

export type PortraitModelAttempt = {
  model: string;
  label: string;
  status: "success" | "failed";
  reason?: string;
};

export type ModelSelfCheckEntry = {
  model: string;
  label: string;
  summary: string;
  status: "available" | "unavailable";
  reason?: string;
  supportedActions: string[];
};

export type ModelSelfCheckResponse = {
  ok: boolean;
  checkedAt: string;
  effectiveModel?: string;
  effectiveModelLabel?: string;
  warnings: string[];
  entries: ModelSelfCheckEntry[];
};

export type PortraitPreset = {
  id: string;
  title: string;
  preferredModel: PortraitModelOption;
  fallbackModels: PortraitModelOption[];
  defaultPromptTemplate: string;
  aspectRatio: "4:5" | "1:1" | "3:4";
  candidateCount: number;
  identityPolicy: string;
  lighting: string;
  outputDescription: string;
  wardrobeRules: string;
  palette: string[];
  background: BrandBackground;
  referenceImagePaths: string[];
  styleNotes: string[];
};

export type PortraitVariantSummary = {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  previewUrl: string;
  downloadUrl: string;
};

export type PortraitJobRecord = {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  sourceFiles: Array<{ fileName: string; mimeType: string; path: string }>;
  candidateCount: number;
  expression: number;
  bgColor: string;
  subjectNote: string;
  subjectGender: SubjectGender;
  subjectAge: number;
  promptTemplate: string;
  statusMessage?: string;
  error?: string;
  errorInfo?: PortraitErrorInfo;
  warnings: string[];
  selectedModel?: string;
  selectedModelLabel?: string;
  attemptedModels: PortraitModelAttempt[];
  variants: Array<{
    id: string;
    fileName: string;
    filePath: string;
    mimeType: string;
    width: number;
    height: number;
  }>;
};

export type PortraitJobResponse = {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  statusMessage?: string;
  error?: string;
  errorInfo?: PortraitErrorInfo;
  warnings: string[];
  selectedModel?: string;
  selectedModelLabel?: string;
  attemptedModels: PortraitModelAttempt[];
  variants: PortraitVariantSummary[];
};
