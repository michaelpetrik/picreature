import { Studio } from "@/components/studio";
import { portraitPreset } from "@/lib/config/portrait-preset";
import { ALLOWED_IMAGE_TYPES } from "@/lib/server/portrait-constants";

export default function HomePage() {
  const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());

  return (
    <Studio
      preset={portraitPreset}
      hasGeminiApiKey={hasGeminiApiKey}
      envFileHint=".env.local"
      acceptedImageTypes={Array.from(ALLOWED_IMAGE_TYPES).join(",")}
    />
  );
}
