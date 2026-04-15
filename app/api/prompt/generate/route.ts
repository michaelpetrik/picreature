import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { readRequestApiKey } from "@/lib/server/portrait-utils";
import { PortraitError, getErrorMessage } from "@/lib/server/portrait-errors";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a portrait photography prompt engineer for an AI portrait studio.
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
- Output ONLY the prompt template text — no titles, headers, explanations, or markdown formatting`;

const REFINE_SYSTEM_PROMPT = `You are a portrait photography prompt engineer for an AI portrait studio.
You will receive an existing prompt template and a user request describing what to change.
Modify the template according to the user's request while preserving its overall structure and quality.

TEMPLATE VARIABLES (preserve exactly as shown):
- {{subject_gender}} — will be replaced with "male" or "female"
- {{subject_age}} — will be replaced with e.g. "41 years old"

RULES:
- Keep the template under 500 words
- Preserve any {{subject_gender}} and {{subject_age}} variables
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
