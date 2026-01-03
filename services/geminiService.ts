import { GoogleGenerativeAI } from "@google/generative-ai";

export async function summarizeText(transcript: string): Promise<string> {
  if (!transcript?.trim()) {
    throw new Error("No transcript provided for summarization.");
  }

  // Safely get env key (undefined is okay here)
  const envApiKey = typeof import.meta.env?.VITE_GEMINI_API_KEY === 'string' 
    ? import.meta.env.VITE_GEMINI_API_KEY.trim() 
    : "";

  const userApiKey = typeof localStorage !== 'undefined' 
    ? (localStorage.getItem("geminiApiKey")?.trim() || "") 
    : "";

  const apiKey = envApiKey || userApiKey;

  if (!apiKey) {
    throw new Error("No Gemini API key available. Please enter one in the app or configure it in your hosting environment.");
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an expert homeopathic doctor. Analyze the patient consultation transcript below.

Provide a structured summary with:
- Main complaints and symptoms
- Modalities (better/worse)
- Mental/emotional state
- Key rubrics
- Top 3 possible remedy suggestions with brief reasoning

Transcript:
${transcript}

Use clear bullet points.
    `.trim();

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return text.trim() || "No summary generated.";
  } catch (error: any) {
    console.error("Gemini error:", error);
    throw new Error(`Summarization failed: ${error.message || "Unknown error"}`);
  }
}

export function saveUserGeminiKey(key: string) {
  if (typeof localStorage !== 'undefined' && key?.trim()) {
    localStorage.setItem("geminiApiKey", key.trim());
  }
}

export function hasApiKey(): boolean {
  const envKey = typeof import.meta.env?.VITE_GEMINI_API_KEY === 'string' 
    ? import.meta.env.VITE_GEMINI_API_KEY.trim() 
    : "";
  const userKey = typeof localStorage !== 'undefined' 
    ? (localStorage.getItem("geminiApiKey")?.trim() || "") 
    : "";
  return !!(envKey || userKey);
}
