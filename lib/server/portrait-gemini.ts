import fs from "node:fs/promises";
import { ApiError, GoogleGenAI } from "@google/genai";
import { portraitPreset } from "@/lib/config/portrait-preset";
import { PortraitError } from "@/lib/server/portrait-errors";
import { readFileBase64 } from "@/lib/server/portrait-storage";
import type {
  ModelSelfCheckEntry,
  ModelSelfCheckResponse,
  PortraitModelAttempt,
  PortraitModelOption,
  SubjectGender,
} from "@/lib/server/portrait-types";
import { getImageDimensions, guessExtension } from "@/lib/server/portrait-utils";

type GeneratedVariant = {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
  fileName: string;
};

type GenerateVariantResult = {
  variants: GeneratedVariant[];
  selectedModel: PortraitModelOption;
  warnings: string[];
  attemptedModels: PortraitModelAttempt[];
};

export class GeminiPortraitClient {
  private readonly client: GoogleGenAI;

  constructor(apiKey = process.env.GEMINI_API_KEY) {
    if (!apiKey) {
      throw new PortraitError("GEMINI_API_KEY is missing.");
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  async generateVariants(params: {
    sourceFiles: Array<{ fileName: string; mimeType: string; path: string }>;
    candidateCount: number;
    subjectNote: string;
    subjectGender: SubjectGender;
    subjectAge: number;
    promptTemplate: string;
  }): Promise<GenerateVariantResult> {
    // Load all source images as base64
    const sourceParts = await Promise.all(
      params.sourceFiles.map(async (sf) => ({
        inlineData: {
          mimeType: sf.mimeType,
          data: await readFileBase64(sf.path),
        },
      })),
    );

    const { parts: referenceParts, missingFiles } = await loadReferenceParts();
    const warnings: string[] = [];
    const attemptedModels: PortraitModelAttempt[] = [];
    const modelChain = [
      portraitPreset.preferredModel,
      ...portraitPreset.fallbackModels,
    ];

    if (missingFiles.length > 0) {
      warnings.push(
        `Some reference images are missing from the repo (${missingFiles.join(", ")}). The style run will rely more heavily on the text preset.`,
      );
    }

    let lastError: unknown;

    for (const modelOption of modelChain) {
      try {
        const jobs = Array.from(
          { length: params.candidateCount },
          (_, index) =>
            this.generateSingleVariant({
              index,
              model: modelOption.apiName,
              sourceParts,
              subjectNote: params.subjectNote,
              subjectGender: params.subjectGender,
              subjectAge: params.subjectAge,
              promptTemplate: params.promptTemplate,
              referenceParts,
            }),
        );

        const variants = await Promise.all(jobs);

        attemptedModels.push({
          model: modelOption.apiName,
          label: modelOption.label,
          status: "success",
        });

        return {
          variants,
          selectedModel: modelOption,
          warnings,
          attemptedModels,
        };
      } catch (error) {
        lastError = error;
        const reason = summarizeModelError(error);
        attemptedModels.push({
          model: modelOption.apiName,
          label: modelOption.label,
          status: "failed",
          reason,
        });

        if (!shouldFallback(error, modelOption, modelChain)) {
          throw buildFinalModelError(attemptedModels, error);
        }

        const nextModel = modelChain[attemptedModels.length];
        warnings.push(
          `Preferred model ${modelOption.label} (${modelOption.apiName}) was unavailable: ${reason}. Falling back to ${nextModel.label} (${nextModel.apiName}).`,
        );
      }
    }

    throw buildFinalModelError(attemptedModels, lastError);
  }

  async runModelSelfCheck(): Promise<ModelSelfCheckResponse> {
    const checkedAt = new Date().toISOString();
    const configuredModels = getConfiguredModelChain();

    try {
      const pager = await this.client.models.list();
      const visibleModels: Array<{
        name?: string;
        supportedActions?: string[];
      }> = [];

      for await (const model of pager) {
        visibleModels.push(model);
      }

      const entries = configuredModels.map<ModelSelfCheckEntry>((modelOption) => {
        const visibleModel = visibleModels.find((candidate) =>
          candidate.name?.endsWith(modelOption.apiName),
        );

        if (!visibleModel) {
          return {
            model: modelOption.apiName,
            label: modelOption.label,
            summary: modelOption.summary,
            status: "unavailable",
            reason:
              "Model was not returned by Gemini models.list for this project/key.",
            supportedActions: [],
          };
        }

        return {
          model: modelOption.apiName,
          label: modelOption.label,
          summary: modelOption.summary,
          status: "available",
          supportedActions: visibleModel.supportedActions ?? [],
        };
      });

      const warnings: string[] = [];
      const effective = entries.find((entry) => entry.status === "available");

      if (!effective) {
        warnings.push(
          "No configured image model is currently visible for this Gemini project/key. Check billing, usage tier, and model availability.",
        );
      } else if (effective.model !== portraitPreset.preferredModel.apiName) {
        warnings.push(
          `Preferred model ${portraitPreset.preferredModel.label} is not visible. Effective fallback would start with ${effective.label}.`,
        );
      }

      warnings.push(
        "Self-check uses Gemini models.list and does not spend image-generation credits. Runtime generation can still fall back later because of quota, preview restrictions, or temporary model outages.",
      );

      return {
        ok: Boolean(effective),
        checkedAt,
        effectiveModel: effective?.model,
        effectiveModelLabel: effective?.label,
        warnings,
        entries,
      };
    } catch (error) {
      const message = summarizeModelError(error);
      return {
        ok: false,
        checkedAt,
        warnings: [
          `Gemini self-check failed before model discovery: ${message}`,
          "Check GEMINI_API_KEY, billing, and whether this project can access Gemini Developer API model listing.",
        ],
        entries: configuredModels.map((modelOption) => ({
          model: modelOption.apiName,
          label: modelOption.label,
          summary: modelOption.summary,
          status: "unavailable",
          reason: message,
          supportedActions: [],
        })),
      };
    }
  }

  private async generateSingleVariant(params: {
    index: number;
    model: string;
    sourceParts: Array<{
      inlineData: { mimeType: string; data: string };
    }>;
    subjectNote: string;
    subjectGender: SubjectGender;
    subjectAge: number;
    promptTemplate: string;
    referenceParts: Array<{
      inlineData: { mimeType: string; data: string };
    }>;
  }): Promise<GeneratedVariant> {
    const prompt = buildPortraitPrompt({
      variantIndex: params.index,
      subjectNote: params.subjectNote,
      subjectGender: params.subjectGender,
      subjectAge: params.subjectAge,
      promptTemplate: params.promptTemplate,
    });

    const response = await this.client.models.generateContent({
      model: params.model,
      contents: [
        { text: prompt },
        ...params.referenceParts,
        ...params.sourceParts,
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: buildImageConfig(params.model),
      },
    });

    const imagePart = response.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .find((part) => part.inlineData?.data);

    if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
      throw new PortraitError(
        `Gemini did not return an image for candidate ${params.index + 1}.`,
      );
    }

    const bytes = Buffer.from(imagePart.inlineData.data, "base64");
    const blob = new Blob([bytes], { type: imagePart.inlineData.mimeType });
    const dimensions = await getImageDimensions(blob);

    return {
      bytes,
      mimeType: imagePart.inlineData.mimeType,
      width: dimensions.width,
      height: dimensions.height,
      fileName: `variant-${params.index + 1}${guessExtension(imagePart.inlineData.mimeType)}`,
    };
  }
}

export function getConfiguredModelChain() {
  return [portraitPreset.preferredModel, ...portraitPreset.fallbackModels];
}

async function loadReferenceParts() {
  const parts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  const missingFiles: string[] = [];

  for (const referencePath of portraitPreset.referenceImagePaths) {
    try {
      const buffer = await fs.readFile(referencePath);
      const mimeType =
        referencePath.endsWith(".png") ? "image/png" : referencePath.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";

      parts.push({
        inlineData: {
          mimeType,
          data: buffer.toString("base64"),
        },
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }

       missingFiles.push(referencePath.split("/").pop() ?? referencePath);
    }
  }

  return { parts, missingFiles };
}

function buildImageConfig(model: string) {
  if (model === "gemini-3-pro-image-preview" || model === "gemini-3.1-flash-image-preview") {
    return {
      aspectRatio: portraitPreset.aspectRatio,
      imageSize: "2K",
    };
  }

  return {
    aspectRatio: portraitPreset.aspectRatio,
  };
}

function shouldFallback(
  error: unknown,
  modelOption: PortraitModelOption,
  modelChain: PortraitModelOption[],
) {
  const currentIndex = modelChain.findIndex(
    (candidate) => candidate.apiName === modelOption.apiName,
  );
  if (currentIndex === -1 || currentIndex === modelChain.length - 1) {
    return false;
  }

  const status = getErrorStatus(error);
  const message = getErrorText(error).toLowerCase();

  if (status && [403, 404, 429, 500, 503].includes(status)) {
    return true;
  }

  return [
    "permission",
    "quota",
    "rate",
    "billing",
    "unavailable",
    "not found",
    "unsupported model",
    "not enabled",
    "resource exhausted",
    "temporarily unavailable",
  ].some((token) => message.includes(token));
}

function buildFinalModelError(
  attempts: PortraitModelAttempt[],
  error: unknown,
) {
  const status = getErrorStatus(error);
  const summary = summarizeTerminalFailure(attempts, error);
  const retryAfterSeconds = extractRetryAfterSeconds(error);
  const info =
    status === 429
      ? {
          retryable: true,
          retryAfterSeconds,
          actionLabel: "Open AI Studio Billing",
          actionUrl: "https://aistudio.google.com/",
        }
      : status === 403
        ? {
            retryable: false,
            actionLabel: "Open AI Studio Billing",
            actionUrl: "https://aistudio.google.com/",
          }
        : status === 404
          ? {
              retryable: false,
              actionLabel: "Open Gemini Models",
              actionUrl: "https://ai.google.dev/gemini-api/docs/models",
            }
          : undefined;

  return new PortraitError(
    summary,
    status && status >= 400 && status < 600 ? status : 502,
    info,
  );
}

function summarizeModelError(error: unknown) {
  const status = getErrorStatus(error);
  const message = getErrorText(error).replace(/\s+/g, " ").trim();
  if (status) {
    return `HTTP ${status}: ${message}`;
  }
  return message || "Unknown model error";
}

function getErrorStatus(error: unknown) {
  if (error instanceof ApiError) {
    return error.status;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }

  return undefined;
}

function getErrorText(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Gemini error";
}

function summarizeTerminalFailure(
  attempts: PortraitModelAttempt[],
  error: unknown,
) {
  const status = getErrorStatus(error);
  const modelLabels = attempts.map((attempt) => attempt.label).join(" -> ");
  const retryDelay = extractRetryDelay(error);
  const retrySuffix = retryDelay ? ` Retry in about ${retryDelay}.` : "";

  if (status === 429) {
    return `Quota exceeded for all configured image models (${modelLabels}). Enable billing or move this project to a paid Gemini usage tier.${retrySuffix}`;
  }

  if (status === 403) {
    return `Access to all configured image models was denied (${modelLabels}). Check billing, project permissions, and model availability for this Gemini project.`;
  }

  if (status === 404) {
    return `None of the configured image models are available for this Gemini project (${modelLabels}). Check current model availability and fallback configuration.`;
  }

  const compactReasons = attempts
    .map((attempt) => `${attempt.label}: ${compactReason(attempt.reason)}`)
    .join(" | ");

  return `Image generation failed across all configured models. ${compactReasons}`;
}

function compactReason(reason?: string) {
  if (!reason) {
    return "failed";
  }

  const normalized = reason.replace(/\s+/g, " ").trim();

  if (normalized.startsWith("HTTP 429")) {
    return "quota exceeded";
  }

  if (normalized.startsWith("HTTP 403")) {
    return "access denied";
  }

  if (normalized.startsWith("HTTP 404")) {
    return "model unavailable";
  }

  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117)}...`;
}

function extractRetryDelay(error: unknown) {
  const text = getErrorText(error);
  const match = text.match(/retry in\s+([0-9.]+s)/i);
  if (match?.[1]) {
    return match[1];
  }

  const altMatch = text.match(/"retryDelay":"([^"]+)"/i);
  if (altMatch?.[1]) {
    return altMatch[1];
  }

  return undefined;
}

function extractRetryAfterSeconds(error: unknown) {
  const delay = extractRetryDelay(error);
  if (!delay) {
    return undefined;
  }

  const seconds = Number.parseInt(delay.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

export function renderPromptTemplate(
  promptTemplate: string,
  subjectGender: SubjectGender,
  subjectAge: number,
) {
  return promptTemplate
    .replaceAll("{{subject_gender}}", subjectGender)
    .replaceAll("{{subject_age}}", `${subjectAge} years old`);
}

function buildPortraitPrompt(params: {
  variantIndex: number;
  subjectNote: string;
  subjectGender: SubjectGender;
  subjectAge: number;
  promptTemplate: string;
}) {
  const seedDirections = [
    "Slightly more editorial and composed, with poised confidence.",
    "Slightly warmer skin-light balance with calm professional energy.",
    "Slightly cleaner wardrobe normalization and subtle tonal depth.",
    "Slightly crisper silhouette separation while keeping the mood restrained.",
  ];

  const renderedTemplate = renderPromptTemplate(
    params.promptTemplate,
    params.subjectGender,
    params.subjectAge,
  );

  const sections = [
    renderedTemplate,
    "You are editing a real portrait photo for a professional team page.",
    `Preserve identity: ${portraitPreset.identityPolicy}`,
    "Keep the output realistic and photographic. Do not make it look AI-generated, surreal, illustrated, or over-retouched.",
    `Output format: ${portraitPreset.outputDescription}`,
    `Lighting: ${portraitPreset.lighting}`,
    `Background: ${portraitPreset.background.prompt}`,
    `Color palette: ${portraitPreset.palette.join(", ")}.`,
    `Wardrobe direction: ${portraitPreset.wardrobeRules}`,
    ...portraitPreset.styleNotes,
    "Frame as a premium portrait crop suitable for a consistent website team grid.",
    "Keep pose natural. Preserve hairstyle, eyewear, skin texture realism, and recognizable facial structure.",
    "Do not change gender presentation, ethnicity, approximate age, body shape, or signature facial traits.",
    "Do not add extra accessories, props, text, logos, or background objects.",
    `Candidate variation cue: ${seedDirections[params.variantIndex] ?? seedDirections[0]}`,
  ];

  if (params.subjectNote.trim()) {
    sections.push(`User note: ${params.subjectNote.trim()}`);
  }

  return sections.join("\n");
}
