"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ModelSelfCheckResponse,
  PortraitJobResponse,
  PortraitPreset,
  PortraitVariantSummary,
  SubjectGender,
} from "@/lib/server/portrait-types";

type StudioProps = {
  preset: PortraitPreset;
  hasGeminiApiKey: boolean;
  envFileHint: string;
};

const POLL_INTERVAL_MS = 2200;
const ACTIVE_JOB_STORAGE_KEY = "picreature.activeJobId";

type FormState = {
  file: File | null;
  subjectNote: string;
  subjectGender: SubjectGender;
  subjectAge: number;
  promptTemplate: string;
};

function createInitialForm(preset: PortraitPreset): FormState {
  return {
    file: null,
    subjectNote: "",
    subjectGender: "male",
    subjectAge: 32,
    promptTemplate: preset.defaultPromptTemplate,
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

export function Studio({ preset, hasGeminiApiKey, envFileHint }: StudioProps) {
  const [form, setForm] = useState<FormState>(() => createInitialForm(preset));
  const [sessionApiKey, setSessionApiKey] = useState("");
  const [job, setJob] = useState<PortraitJobResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetupHelp, setShowSetupHelp] = useState(false);
  const [selfCheck, setSelfCheck] = useState<ModelSelfCheckResponse | null>(null);
  const [selfCheckLoading, setSelfCheckLoading] = useState(true);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [inputPreviewUrl, setInputPreviewUrl] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const dragDepth = useRef(0);

  const renderedPromptPreview = useMemo(() => {
    return form.promptTemplate
      .replaceAll("{{subject_gender}}", form.subjectGender)
      .replaceAll("{{subject_age}}", `${form.subjectAge} years old`);
  }, [form.promptTemplate, form.subjectAge, form.subjectGender]);

  const hasReferenceSlots = preset.referenceImagePaths.length > 0;
  const modelChain = [preset.preferredModel, ...preset.fallbackModels];
  const hasSessionApiKey = sessionApiKey.trim().length > 0;
  const hasRuntimeApiKey = hasGeminiApiKey || hasSessionApiKey;

  const isPolling = job?.status === "queued" || job?.status === "running";
  const canSubmit = hasRuntimeApiKey && !isSubmitting;

  function createAuthHeaders() {
    if (!hasSessionApiKey) {
      return undefined;
    }

    return {
      "x-gemini-api-key": sessionApiKey.trim(),
    };
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
    if (!form.file) {
      setInputPreviewUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(form.file);
    setInputPreviewUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [form.file]);

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

    if (!form.file) {
      setError("Choose a portrait image before starting a job.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const body = new FormData();
    body.set("image", form.file);
    body.set("subjectNote", form.subjectNote);
    body.set("subjectGender", form.subjectGender);
    body.set("subjectAge", String(form.subjectAge));
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

  function setSelectedFile(file: File | null) {
    setForm((current) => ({
      ...current,
      file,
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
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) {
      setSelectedFile(file);
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
                accept="image/png,image/jpeg,image/webp"
                aria-label="Input image"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              />
              <div className="drop-copy">
                <div className="drop-title">
                  {isDraggingFile ? "drop image" : "drop image here"}
                </div>
                <div className="drop-subtitle">
                  {form.file ? form.file.name : "or click to choose file"}
                </div>
              </div>
            </div>

            {inputPreviewUrl ? (
              <div className="input-preview">
                <img src={inputPreviewUrl} alt="Input preview" />
              </div>
            ) : null}

            <div className="inline-fields">
              <select
                id="subject-gender"
                className="input gender-select"
                aria-label="Subject gender"
                value={form.subjectGender}
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
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      subjectAge: Number(event.target.value),
                    }))
                  }
                />
              </div>
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
            <div className="variant-grid">
              {job.variants.map((variant, index) => (
                <VariantCard key={variant.id} index={index} variant={variant} />
              ))}
            </div>
          ) : (
            <div className="empty-state">no output</div>
          )}
        </section>
      </section>
    </main>
  );
}

function VariantCard({
  index,
  variant,
}: {
  index: number;
  variant: PortraitVariantSummary;
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
        </div>
      </div>
    </article>
  );
}
