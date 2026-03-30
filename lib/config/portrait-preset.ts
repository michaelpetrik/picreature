import path from "node:path";
import type { PortraitPreset } from "@/lib/server/portrait-types";

const referenceDir = path.join(process.cwd(), "references");

export const portraitPreset: PortraitPreset = {
  id: "brand-portrait-v1",
  title: "Brand Portrait V1",
  preferredModel: {
    apiName: "gemini-3-pro-image-preview",
    label: "Nano Banana Pro",
    summary:
      "Highest-fidelity image model for professional asset production. More likely to need paid billing and may have tighter limits.",
  },
  fallbackModels: [
    {
      apiName: "gemini-3.1-flash-image-preview",
      label: "Nano Banana 2",
      summary:
        "Faster preview image model for higher throughput. Good fallback when Pro is unavailable.",
    },
    {
      apiName: "gemini-2.5-flash-image",
      label: "Nano Banana",
      summary:
        "Most conservative fallback for broad availability and lower cost, with lower instruction fidelity than Pro.",
    },
  ],
  defaultPromptTemplate:
    "A hyper-realistic, high-fidelity professional headshot of the white {{subject_gender}} subject ({{subject_age}}) from the attached reference, strictly maintaining exact facial likeness and identity. The subject is framed in a classic head-and-shoulders portrait against a solid, matte dark charcoal seamless studio background. He is wearing a sharp, dark navy blazer over a simple black t-shirt or turtleneck, projecting a modern clean aesthetic. The lighting is a professional high-contrast studio setup, utilizing a large softbox key light at a 45-degree angle to sculpt the facial features with controlled shadows (Rembrandt style), completely void of natural daylight. A subtle cool-toned rim light separates the subject from the dark background. Shot on a Phase One XF IQ4 with an 85mm f/1.4 portrait lens, capturing razor-sharp focus on the eyes, realistic skin texture, and the fine weave of the fabric in 8k resolution.",
  aspectRatio: "4:5",
  candidateCount: 4,
  identityPolicy:
    "Preserve face identity, age impression, expression realism, and recognizable features.",
  lighting:
    "Shape the portrait with soft directional studio light, polished skin tone balance, and restrained contrast.",
  outputDescription:
    "Deliver a premium head-and-shoulders web portrait with stable crop and non-distracting composition.",
  wardrobeRules:
    "Normalize clothing toward understated professional wardrobe without costume-like transformation.",
  palette: ["ivory", "sand", "warm clay", "deep teal accents"],
  background: {
    label: "Warm ivory to clay editorial gradient",
    prompt:
      "Place the subject against a refined warm ivory to muted clay brand background with subtle depth and no distracting scene details.",
  },
  referenceImagePaths: [
    path.join(referenceDir, "style-reference-1.jpg"),
    path.join(referenceDir, "style-reference-2.jpg"),
    path.join(referenceDir, "style-reference-3.jpg"),
  ],
  styleNotes: [
    "Keep the output photographic, not painterly or illustrated.",
    "Avoid heavy beauty retouch, plastic skin, surreal symmetry, and stock-photo smiles.",
    "Do not alter ethnicity, gender expression, or core facial anatomy.",
    "Unify color grading so portraits sit naturally beside each other on the same team page.",
  ],
};
