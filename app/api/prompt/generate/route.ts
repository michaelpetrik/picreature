import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { readRequestApiKey } from "@/lib/server/portrait-utils";
import { PortraitError, getErrorMessage } from "@/lib/server/portrait-errors";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a portrait photography prompt engineer for an AI portrait studio.
Write a detailed prompt template for Gemini image generation that transforms uploaded source photos into professional portraits.

TEMPLATE VARIABLES — use exactly as written, they will be substituted at runtime:
- {{subject_gender}} → "male" or "female"
- {{subject_age}} → e.g. "41 years old"
- {{expression}} → facial expression from "serious" to "joyful laughter"
- {{bg_color}} → background color as hex code e.g. "#2a2a2a"

STRUCTURE YOUR PROMPT TO COVER (in this order):
1. Subject description — reference the attached photo, use {{subject_gender}} and {{subject_age}}, emphasize identity preservation
2. Framing — head-and-shoulders, bust, three-quarter, etc.
3. Background — color, texture, material (seamless paper, gradient, environment)
4. Wardrobe — specific clothing items, colors, style
5. Lighting — name the technique (Rembrandt, butterfly, split, loop), describe key light, fill, rim/hair light
6. Camera simulation — specific camera body, lens focal length and aperture, focus point, resolution
7. Skin and texture — realistic rendering cues, no over-retouching

GOLDEN EXAMPLE (for calibration — this is the quality bar):
"A hyper-realistic, high-fidelity professional headshot of the white {{subject_gender}} subject ({{subject_age}}) from the attached reference, strictly maintaining exact facial likeness and identity. The subject has a {{expression}} facial expression. The subject is framed in a classic head-and-shoulders portrait against a solid, matte {{bg_color}} seamless studio background. He is wearing a sharp, dark navy blazer over a simple black t-shirt or turtleneck, projecting a modern clean aesthetic. The lighting is a professional high-contrast studio setup, utilizing a large softbox key light at a 45-degree angle to sculpt the facial features with controlled shadows (Rembrandt style), completely void of natural daylight. A subtle cool-toned rim light separates the subject from the dark background. Shot on a Phase One XF IQ4 with an 85mm f/1.4 portrait lens, capturing razor-sharp focus on the eyes, realistic skin texture, and the fine weave of the fabric in 8k resolution."

RULES:
- Write in English, under 500 words
- Always start with subject description referencing the attached photo
- Always include {{subject_gender}}, {{subject_age}}, {{expression}}, and {{bg_color}} variables
- Always mention identity preservation ("strictly maintaining exact facial likeness")
- Be specific: name camera bodies, lens specs, lighting gear
- Output ONLY the prompt text — no markdown, no headers, no commentary`;

const REFINE_SYSTEM_PROMPT = `You are a portrait photography prompt engineer for an AI portrait studio.
You will receive an existing prompt template and a user request describing what to change.
Modify the template according to the user's request while preserving its overall structure and quality.

TEMPLATE VARIABLES — preserve exactly as written:
- {{subject_gender}} → "male" or "female"
- {{subject_age}} → e.g. "41 years old"
- {{expression}} → facial expression from "serious" to "joyful laughter"
- {{bg_color}} → background color as hex code e.g. "#2a2a2a"

RULES:
- Keep the template under 500 words
- Always preserve all {{...}} template variables
- Always preserve identity preservation language
- Maintain the same structural flow: subject → framing → background → wardrobe → lighting → camera → skin
- Write in English
- Output ONLY the modified prompt template text — no explanations or commentary`;

const PROMPT_MODEL = "gemini-2.5-flash";

export async function POST(request: Request) {
  try {
    const apiKey = readRequestApiKey(request) ?? process.env.GEMINI_API_KEY;
    if (!apiKey?.trim()) {
      throw new PortraitError("Gemini API key is missing.", 401);
    }

    const body = (await request.json()) as {
      mode: "generate" | "refine";
      userInput: string;
      currentTemplate?: string;
    };

    if (!body.userInput?.trim()) {
      throw new PortraitError("User input is required.");
    }

    if (body.mode === "refine" && !body.currentTemplate?.trim()) {
      throw new PortraitError("Current template is required for refine mode.");
    }

    const client = new GoogleGenAI({ apiKey });

    const systemPrompt =
      body.mode === "refine" ? REFINE_SYSTEM_PROMPT : SYSTEM_PROMPT;

    const userMessage =
      body.mode === "refine"
        ? `EXISTING TEMPLATE:\n${body.currentTemplate}\n\nREQUESTED CHANGES:\n${body.userInput}`
        : body.userInput;

    const response = await client.models.generateContent({
      model: PROMPT_MODEL,
      contents: [{ text: userMessage }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new PortraitError("AI generated an empty response.", 502);
    }

    return NextResponse.json({ template: text });
  } catch (error) {
    const status = error instanceof PortraitError ? error.statusCode : 500;
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status },
    );
  }
}
