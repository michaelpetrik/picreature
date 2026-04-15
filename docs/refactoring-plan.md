# Picreature — Refactoring Plan

> Vygenerováno multi-analyst syntézou (3 analytici: Architecture/SOLID, Performance, Security).
> Datum: 2026-04-15

---

## Tier 1 — Kritické (low-effort, high-impact)

### 1.1 Validace `jobId` proti path traversal

**Problém:** `jobId` z URL se přímo concatenuje do filesystem cesty bez validace formátu. Umožňuje path traversal (`../../etc/passwd`).

**Soubory:**
- `lib/server/portrait-storage.ts` — přidat `validateJobId()`
- `app/api/portrait/jobs/[jobId]/route.ts` — volat na vstupu
- `app/api/portrait/jobs/[jobId]/regenerate/route.ts` — volat na vstupu
- `app/api/portrait/files/[jobId]/[variantId]/route.ts` — volat na vstupu + path containment check

**Implementace:**
```typescript
// lib/server/portrait-storage.ts
export function validateJobId(jobId: string): void {
  if (!/^job_[0-9a-f-]{36}$/i.test(jobId)) {
    throw new PortraitError("Invalid job identifier.", 400);
  }
}
```

V file-serving route přidat navíc:
```typescript
const resolved = path.resolve(variant.filePath);
const jobDir = path.resolve(getJobDir(jobId));
if (!resolved.startsWith(jobDir + path.sep)) {
  throw new PortraitError("File path outside job directory.", 403);
}
```

---

### 1.2 Dynamic import `PhotoEditor`

**Problém:** `@mediapipe/tasks-vision` (~5+ MB) je v main bundlu i když uživatel editor nikdy neotevře.

**Soubor:** `components/studio.tsx`

**Implementace:**
```typescript
// Nahradit:
import { PhotoEditor } from "@/components/photo-editor";

// Za:
import dynamic from "next/dynamic";
const PhotoEditor = dynamic(
  () => import("@/components/photo-editor").then((m) => ({ default: m.PhotoEditor })),
  { ssr: false },
);
```

---

### 1.3 Throttle `cleanupExpiredJobs`

**Problém:** `readJob()` volá `cleanupExpiredJobs()` na každém volání — full directory scan na každý poll request (2.2s interval). O(n) ve velikosti job directory.

**Soubor:** `lib/server/portrait-job-store.ts`

**Implementace:**
```typescript
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60_000;

export async function readJob(jobId: string) {
  const now = Date.now();
  if (now - lastCleanupAt > CLEANUP_INTERVAL_MS) {
    lastCleanupAt = now;
    void cleanupExpiredJobs(now).catch(() => {});
  }
  // ... read job.json
}
```

---

### 1.4 Pinout MediaPipe verze

**Problém:** WASM a model se načítají z CDN s `@latest` bez integrity checku. Supply chain riziko.

**Soubor:** `lib/client/segmentation.ts`

**Implementace:** Nahradit `@latest` za konkrétní pinovanou verzi odpovídající nainstalovanému npm balíčku:
```typescript
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.24/wasm";
```
Verzi zjistit z `node_modules/@mediapipe/tasks-vision/package.json`.

---

## Tier 2 — Vysoká priorita

### 2.1 Cache source pixels v compositing

**Problém:** `renderComposite` alokuje nový `OffscreenCanvas` + `getImageData` (~45 MB) na každou změnu barvy/featheru. Zdrojový obrázek se nemění.

**Soubor:** `lib/client/compositing.ts`

**Implementace:** Přidat module-level cache:
```typescript
let cachedPixels: ImageData | null = null;
let cachedKey: string | null = null;

function getSourcePixels(image: HTMLImageElement, w: number, h: number): ImageData {
  const key = `${image.src}:${w}:${h}`;
  if (cachedPixels && cachedKey === key) return cachedPixels;
  const offscreen = new OffscreenCanvas(w, h);
  offscreen.getContext("2d")!.drawImage(image, 0, 0, w, h);
  cachedPixels = offscreen.getContext("2d")!.getImageData(0, 0, w, h);
  cachedKey = key;
  return cachedPixels;
}
```

---

### 2.2 Extrahovat sdílený error response builder

**Problém:** Identický error response objekt (8 polí) je ručně konstruován ve 3 route handlerech. Navíc GET `[jobId]` route vynechává `errorInfo` — nekonzistence/bug.

**Soubory:**
- `lib/server/portrait-errors.ts` — přidat `buildErrorResponse()`
- `app/api/portrait/jobs/route.ts` — použít
- `app/api/portrait/jobs/[jobId]/route.ts` — použít
- `app/api/portrait/jobs/[jobId]/regenerate/route.ts` — použít

**Implementace:**
```typescript
// lib/server/portrait-errors.ts
export function buildErrorResponse(error: unknown): NextResponse {
  const status = error instanceof PortraitError ? error.statusCode : 500;
  return NextResponse.json({
    jobId: "",
    status: "failed" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: getErrorMessage(error),
    errorInfo: getErrorInfo(error),
    warnings: [],
    attemptedModels: [],
    variants: [],
  }, { status });
}
```

---

### 2.3 Extrahovat `useJobPolling` hook

**Problém:** `studio.tsx` (918 řádků) má 6+ zodpovědností. Polling logika (80 řádků) navíc duplicitně implementuje `fetchJob` — jednou jako helper (ř. 121) a znovu inline v effect (ř. 273-292).

**Soubory:**
- Nový `hooks/use-job-polling.ts`
- `components/studio.tsx` — zmenšit

**Implementace:**
```typescript
// hooks/use-job-polling.ts
export function useJobPolling(
  initialJobId: string | null,
  createAuthHeaders: () => Record<string, string> | undefined,
) {
  const [job, setJob] = useState<PortraitJobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Encapsulate: fetchJob, polling loop, localStorage persistence, restore-on-mount
  return { job, setJob, error, setError };
}
```

Zvážit taky extrakci:
- `hooks/use-self-check.ts` — diagnostics fetch
- `hooks/use-file-drag-drop.ts` — window-level drag tracking

---

### 2.4 Validovat délku uživatelských vstupů

**Problém:** `subjectNote` a `promptTemplate` nemají délkový limit. Prompt injection + memory.

**Soubor:** `app/api/portrait/jobs/route.ts`

**Implementace:**
```typescript
if (subjectNote.length > 500) {
  throw new PortraitError("Subject note must be 500 characters or fewer.");
}
if (promptTemplate.length > 5000) {
  throw new PortraitError("Prompt template must be 5000 characters or fewer.");
}
```

---

### 2.5 Cache segmenter mezi editor sessions

**Problém:** Každé otevření editoru stahuje WASM + model a inicializuje segmenter (1-3s). Při editaci více variant zbytečně.

**Soubor:** `lib/client/segmentation.ts`

**Implementace:**
```typescript
let cached: ImageSegmenter | null = null;

export async function getOrCreateSegmenter(): Promise<ImageSegmenter> {
  if (cached) return cached;
  cached = await createSegmenter();
  return cached;
}
```

V `photo-editor.tsx` nevolat `segmenter.close()` v cleanup.

---

### 2.6 Immutable cache headers pro variant images

**Problém:** `Cache-Control: no-store` na immutable variant obrázcích — browser stahuje 4 obrázky znovu na každý re-render.

**Soubor:** `app/api/portrait/files/[jobId]/[variantId]/route.ts`

**Implementace:**
```typescript
"Cache-Control": "private, max-age=86400, immutable"
```

---

## Tier 3 — Střední priorita

### 3.1 Optimalizovat pixel loop v `applyMask`

**Soubor:** `lib/client/compositing.ts`

- Inline `featherAlpha` (eliminace per-pixel function call)
- `| 0` místo `Math.round` (rychlejší integer conversion)
- `<< 2` místo `* 4`
- Hoist `transparent` branch mimo loop

---

### 3.2 `React.memo` pro `VariantCard`

**Soubor:** `components/studio.tsx`

- Wrap `VariantCard` do `React.memo`
- Stabilizovat `onEdit` callback přes `useCallback`

---

### 3.3 Data-driven `imageSize` v `PortraitModelOption`

**Soubor:** `lib/server/portrait-gemini.ts`

Přesunout hardcoded model-name check v `buildImageConfig` do dat:
```typescript
type PortraitModelOption = {
  apiName: string;
  label: string;
  summary: string;
  imageSize?: string; // "2K", "4K"
};
```

---

### 3.4 Sjednotit `ensurePortraitJobRunning` + `schedulePortraitJob`

**Soubor:** `lib/server/portrait-job-runner.ts`

Obě funkce jsou téměř identické. Sjednotit do jedné:
```typescript
export function schedulePortraitJob(
  jobId: string,
  opts?: { apiKey?: string; await?: boolean }
): Promise<void> | void
```

---

### 3.5 Concurrent job cap

**Soubor:** `app/api/portrait/jobs/route.ts`

```typescript
if (activeJobs.size >= 8) {
  throw new PortraitError("Too many concurrent jobs.", 429);
}
```

---

### 3.6 Sanitize `Content-Disposition` filename

**Soubor:** `app/api/portrait/files/[jobId]/[variantId]/route.ts`

```typescript
const safeFilename = variant.fileName.replace(/[^\w.-]/g, "_");
```

---

## Tier 4 — Nízká priorita

| # | Co | Soubor |
|---|---|--------|
| 4.1 | Odstranit nepoužívaný `SegmentationResult` typ | `lib/client/segmentation.ts` |
| 4.2 | Odstranit/sjednotit `ensurePortraitJobRunning` (ověřit testy) | `lib/server/portrait-job-runner.ts` |
| 4.3 | Generic error message pro non-`PortraitError` | `lib/server/portrait-errors.ts` |
| 4.4 | Buď použít Zod pro validaci, nebo odebrat z deps | `package.json` |
| 4.5 | Checkerboard přes `createPattern` | `lib/client/compositing.ts` |
| 4.6 | `GeminiPortraitClient` constructor — `apiKey` povinný | `lib/server/portrait-gemini.ts` |
| 4.7 | Předávat preset jako parametr místo import singletonu | `portrait-gemini.ts`, `portrait-job-store.ts` |

---

## Otevřená rizika

1. **`ensurePortraitJobRunning`** — pravděpodobně nepoužívaný, ale ověřit v testech před smazáním.
2. **Prompt injection** — délkové limity zmírní problém, ale uživatel má plnou kontrolu nad prompt template. Plná ochrana = omezit editovatelnost šablony.
3. **WASM self-hosting** — ideální z pohledu supply chain, ale přidává build complexity. Pro lokální tool postačí pin verze.
4. **Console monkey-patching** — race condition při overlapping `suppressWasmLogs()` volání. Zvážit ref-counting approach.

---

## Checklist

### Tier 1 — Kritické

- [ ] 1.1 `validateJobId()` + path containment check v file-serving route
- [ ] 1.2 Dynamic import `PhotoEditor` přes `next/dynamic`
- [ ] 1.3 Throttle `cleanupExpiredJobs` (max 1×/min)
- [ ] 1.4 Pin `@mediapipe/tasks-vision` WASM URL na konkrétní verzi

### Tier 2 — Vysoká priorita

- [ ] 2.1 Cache source pixels v `compositing.ts` (eliminace 45 MB alokace per render)
- [ ] 2.2 Sdílený `buildErrorResponse()` v `portrait-errors.ts` (DRY across 3 routes)
- [ ] 2.3 Extrahovat `useJobPolling` hook ze `studio.tsx` (eliminace fetch duplicity)
- [ ] 2.4 Délkové limity na `subjectNote` (500) a `promptTemplate` (5000)
- [ ] 2.5 Cache `ImageSegmenter` mezi editor sessions
- [ ] 2.6 `Cache-Control: private, max-age=86400, immutable` pro variant images

### Tier 3 — Střední priorita

- [ ] 3.1 Inline `featherAlpha` + optimalizace pixel loop v `applyMask`
- [ ] 3.2 `React.memo` pro `VariantCard` + stabilní `onEdit` callback
- [ ] 3.3 Data-driven `imageSize` v `PortraitModelOption`
- [ ] 3.4 Sjednotit `ensurePortraitJobRunning` + `schedulePortraitJob`
- [ ] 3.5 Concurrent job cap (max 8)
- [ ] 3.6 Sanitize `Content-Disposition` filename

### Tier 4 — Nízká priorita

- [ ] 4.1 Odstranit nepoužívaný `SegmentationResult` typ
- [ ] 4.2 Ověřit a případně odstranit `ensurePortraitJobRunning`
- [ ] 4.3 Generic error message pro non-`PortraitError` výjimky
- [ ] 4.4 Rozhodnout: použít Zod pro validaci, nebo odebrat z deps
- [ ] 4.5 Checkerboard přes `createPattern` místo per-cell `fillRect`
- [ ] 4.6 `GeminiPortraitClient` — `apiKey` jako povinný parametr
- [ ] 4.7 Předávat preset jako parametr místo import singletonu
