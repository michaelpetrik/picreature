#!/usr/bin/env node

/**
 * Testovací prostředí pro refining system promptu generátoru prompt templates.
 *
 * Spuštění:
 *   node scripts/test-prompt-engineer.mjs
 *   node scripts/test-prompt-engineer.mjs --variant 2
 *   node scripts/test-prompt-engineer.mjs --list
 *
 * Vyžaduje GEMINI_API_KEY v .env.local nebo prostředí.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load .env.local
try {
  const envPath = path.join(ROOT, fs.existsSync(path.join(ROOT, ".env.local")) ? ".env.local" : ".env");
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match) process.env[match[1]] = match[2].trim();
  }
} catch { /* ok */ }

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("GEMINI_API_KEY is required. Set it in .env.local or environment.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Reference — the "gold standard" output we want the AI to approximate
// ---------------------------------------------------------------------------

const REFERENCE_TEMPLATE = `A hyper-realistic, high-fidelity professional headshot of the white {{subject_gender}} subject ({{subject_age}}) from the attached reference, strictly maintaining exact facial likeness and identity. The subject is framed in a classic head-and-shoulders portrait against a solid, matte dark charcoal seamless studio background. He is wearing a sharp, dark navy blazer over a simple black t-shirt or turtleneck, projecting a modern clean aesthetic. The lighting is a professional high-contrast studio setup, utilizing a large softbox key light at a 45-degree angle to sculpt the facial features with controlled shadows (Rembrandt style), completely void of natural daylight. A subtle cool-toned rim light separates the subject from the dark background. Shot on a Phase One XF IQ4 with an 85mm f/1.4 portrait lens, capturing razor-sharp focus on the eyes, realistic skin texture, and the fine weave of the fabric in 8k resolution.`;

// ---------------------------------------------------------------------------
// Test cases — user inputs that should produce something close to reference
// ---------------------------------------------------------------------------

const TEST_CASES = [
  {
    id: "basic",
    input: "profesionální studiový portrét s tmavým pozadím",
    description: "Basic Czech input — should produce studio portrait with dark background",
  },
  {
    id: "detailed",
    input: "professional studio headshot, dark charcoal background, navy blazer, Rembrandt lighting, 8k",
    description: "Detailed English input with specific cues from reference",
  },
  {
    id: "minimal",
    input: "corporate headshot",
    description: "Minimal input — AI should fill in professional defaults",
  },
  {
    id: "creative",
    input: "outdoor portrait, golden hour, casual clothing, shallow depth of field, warm tones",
    description: "Intentionally different from reference — tests creative freedom",
  },
];

// ---------------------------------------------------------------------------
// System prompt variants to A/B test
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_VARIANTS = [
  {
    id: 1,
    name: "Current (baseline)",
    prompt: `You are a portrait photography prompt engineer for an AI portrait studio.
Your task is to write a detailed prompt template that will be used with Gemini image generation to create professional portraits from uploaded source photos.

TEMPLATE VARIABLES (use exactly as shown):
- {{subject_gender}} — will be replaced with "male" or "female"
- {{subject_age}} — will be replaced with e.g. "41 years old"

REQUIREMENTS:
- Describe: lighting setup, background, clothing/wardrobe, composition/framing, camera/lens simulation, mood/tone, skin rendering
- Write in English
- Keep under 500 words
- Be specific about photography techniques (Rembrandt lighting, softbox, etc.)
- Include resolution/quality cues (8k, razor-sharp focus, etc.)
- Output ONLY the prompt template text — no titles, headers, explanations, or markdown formatting`,
  },
  {
    id: 2,
    name: "Structured with golden example",
    prompt: `You are a portrait photography prompt engineer for an AI portrait studio.
Write a detailed prompt template for Gemini image generation that transforms uploaded source photos into professional portraits.

TEMPLATE VARIABLES — use exactly as written, they will be substituted at runtime:
- {{subject_gender}} → "male" or "female"
- {{subject_age}} → e.g. "41 years old"

STRUCTURE YOUR PROMPT TO COVER (in this order):
1. Subject description — reference the attached photo, use {{subject_gender}} and {{subject_age}}, emphasize identity preservation
2. Framing — head-and-shoulders, bust, three-quarter, etc.
3. Background — color, texture, material (seamless paper, gradient, environment)
4. Wardrobe — specific clothing items, colors, style
5. Lighting — name the technique (Rembrandt, butterfly, split, loop), describe key light, fill, rim/hair light
6. Camera simulation — specific camera body, lens focal length and aperture, focus point, resolution
7. Skin and texture — realistic rendering cues, no over-retouching

GOLDEN EXAMPLE (for calibration — this is the quality bar):
"A hyper-realistic, high-fidelity professional headshot of the white {{subject_gender}} subject ({{subject_age}}) from the attached reference, strictly maintaining exact facial likeness and identity. The subject is framed in a classic head-and-shoulders portrait against a solid, matte dark charcoal seamless studio background. He is wearing a sharp, dark navy blazer over a simple black t-shirt or turtleneck, projecting a modern clean aesthetic. The lighting is a professional high-contrast studio setup, utilizing a large softbox key light at a 45-degree angle to sculpt the facial features with controlled shadows (Rembrandt style), completely void of natural daylight. A subtle cool-toned rim light separates the subject from the dark background. Shot on a Phase One XF IQ4 with an 85mm f/1.4 portrait lens, capturing razor-sharp focus on the eyes, realistic skin texture, and the fine weave of the fabric in 8k resolution."

RULES:
- Write in English, under 500 words
- Always start with subject description referencing the attached photo
- Always include {{subject_gender}} and {{subject_age}} variables
- Always mention identity preservation ("strictly maintaining exact facial likeness")
- Be specific: name camera bodies, lens specs, lighting gear
- Output ONLY the prompt text — no markdown, no headers, no commentary`,
  },
  {
    id: 3,
    name: "Role-play with constraints",
    prompt: `You are Karl, a senior retoucher at a high-end portrait studio. You write prompts for AI portrait generation systems.

When a client describes what they want, you translate it into a precise, technical prompt template. You think in terms of:
- Phase One / Hasselblad medium format cameras
- Profoto / Broncolor studio strobes
- Named lighting patterns (Rembrandt, butterfly, clamshell, split)
- Specific lens focal lengths and apertures
- Paper backdrops, V-flats, and grip equipment

TEMPLATE VARIABLES you must include:
- {{subject_gender}} — replaced with "male" or "female" at runtime
- {{subject_age}} — replaced with age like "32 years old" at runtime

ALWAYS include in your prompt:
- "from the attached reference" (the system provides a source photo)
- "strictly maintaining exact facial likeness and identity"
- Specific camera + lens (e.g. "Phase One XF IQ4 with 85mm f/1.4")
- Resolution cue ("8k resolution" or "ultra-high resolution")
- Skin texture direction ("realistic skin texture", no plastic look)

FORMAT:
- Single paragraph, flowing prose (not bullet points)
- Under 500 words
- English only
- Output ONLY the prompt — no greetings, no explanations, no markdown`,
  },
];

// ---------------------------------------------------------------------------
// Scoring — simple keyword overlap + structural checks
// ---------------------------------------------------------------------------

const QUALITY_CHECKS = [
  { name: "Has {{subject_gender}}", test: (t) => t.includes("{{subject_gender}}") },
  { name: "Has {{subject_age}}", test: (t) => t.includes("{{subject_age}}") },
  { name: "Identity preservation", test: (t) => /identity|likeness|facial/i.test(t) },
  { name: "Lighting technique", test: (t) => /rembrandt|butterfly|softbox|key light|split|clamshell|loop/i.test(t) },
  { name: "Camera/lens spec", test: (t) => /\d+mm|f\/\d|phase one|hasselblad|canon|nikon/i.test(t) },
  { name: "Resolution cue", test: (t) => /8k|4k|ultra.?high|high.?resolution/i.test(t) },
  { name: "Background described", test: (t) => /background|backdrop/i.test(t) },
  { name: "Wardrobe described", test: (t) => /blazer|shirt|jacket|clothing|wardrobe|wearing|dressed/i.test(t) },
  { name: "Skin/texture cue", test: (t) => /skin|texture|pore|retouch/i.test(t) },
  { name: "Attached reference", test: (t) => /attached|reference|source|uploaded/i.test(t) },
  { name: "Under 500 words", test: (t) => t.split(/\s+/).length <= 500 },
  { name: "No markdown", test: (t) => !/^#|^\*\*|^- /m.test(t) },
];

function scoreTemplate(template) {
  const results = QUALITY_CHECKS.map((check) => ({
    name: check.name,
    pass: check.test(template),
  }));
  const passed = results.filter((r) => r.pass).length;
  return { results, passed, total: results.length, score: Math.round((passed / results.length) * 100) };
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

async function generatePrompt(systemPrompt, userInput) {
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: API_KEY });

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ text: userInput }],
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  });

  return response.text?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--list")) {
  console.log("\n=== System Prompt Variants ===\n");
  for (const v of SYSTEM_PROMPT_VARIANTS) {
    console.log(`  ${v.id}. ${v.name}`);
  }
  console.log("\n=== Test Cases ===\n");
  for (const tc of TEST_CASES) {
    console.log(`  [${tc.id}] "${tc.input}"`);
    console.log(`         ${tc.description}\n`);
  }
  process.exit(0);
}

const variantIdx = args.indexOf("--variant");
const variantId = variantIdx >= 0 ? Number(args[variantIdx + 1]) : null;
const testCaseIdx = args.indexOf("--test");
const testCaseId = testCaseIdx >= 0 ? args[testCaseIdx + 1] : null;

const variants = variantId
  ? SYSTEM_PROMPT_VARIANTS.filter((v) => v.id === variantId)
  : SYSTEM_PROMPT_VARIANTS;

const cases = testCaseId
  ? TEST_CASES.filter((tc) => tc.id === testCaseId)
  : TEST_CASES;

if (variants.length === 0) {
  console.error(`Variant ${variantId} not found. Use --list to see available variants.`);
  process.exit(1);
}

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║        PROMPT ENGINEER — SYSTEM PROMPT TEST LAB        ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

// Score reference for baseline
const refScore = scoreTemplate(REFERENCE_TEMPLATE);
console.log(`Reference template score: ${refScore.score}% (${refScore.passed}/${refScore.total})\n`);

const resultsDir = path.join(ROOT, ".cache", "prompt-tests");
fs.mkdirSync(resultsDir, { recursive: true });

const allResults = [];

for (const variant of variants) {
  console.log(`\n━━━ Variant ${variant.id}: ${variant.name} ━━━\n`);

  for (const tc of cases) {
    process.stdout.write(`  [${tc.id}] "${tc.input}" ... `);

    try {
      const start = Date.now();
      const template = await generatePrompt(variant.prompt, tc.input);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const score = scoreTemplate(template);

      const result = {
        variant: variant.id,
        variantName: variant.name,
        testCase: tc.id,
        input: tc.input,
        score: score.score,
        passed: score.passed,
        total: score.total,
        elapsed: `${elapsed}s`,
        checks: score.results,
        template,
      };
      allResults.push(result);

      const failed = score.results.filter((r) => !r.pass).map((r) => r.name);
      const failStr = failed.length > 0 ? ` (missing: ${failed.join(", ")})` : "";
      console.log(`${score.score}% (${score.passed}/${score.total}) in ${elapsed}s${failStr}`);

      // Save individual result
      const filename = `v${variant.id}-${tc.id}.md`;
      const content = [
        `# Variant ${variant.id}: ${variant.name}`,
        `## Test: ${tc.id} — "${tc.input}"`,
        `Score: ${score.score}% (${score.passed}/${score.total})`,
        `Time: ${elapsed}s`,
        "",
        "### Quality Checks",
        ...score.results.map((r) => `- [${r.pass ? "x" : " "}] ${r.name}`),
        "",
        "### Generated Template",
        "```",
        template,
        "```",
      ].join("\n");
      fs.writeFileSync(path.join(resultsDir, filename), content);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      allResults.push({
        variant: variant.id,
        testCase: tc.id,
        score: 0,
        error: err.message,
      });
    }
  }
}

// Summary
console.log("\n\n╔══════════════════════════════════════════════════════════╗");
console.log("║                      SUMMARY                           ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

const byVariant = new Map();
for (const r of allResults) {
  if (!byVariant.has(r.variant)) byVariant.set(r.variant, []);
  byVariant.get(r.variant).push(r);
}

for (const [vid, results] of byVariant) {
  const variant = SYSTEM_PROMPT_VARIANTS.find((v) => v.id === vid);
  const scores = results.filter((r) => r.score != null).map((r) => r.score);
  const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  console.log(`  Variant ${vid} (${variant?.name}): avg ${avg}%`);
  for (const r of results) {
    console.log(`    [${r.testCase}] ${r.score ?? "ERR"}%${r.error ? ` — ${r.error}` : ""}`);
  }
  console.log();
}

// Save full report
const reportPath = path.join(resultsDir, "report.json");
fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), reference: refScore, results: allResults }, null, 2));
console.log(`Full results saved to: ${reportPath}`);
console.log(`Individual templates in: ${resultsDir}/\n`);
