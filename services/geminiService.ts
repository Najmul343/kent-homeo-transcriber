
import { GoogleGenAI, Modality } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";

/**
 * Service for interacting with Google Gemini API.
 * Accepts an explicit apiKey to support manual user configuration.
 */

const FLASH_MODEL = 'gemini-3-flash-preview';
const PRO_MODEL = 'gemini-3-pro-preview';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

export const connectLiveConsultation = (apiKey: string, callbacks: any) => {
  const ai = new GoogleGenAI({ apiKey });
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

export const transcribeAudio = async (apiKey: string, audioBlob: Blob): Promise<string> => {
  try {
    if (!apiKey) {
      throw new Error("No API key provided. Please check your settings.");
    }
    
    if (audioBlob.size === 0) {
      throw new Error("The recorded audio file is empty.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const base64Audio = await blobToBase64(audioBlob);
    
    let mimeType = audioBlob.type || 'audio/webm';
    if (mimeType.includes(';')) mimeType = mimeType.split(';')[0];
    
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
    if (!text) throw new Error("Speech detection failed. Try speaking louder or checking your microphone.");
    
    return text.trim();
  } catch (error: any) {
    console.error("Transcription detailed error:", error);
    throw new Error(error.message || "Transcription service failed.");
  }
};

export const generateKentianCase = async (apiKey: string, segments: string[]): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey });
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
    throw new Error(error.message || "Analysis failed.");
  }
};

export const extractKentRubrics = async (apiKey: string, segments: string[]): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey });
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
    throw new Error(error.message || "Extraction failed.");
  }
};
