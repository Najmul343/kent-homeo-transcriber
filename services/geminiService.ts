
import { GoogleGenAI, Modality } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";

/**
 * Service for interacting with Google Gemini API.
 * 
 * Model Selection:
 * - 'gemini-3-flash-preview' for general multimodal tasks (transcription).
 * - 'gemini-3-pro-preview' for complex clinical reasoning.
 * - 'gemini-2.5-flash-native-audio-preview-12-2025' for real-time live audio.
 */

const FLASH_MODEL = 'gemini-3-flash-preview';
const PRO_MODEL = 'gemini-3-pro-preview';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

export const connectLiveConsultation = (callbacks: any) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return ai.live.connect({
    model: LIVE_MODEL,
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
      },
      systemInstruction: 'You are an expert Kentian Homeopathic Consultant. Assist the doctor in identifying rubrics and case details in real-time.',
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable is not set. Please add it to your environment settings.");
    }
    
    if (audioBlob.size === 0) {
      throw new Error("The recorded audio file is empty.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const base64Audio = await blobToBase64(audioBlob);
    
    let mimeType = audioBlob.type || 'audio/webm';
    if (mimeType.includes(';')) mimeType = mimeType.split(';')[0];
    
    // Fallback for non-standard mobile MIME types
    if (!mimeType.startsWith('audio/')) {
       mimeType = 'audio/webm'; 
    }

    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: "Transcribe this clinical recording accurately. Preserve patient language (Urdu/Hindi/English) for symptoms. Format as a clinical transcript."
          }
        ]
      }
    });

    const text = response.text;
    if (!text) throw new Error("The AI was unable to detect any speech in the audio.");
    
    return text.trim();
  } catch (error: any) {
    console.error("Transcription detailed error:", error);
    throw new Error(error.message || "Transcription service failed.");
  }
};

export const generateKentianCase = async (segments: string[]): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const joinedText = segments.join("\n\n");
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [{
          text: `You are a Kentian Homeopath. Analyze this clinical data and produce a professional case summary with headers: MIND, PHYSICAL GENERALS, and PARTICULARS.\n\nData:\n${joinedText}`
        }]
      }
    });
    return response.text || "Case generation failed.";
  } catch (error: any) {
    throw new Error(error.message || "Failed to generate case analysis.");
  }
};

export const extractKentRubrics = async (segments: string[]): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const joinedText = segments.join("\n\n");
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [{
          text: `Extract Homeopathic Rubrics from Kent's Repertory based on this data. Format: CHAPTER - RUBRIC: sub-rubric.\n\nData:\n${joinedText}`
        }]
      }
    });
    return response.text || "Rubric extraction failed.";
  } catch (error: any) {
    throw new Error(error.message || "Failed to extract rubrics.");
  }
};

export const chatWithTranscript = async (context: string, question: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [{
          text: `Context:\n${context}\n\nQuestion: ${question}`
        }]
      }
    });
    return response.text || "No response generated.";
  } catch (error: any) {
    throw new Error(error.message || "Consultation failed.");
  }
};
