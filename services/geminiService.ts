import { GoogleGenerativeAI } from "@google/generative-ai";

export async function summarizeText(transcript: string): Promise<string> {
  if (!transcript?.trim()) {
    throw new Error("No transcript to summarize.");
  }

  // TRY env var first (Vercel/Netlify), then user input, then fail gracefully
  let apiKey = "";
  
  // 1. Check environment variable (Vercel/Netlify injected)
  try {
    apiKey = (import.meta.env.VITE_GEMINI_API_KEY || "").trim();
  } catch {}

  // 2. Fallback: User-entered key from localStorage
  if (!apiKey) {
    try {
      apiKey = (localStorage.getItem("geminiApiKey") || "").trim();
    } catch {}
  }

  if (!apiKey) {
    throw new Error("Enter your Gemini API key first (get free from aistudio.google.com)");
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Expert homeopath: Summarize this consultation in bullet points:

Symptoms: 
Modalities: 
Mental state: 
Top 3 remedies:

Transcript: ${transcript}`;

    const result = await model.generateContent(prompt);
    return (await result.response.text()).trim() || "No summary generated.";
  } catch (error: any) {
    console.error("Gemini error:", error);
    throw new Error(error.message?.includes("API key") 
      ? "Invalid API key. Get new one from aistudio.google.com" 
      : `Summarization failed: ${error.message}`);
  }
}

export function saveUserGeminiKey(key: string) {
  if (key?.trim()) localStorage.setItem("geminiApiKey", key.trim());
}

export function hasApiKey(): boolean {
  try {
    return !!(import.meta.env.VITE_GEMINI_API_KEY?.trim() || localStorage.getItem("geminiApiKey")?.trim());
  } catch {
    return false;
  }
}
