import { Studio } from "@/components/studio";
import { portraitPreset } from "@/lib/config/portrait-preset";

export default function HomePage() {
  const hasGeminiApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());

  return (
    <Studio
      preset={portraitPreset}
      hasGeminiApiKey={hasGeminiApiKey}
      envFileHint=".env.local"
    />
  );
}
