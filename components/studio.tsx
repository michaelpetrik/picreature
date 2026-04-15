"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ModelSelfCheckResponse,
  PortraitJobResponse,
  PortraitPreset,
  PortraitVariantSummary,
  SubjectGender,
} from "@/lib/server/portrait-types";
import { PROMPT_VAR_DEFAULTS } from "@/lib/server/portrait-types";
import { PhotoEditor } from "@/components/photo-editor";

type StudioProps = {
  preset: PortraitPreset;
  hasGeminiApiKey: boolean;
  envFileHint: string;
  acceptedImageTypes: string;
};

const POLL_INTERVAL_MS = 2200;
const ACTIVE_JOB_STORAGE_KEY = "picreature.activeJobId";
const TEMPLATES_STORAGE_KEY = "picreature.promptTemplates";

type SavedTemplate = {
  id: string;
  name: string;
  content: string;
  createdAt: string;
};

const EXPRESSION_LABELS = [
  "serious",
  "composed",
  "neutral",
  "calm",
  "slight smile",
  "friendly smile",
  "warm smile",
  "big smile",
  "laughing",
  "beaming",
  "joyful laughter",
] as const;

type VarToggles = {
  subject_gender: boolean;
  subject_age: boolean;
  expression: boolean;
  bg_color: boolean;
};

type FormState = {
  files: File[];
  subjectNote: string;
  subjectGender: SubjectGender;
  subjectAge: number;
  expression: number;
  bgColor: string;
  candidateCount: number;
  promptTemplate: string;
  enabledVars: VarToggles;
};

function createInitialForm(preset: PortraitPreset): FormState {
  return {
    files: [],
    subjectNote: "",
    subjectGender: "male",
    subjectAge: 32,
    expression: 4,
    bgColor: "#2a2a2a",
    candidateCount: preset.candidateCount,
    promptTemplate: preset.defaultPromptTemplate,
    enabledVars: {
      subject_gender: true,
      subject_age: true,
      expression: true,
      bg_color: true,
    },
  };
}

function ErrorActions({
  error,
  onRetry,
}: {
  error: PortraitJobResponse;
  onRetry: () => void;
}) {
  if (!error.errorInfo && !error.error) {
    return null;
  }

  return (
    <div className="error-block">
      {error.error ? <div className="error">{error.error}</div> : null}
      <div className="micro">
        {error.errorInfo?.retryable
          ? error.errorInfo.retryAfterSeconds
            ? `retryable in ~${error.errorInfo.retryAfterSeconds}s`
            : "retryable"
          : "non-retryable until setup changes"}
      </div>
      <div className="actions">
        {error.errorInfo?.retryable ? (
          <button className="ghost-button" type="button" onClick={onRetry}>
            retry
          </button>
        ) : null}
        {error.errorInfo?.actionUrl ? (
          <a
            className="ghost-button link-button compact-link"
            href={error.errorInfo.actionUrl}
            target="_blank"
            rel="noreferrer"
          >
            {error.errorInfo.actionLabel ?? "open"}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function Studio({ preset, hasGeminiApiKey, envFileHint, acceptedImageTypes }: StudioProps) {
  const [form, setForm] = useState<FormState>(() => createInitialForm(preset));
  const [sessionApiKey, setSessionApiKey] = useState("");
  const [job, setJob] = useState<PortraitJobResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetupHelp, setShowSetupHelp] = useState(false);
  const [selfCheck, setSelfCheck] = useState<ModelSelfCheckResponse | null>(null);
  const [selfCheckLoading, setSelfCheckLoading] = useState(true);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [inputPreviewUrls, setInputPreviewUrls] = useState<string[]>([]);
  const [editTarget, setEditTarget] = useState<{ url: string; name: string } | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [aiInput, setAiInput] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const pollTimer = useRef<number | null>(null);
  const dragDepth = useRef(0);
  const templateFileRef = useRef<HTMLInputElement>(null);

  const renderedPromptPreview = useMemo(() => {
    const ev = form.enabledVars;
    const v = (key: keyof typeof PROMPT_VAR_DEFAULTS, value: string) =>
      ev[key] !== false ? value : PROMPT_VAR_DEFAULTS[key];
    return form.promptTemplate
      .replaceAll("{{subject_gender}}", v("subject_gender", form.subjectGender))
      .replaceAll("{{subject_age}}", v("subject_age", `${form.subjectAge} years old`))
      .replaceAll("{{expression}}", v("expression", EXPRESSION_LABELS[form.expression] ?? "neutral"))
      .replaceAll("{{bg_color}}", v("bg_color", form.bgColor));
  }, [form.promptTemplate, form.subjectAge, form.subjectGender, form.expression, form.bgColor, form.enabledVars]);

  const hasReferenceSlots = preset.referenceImagePaths.length > 0;
  const modelChain = [preset.preferredModel, ...preset.fallbackModels];
  const hasSessionApiKey = sessionApiKey.trim().length > 0;
  const hasRuntimeApiKey = hasGeminiApiKey || hasSessionApiKey;

  const isPolling = job?.status === "queued" || job?.status === "running";
  const canSubmit = hasRuntimeApiKey && !isSubmitting && form.files.length > 0;

  function createAuthHeaders() {
    if (!hasSessionApiKey) {
      return undefined;
    }

    return {
      "x-gemini-api-key": sessionApiKey.trim(),
    };
  }

  // --- Template management ---

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (raw) {
      try { setSavedTemplates(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }, []);

  function persistTemplates(templates: SavedTemplate[]) {
    setSavedTemplates(templates);
    window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  }

  function handleSaveTemplate() {
    const name = window.prompt("Template name:", "My Template");
    if (!name?.trim()) return;
    const id = `tpl_${Date.now()}`;
    const next = [...savedTemplates, { id, name: name.trim(), content: form.promptTemplate, createdAt: new Date().toISOString() }];
    persistTemplates(next);
    setSelectedTemplateId(id);
  }

  function handleUpdateTemplate() {
    if (!selectedTemplateId) { handleSaveTemplate(); return; }
    const next = savedTemplates.map((t) =>
      t.id === selectedTemplateId ? { ...t, content: form.promptTemplate } : t,
    );
    persistTemplates(next);
  }

  function handleDeleteTemplate() {
    if (!selectedTemplateId) return;
    const next = savedTemplates.filter((t) => t.id !== selectedTemplateId);
    persistTemplates(next);
    setSelectedTemplateId(null);
  }

  function handleSelectTemplate(id: string) {
    if (id === "__default__") {
      setSelectedTemplateId(null);
      setForm((c) => ({ ...c, promptTemplate: preset.defaultPromptTemplate }));
      return;
    }
    const tpl = savedTemplates.find((t) => t.id === id);
    if (tpl) {
      setSelectedTemplateId(id);
      setForm((c) => ({ ...c, promptTemplate: tpl.content }));
    }
  }

  function handleExportTemplate() {
    const name = savedTemplates.find((t) => t.id === selectedTemplateId)?.name ?? "template";
    const content = `---\nname: ${name}\n---\n\n${form.promptTemplate}`;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-zA-Z0-9-_]/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportTemplate(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      let text = reader.result as string;
      let name = file.name.replace(/\.md$/i, "");

      // Parse frontmatter
      const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
      if (match) {
        const frontmatter = match[1];
        const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
        if (nameMatch) name = nameMatch[1].trim();
        text = text.slice(match[0].length).trim();
      }

      const id = `tpl_${Date.now()}`;
      const next = [...savedTemplates, { id, name, content: text, createdAt: new Date().toISOString() }];
      persistTemplates(next);
      setSelectedTemplateId(id);
      setForm((c) => ({ ...c, promptTemplate: text }));
    };
    reader.readAsText(file);
  }

  async function handleAiGenerate(mode: "generate" | "refine") {
    if (!aiInput.trim() || aiGenerating) return;
    setAiGenerating(true);
    try {
      const response = await fetch("/api/prompt/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...createAuthHeaders(),
        },
        body: JSON.stringify({
          mode,
          userInput: aiInput.trim(),
          currentTemplate: mode === "refine" ? form.promptTemplate : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "AI prompt generation failed.");
        return;
      }
      setForm((c) => ({ ...c, promptTemplate: data.template }));
      setAiInput("");
      setSelectedTemplateId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI prompt generation failed.");
    } finally {
      setAiGenerating(false);
    }
  }

  async function fetchJob(jobId: string): Promise<PortraitJobResponse | null> {
    const response = await fetch(`/api/portrait/jobs/${jobId}`, {
      method: "GET",
      cache: "no-store",
      headers: createAuthHeaders(),
    });
    const payload = (await response.json()) as PortraitJobResponse;

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }

      throw new Error(payload.error ?? "Unable to refresh portrait job status.");
    }

    return payload;
  }

  useEffect(() => {
    if (!hasRuntimeApiKey) {
      setSelfCheck({
        ok: false,
        checkedAt: new Date().toISOString(),
        warnings: [
          `Gemini API key is missing. Add GEMINI_API_KEY to ${envFileHint} or paste a session key in the UI.`,
        ],
        entries: [],
      });
      setSelfCheckLoading(false);
      return;
    }

    let cancelled = false;

    async function runSelfCheck() {
      setSelfCheckLoading(true);

      try {
        const response = await fetch("/api/diagnostics/models", {
          method: "GET",
          cache: "no-store",
          headers: createAuthHeaders(),
        });
        const payload = (await response.json()) as ModelSelfCheckResponse;

        if (!cancelled) {
          setSelfCheck(payload);
        }
      } catch (checkError) {
        if (!cancelled) {
          setSelfCheck({
            ok: false,
            checkedAt: new Date().toISOString(),
            warnings: [
              checkError instanceof Error
                ? checkError.message
                : "Unable to run Gemini self-check.",
            ],
            entries: [],
          });
        }
      } finally {
        if (!cancelled) {
          setSelfCheckLoading(false);
        }
      }
    }

    void runSelfCheck();

    return () => {
      cancelled = true;
    };
  }, [envFileHint, hasRuntimeApiKey, sessionApiKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedJobId = window.localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (!storedJobId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const restoredJob = await fetchJob(storedJobId);
        if (cancelled) {
          return;
        }

        if (!restoredJob) {
          window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
          return;
        }

        setJob(restoredJob);
      } catch (restoreError) {
        if (cancelled) {
          return;
        }

        setError(
          restoreError instanceof Error
            ? restoreError.message
            : "Unable to restore the last portrait job.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionApiKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!job?.jobId) {
      window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, job.jobId);
  }, [job?.jobId]);

  useEffect(() => {
    if (!job?.jobId || !isPolling) {
      return;
    }

    const currentJobId = job.jobId;
    const currentSessionApiKey = sessionApiKey.trim();
    let cancelled = false;

    async function pollJobStatus() {
      while (!cancelled) {
        await new Promise<void>((resolve) => {
          pollTimer.current = window.setTimeout(resolve, POLL_INTERVAL_MS);
        });

        if (cancelled) {
          return;
        }

        try {
          const payload = await fetch(`/api/portrait/jobs/${currentJobId}`, {
            method: "GET",
            cache: "no-store",
            headers: currentSessionApiKey
              ? { "x-gemini-api-key": currentSessionApiKey }
              : undefined,
          }).then(async (response) => {
            const parsedPayload = (await response.json()) as PortraitJobResponse;
            if (!response.ok) {
              if (response.status === 404) {
                return null;
              }

              throw new Error(
                parsedPayload.error ?? "Unable to refresh portrait job status.",
              );
            }

            return parsedPayload;
          });
          if (cancelled) {
            return;
          }

          if (!payload) {
            setJob(null);
            setError("Portrait job expired or was not found.");
            return;
          }

          setJob(payload);
          setError((current) =>
            current === "Unable to refresh portrait job status." ? null : current,
          );

          if (payload.status !== "queued" && payload.status !== "running") {
            return;
          }
        } catch (pollError) {
          if (cancelled) {
            return;
          }

          setError(
            pollError instanceof Error
              ? pollError.message
              : "Unable to refresh portrait job status.",
          );
        }
      }
    }

    void pollJobStatus();

    return () => {
      cancelled = true;
      if (pollTimer.current) {
        window.clearTimeout(pollTimer.current);
      }
    };
  }, [job?.jobId, isPolling, sessionApiKey]);

  useEffect(() => {
    function hasFiles(event: DragEvent) {
      return Array.from(event.dataTransfer?.types ?? []).includes("Files");
    }

    function handleWindowDragEnter(event: DragEvent) {
      if (!hasFiles(event)) {
        return;
      }

      dragDepth.current += 1;
      setIsDraggingFile(true);
    }

    function handleWindowDragOver(event: DragEvent) {
      if (!hasFiles(event)) {
        return;
      }

      event.preventDefault();
      setIsDraggingFile(true);
    }

    function handleWindowDragLeave(event: DragEvent) {
      if (!hasFiles(event)) {
        return;
      }

      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) {
        setIsDraggingFile(false);
      }
    }

    function handleWindowDrop() {
      dragDepth.current = 0;
      setIsDraggingFile(false);
    }

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, []);

  useEffect(() => {
    if (form.files.length === 0) {
      setInputPreviewUrls([]);
      return;
    }

    const urls = form.files.map((f) => URL.createObjectURL(f));
    setInputPreviewUrls(urls);

    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [form.files]);

  const currentStatusLabel = useMemo(() => {
    switch (job?.status) {
      case "queued":
        return "queued";
      case "running":
        return "running";
      case "completed":
        return "ready";
      case "failed":
        return "failed";
      default:
        return "idle";
    }
  }, [job?.status]);

  const runtimeNotice = useMemo(() => {
    if (!hasRuntimeApiKey) {
      return `missing GEMINI_API_KEY in ${envFileHint} (or paste session key)`;
    }

    if (selfCheckLoading) {
      return "checking model access";
    }

    if (selfCheck?.effectiveModelLabel) {
      return `${selfCheck.effectiveModelLabel}${selfCheck.effectiveModel ? ` / ${selfCheck.effectiveModel}` : ""}`;
    }

    return selfCheck?.warnings[0] ?? null;
  }, [envFileHint, hasRuntimeApiKey, selfCheck, selfCheckLoading]);

  const topBadge = useMemo(() => {
    if (!hasRuntimeApiKey) {
      return "setup needed";
    }

    if (job?.errorInfo?.retryable) {
      return "retryable";
    }

    if (job?.error || (selfCheck && !selfCheck.ok)) {
      return "setup needed";
    }

    return null;
  }, [hasRuntimeApiKey, job?.error, job?.errorInfo?.retryable, selfCheck]);

  const animatedStatusText = useMemo(() => {
    switch (job?.status) {
      case "queued":
        return "queued for generation";
      case "running":
        return "generating portraits";
      default:
        return null;
    }
  }, [job?.status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasRuntimeApiKey) {
      setError(`Gemini API key is missing. Add GEMINI_API_KEY to ${envFileHint} or paste a session key.`);
      return;
    }

    if (form.files.length === 0) {
      setError("Choose at least one portrait image before starting a job.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const body = new FormData();
    for (const file of form.files) {
      body.append("image", file);
    }
    body.set("subjectNote", form.subjectNote);
    body.set("subjectGender", form.subjectGender);
    body.set("subjectAge", String(form.subjectAge));
    body.set("expression", String(form.expression));
    body.set("bgColor", form.bgColor);
    body.set("candidateCount", String(form.candidateCount));
    body.set("enabledVars", JSON.stringify(form.enabledVars));
    body.set("promptTemplate", form.promptTemplate);

    try {
      const response = await fetch("/api/portrait/jobs", {
        method: "POST",
        body,
        headers: createAuthHeaders(),
      });

      const payload = (await response.json()) as PortraitJobResponse;

      if (!response.ok) {
        setError(payload.error ?? "Unable to create a portrait job.");
        return;
      }

      setJob(payload);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to create a portrait job.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegenerate() {
    if (!job?.jobId) {
      return;
    }

    setError(null);
    const response = await fetch(`/api/portrait/jobs/${job.jobId}/regenerate`, {
      method: "POST",
      headers: createAuthHeaders(),
    });
    const payload = (await response.json()) as PortraitJobResponse;

    if (!response.ok) {
      setError(payload.error ?? "Unable to regenerate portrait candidates.");
      return;
    }

    setJob(payload);
  }

  function addFiles(newFiles: File[]) {
    if (newFiles.length === 0) return;
    setForm((current) => ({
      ...current,
      files: [...current.files, ...newFiles],
    }));
  }

  function removeFile(index: number) {
    setForm((current) => ({
      ...current,
      files: current.files.filter((_, i) => i !== index),
    }));
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingFile(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDraggingFile(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDraggingFile(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) {
      addFiles(files);
      setError(null);
    }
  }

  return (
    <main className="shell">
      <div className="topline">
        <span>picreature</span>
        <div className="topline-actions">
          {topBadge ? <span className="status-chip">{topBadge}</span> : null}
          {runtimeNotice ? <span>{runtimeNotice}</span> : null}
          <button
            className="ghost-button text-button"
            type="button"
            onClick={() => setShowSetupHelp(true)}
          >
            setup
          </button>
        </div>
      </div>

      {showSetupHelp ? (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Gemini setup help"
        >
          <div className="overlay-panel">
            <div className="overlay-head">
              <span>gemini setup</span>
              <button
                className="ghost-button text-button"
                type="button"
                onClick={() => setShowSetupHelp(false)}
              >
                close
              </button>
            </div>

            <div className="overlay-body">
              <p>
                Pokud vidíš quota chybu s <code>limit: 0</code>, znamená to
                obvykle, že tento projekt nemá pro image modely aktivní placený
                Gemini tier. U image modelů často free tier vůbec není.
              </p>

              <ol className="clean ordered">
                <li>Otevři Google AI Studio: <code>aistudio.google.com</code></li>
                <li>Jdi na <code>API keys</code> a vytvoř key pro správný projekt</li>
                <li>V AI Studiu otevři <code>Billing</code> a zapni placený režim</li>
                <li>Zkontroluj <code>Usage</code>, že projekt není jen free tier</li>
                <li>Klíč vlož do <code>{envFileHint}</code> jako <code>GEMINI_API_KEY=...</code></li>
                <li>Restartuj appku nebo rebuildni Docker container</li>
              </ol>

              <p>
                Co ta chyba znamená:
              </p>

              <ul className="clean">
                <li><code>free_tier_requests, limit: 0</code> = pro ten model není na tomto projektu dostupná free quota</li>
                <li><code>429</code> = quota nebo usage tier nestačí</li>
                <li><code>403</code> = billing, access nebo model availability problém</li>
              </ul>

              <p>
                Appka zkouší modely v pořadí:
                <br />
                <code>{modelChain.map((item) => item.apiName).join(" -> ")}</code>
              </p>

              <p>
                Odkazy:
                <br />
                <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">
                  AI Studio / Billing
                </a>
                <br />
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  AI Studio / API keys
                </a>
                <br />
                <a href="https://ai.google.dev/gemini-api/docs/billing/" target="_blank" rel="noreferrer">
                  Gemini billing
                </a>
                <br />
                <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noreferrer">
                  Gemini rate limits
                </a>
                <br />
                <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">
                  Gemini pricing
                </a>
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="workspace">
        <aside className="panel">
          <form className="stack controls" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="session-api-key">Gemini API key (session only)</label>
              <input
                id="session-api-key"
                className="input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={hasGeminiApiKey ? "optional override" : "paste API key"}
                value={sessionApiKey}
                onChange={(event) => setSessionApiKey(event.target.value)}
              />
              <div className="micro">
                This key stays only in this browser tab memory and is never persisted to disk.
              </div>
            </div>

            <div
              className={`drop-input${isDraggingFile ? " is-dragging" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                id="image"
                className="file-input"
                type="file"
                accept={acceptedImageTypes}
                aria-label="Input image"
                multiple
                onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
              />
              <div className="drop-copy">
                <div className="drop-title">
                  {isDraggingFile ? "drop images" : "drop images here"}
                </div>
                <div className="drop-subtitle">
                  {form.files.length > 0
                    ? `${form.files.length} file${form.files.length > 1 ? "s" : ""} selected`
                    : "or click to choose files"}
                </div>
              </div>
            </div>

            {inputPreviewUrls.length > 0 ? (
              <div className="input-preview-grid">
                {inputPreviewUrls.map((url, i) => (
                  <div key={url} className="input-preview">
                    <img src={url} alt={`Input ${i + 1}`} />
                    <div className="input-preview-actions">
                      <button
                        className="link-button input-edit-button"
                        type="button"
                        onClick={() =>
                          setEditTarget({
                            url,
                            name: form.files[i]?.name ?? "input",
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="remove-button"
                        type="button"
                        onClick={() => removeFile(i)}
                        aria-label={`Remove image ${i + 1}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="inline-fields">
              <VarToggle
                label="gender"
                varName="subject_gender"
                enabled={form.enabledVars.subject_gender}
                onToggle={(v) => setForm((c) => ({ ...c, enabledVars: { ...c.enabledVars, subject_gender: v } }))}
              >
                <select
                  id="subject-gender"
                  className="input gender-select"
                  aria-label="Subject gender"
                  value={form.subjectGender}
                  disabled={!form.enabledVars.subject_gender}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      subjectGender: event.target.value as SubjectGender,
                    }))
                  }
                >
                  <option value="male">male</option>
                  <option value="female">female</option>
                </select>
              </VarToggle>

              <VarToggle
                label="age"
                varName="subject_age"
                enabled={form.enabledVars.subject_age}
                onToggle={(v) => setForm((c) => ({ ...c, enabledVars: { ...c.enabledVars, subject_age: v } }))}
              >
                <div className="age-control">
                  <span>{form.subjectAge}</span>
                  <input
                    id="subject-age"
                    className="range-input"
                    type="range"
                    min="18"
                    max="80"
                    step="1"
                    aria-label="Subject age"
                    value={form.subjectAge}
                    disabled={!form.enabledVars.subject_age}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        subjectAge: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </VarToggle>
            </div>

            <VarToggle
              label={`expression — ${EXPRESSION_LABELS[form.expression]}`}
              varName="expression"
              enabled={form.enabledVars.expression}
              onToggle={(v) => setForm((c) => ({ ...c, enabledVars: { ...c.enabledVars, expression: v } }))}
            >
              <div className="candidate-control">
                <input
                  id="expression"
                  className="range-input"
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={form.expression}
                  disabled={!form.enabledVars.expression}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expression: Number(event.target.value),
                    }))
                  }
                />
              </div>
            </VarToggle>

            <VarToggle
              label={`background — ${form.bgColor}`}
              varName="bg_color"
              enabled={form.enabledVars.bg_color}
              onToggle={(v) => setForm((c) => ({ ...c, enabledVars: { ...c.enabledVars, bg_color: v } }))}
            >
              <div className="bg-color-control">
                <div className="bg-color-row">
                  <input
                    type="color"
                    className="color-picker-input"
                    value={form.bgColor}
                    disabled={!form.enabledVars.bg_color}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, bgColor: e.target.value }))
                    }
                    aria-label="Background color"
                  />
                  <input
                    type="text"
                    className="input color-hex-input"
                    value={form.bgColor}
                    disabled={!form.enabledVars.bg_color}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, bgColor: e.target.value }))
                    }
                    placeholder="#rrggbb"
                    spellCheck={false}
                  />
                </div>
              </div>
            </VarToggle>

            <div className="candidate-control">
              <label htmlFor="candidate-count">
                candidates <span className="muted-inline">{form.candidateCount}</span>
              </label>
              <input
                id="candidate-count"
                className="range-input"
                type="range"
                min="1"
                max="8"
                step="1"
                value={form.candidateCount}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    candidateCount: Number(event.target.value),
                  }))
                }
              />
            </div>

            <textarea
              id="subject-note"
              className="textarea"
              placeholder="note"
              value={form.subjectNote}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  subjectNote: event.target.value,
                }))
              }
            />

            <div className="template-section">
              <div className="template-selector">
                <select
                  className="input gender-select"
                  value={selectedTemplateId ?? "__default__"}
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                >
                  <option value="__default__">Brand Portrait V1 (default)</option>
                  {savedTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <div className="template-actions">
                  <button className="ghost-button text-button" type="button" onClick={handleUpdateTemplate}>
                    save
                  </button>
                  <button className="ghost-button text-button" type="button" onClick={handleSaveTemplate}>
                    save as
                  </button>
                  {selectedTemplateId ? (
                    <button className="ghost-button text-button" type="button" onClick={handleDeleteTemplate}>
                      delete
                    </button>
                  ) : null}
                  <button className="ghost-button text-button" type="button" onClick={handleExportTemplate}>
                    export
                  </button>
                  <button className="ghost-button text-button" type="button" onClick={() => templateFileRef.current?.click()}>
                    import
                  </button>
                  <input
                    ref={templateFileRef}
                    type="file"
                    accept=".md,.txt"
                    className="hidden-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportTemplate(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              <div className="ai-prompt-bar">
                <input
                  type="text"
                  className="input ai-input"
                  placeholder="describe what you want..."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleAiGenerate("generate");
                    }
                  }}
                  disabled={aiGenerating}
                />
                <div className="ai-actions">
                  <button
                    className="ghost-button text-button"
                    type="button"
                    onClick={() => handleAiGenerate("generate")}
                    disabled={!aiInput.trim() || aiGenerating}
                  >
                    {aiGenerating ? "generating" : "generate"}
                  </button>
                  <button
                    className="ghost-button text-button"
                    type="button"
                    onClick={() => handleAiGenerate("refine")}
                    disabled={!aiInput.trim() || aiGenerating}
                  >
                    refine
                  </button>
                </div>
              </div>

              <textarea
                id="prompt-template"
                className="textarea prompt-field"
                placeholder="prompt"
                value={form.promptTemplate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    promptTemplate: event.target.value,
                  }))
                }
              />

              <textarea
                id="prompt-preview"
                className="textarea prompt-field preview-field"
                value={renderedPromptPreview}
                readOnly
              />
            </div>

            {error ? <div className="error-block"><div className="error">{error}</div></div> : null}
            {!hasReferenceSlots ? <div className="warning">no references</div> : null}
            {selfCheck && !selfCheck.ok && selfCheck.warnings[0] ? (
              <div className="warning">{selfCheck.warnings[0]}</div>
            ) : null}

            <div className="actions">
              <button className="button" type="submit" disabled={!canSubmit}>
                {isSubmitting ? "working" : "run"}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={handleRegenerate}
                disabled={!job?.jobId || isPolling}
              >
                again
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setForm(createInitialForm(preset));
                  setJob(null);
                  setError(null);
                }}
              >
                reset
              </button>
            </div>
          </form>
        </aside>

        <section className="panel">
          <div className="output-head">
            <span
              className={animatedStatusText ? "status-label is-active" : "status-label"}
            >
              <span>{currentStatusLabel}</span>
              {animatedStatusText ? (
                <span className="status-activity" aria-live="polite">
                  <span>{animatedStatusText}</span>
                  <span className="status-dots" aria-hidden="true" />
                </span>
              ) : null}
            </span>
            {job?.selectedModelLabel ? <span>{job.selectedModelLabel}</span> : null}
          </div>

          {job ? (
            <div className="status-card">
              <div className="stack">
                <div className="micro">{job.statusMessage ?? ""}</div>
                {job.warnings[0] ? <div className="warning">{job.warnings[0]}</div> : null}
                {job.error ? (
                  <ErrorActions error={job} onRetry={handleRegenerate} />
                ) : null}
              </div>
            </div>
          ) : null}

          {job?.variants.length ? (
            <>
              <div className="variant-grid">
                {job.variants.map((variant, index) => (
                  <VariantCard
                    key={variant.id}
                    index={index}
                    variant={variant}
                    onEdit={() => setEditTarget({ url: variant.previewUrl, name: `candidate-${variant.id}` })}
                  />
                ))}
              </div>
              {job.variants.length > 1 ? (
                <div className="download-all-row">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      job.variants.forEach((variant, i) => {
                        setTimeout(() => {
                          const a = document.createElement("a");
                          a.href = variant.downloadUrl;
                          a.download = "";
                          a.click();
                        }, i * 300);
                      });
                    }}
                  >
                    download all ({job.variants.length})
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">no output</div>
          )}

          {editTarget ? (
            <PhotoEditor
              imageUrl={editTarget.url}
              imageName={editTarget.name}
              onClose={() => setEditTarget(null)}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}

function VarToggle({
  label,
  varName,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  varName: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`var-toggle-wrap${enabled ? "" : " is-disabled"}`}>
      <div className="var-toggle-header">
        <label className="var-toggle-label">
          <input
            type="checkbox"
            className="var-toggle-check"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span>{label}</span>
          <code className="var-toggle-code">{`{{${varName}}}`}</code>
        </label>
      </div>
      {children}
    </div>
  );
}

function VariantCard({
  index,
  variant,
  onEdit,
}: {
  index: number;
  variant: PortraitVariantSummary;
  onEdit: () => void;
}) {
  return (
    <article className="variant-card">
      <div className="variant-frame">
        <img
          src={variant.previewUrl}
          alt={`Portrait candidate ${index + 1}`}
          loading="lazy"
        />
      </div>
      <div className="variant-body">
        <div className="variant-title">
          <h3>Candidate {index + 1}</h3>
          <span>
            {variant.width} x {variant.height}
          </span>
        </div>

        <div className="variant-actions">
          <a className="link-button" href={variant.previewUrl} target="_blank">
            Open preview
          </a>
          <a className="link-button" href={variant.downloadUrl} download>
            Download
          </a>
          <button className="link-button" type="button" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
    </article>
  );
}
