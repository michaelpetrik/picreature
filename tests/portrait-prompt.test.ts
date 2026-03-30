import { describe, expect, it } from "vitest";
import { portraitPreset } from "@/lib/config/portrait-preset";
import { GeminiPortraitClient, renderPromptTemplate } from "@/lib/server/portrait-gemini";

describe("portrait preset", () => {
  it("keeps 4:5 output and identity guardrails", () => {
    expect(portraitPreset.aspectRatio).toBe("4:5");
    expect(portraitPreset.identityPolicy).toMatch(/Preserve face identity/i);
  });

  it("uses four candidates", () => {
    expect(portraitPreset.candidateCount).toBe(4);
  });

  it("configures a preferred model with fallbacks", () => {
    expect(portraitPreset.preferredModel.apiName).toBe("gemini-3-pro-image-preview");
    expect(portraitPreset.fallbackModels.length).toBeGreaterThanOrEqual(2);
  });

  it("renders gender and age into the default prompt template", () => {
    const prompt = renderPromptTemplate(
      portraitPreset.defaultPromptTemplate,
      "female",
      41,
    );

    expect(prompt).toContain("white female subject (41 years old)");
    expect(prompt).not.toContain("{{subject_gender}}");
    expect(prompt).not.toContain("{{subject_age}}");
  });

  it("requires API key at runtime", () => {
    expect(() => new GeminiPortraitClient("")).toThrow(/GEMINI_API_KEY/);
  });
});
