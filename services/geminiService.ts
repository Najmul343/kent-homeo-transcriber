import { GoogleGenerativeAI } from "@google/generative-ai";

// Function to summarize the transcribed text using Gemini
export async function summarizeText(transcript: string): Promise<string> {
  // Prioritize the API key from Vite environment variable (set in Vercel)
  const envApiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();

  // Optional fallback: Allow user to provide their own key via localStorage
  // (Keeps the original behavior if you have a key input field)
  const userApiKey = localStorage.getItem("geminiApiKey")?.trim() || "";

  const apiKey = envApiKey || userApiKey;

  if (!apiKey) {
    throw new Error(
      "No Gemini API key provided. Please set VITE_GEMINI_API_KEY in your hosting platform or enter one in the app settings."
    );
  }

  // Initialize the Gemini client
  const genAI = new GoogleGenerativeAI(apiKey);

  // Use the gemini-1.5-flash model (fast and cost-effective; change to gemini-1.5-pro if needed)
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // Craft a prompt suitable for homeopathic repertorization or general summary
  // You can customize this prompt based on your app's needs
  const prompt = `
You are an expert homeopathic practitioner. Summarize the following patient consultation transcript in a structured repertory format.
Highlight key symptoms, modalities, mental/emotional states, and suggest possible rubrics or remedies if relevant.

Transcript:
${transcript}

Provide a concise, structured summary.
  `.trim();

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return text || "No summary generated.";
  } catch (error: any) {
    console.error("Gemini summarization error:", error);
    throw new Error(
      `Failed to summarize: ${error.message || "Unknown error"}`
    );
  }
}

// Optional: Helper to save user-provided key (if you keep a key input field)
export function saveUserGeminiKey(key: string) {
  localStorage.setItem("geminiApiKey", key.trim());
}

// Optional: Get current effective key (for display or debugging)
export function getCurrentApiKey(): string {
  const envApiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  const userApiKey = localStorage.getItem("geminiApiKey")?.trim() || "";
  return envApiKey || userApiKey || "";
}
