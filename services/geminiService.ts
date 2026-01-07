import { GoogleGenAI, Modality } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";

/**
 * Service for interacting with Google Gemini API.
 * 
 * Guidelines used:
 * - Use 'gemini-3-pro-preview' for complex clinical reasoning.
 * - Use 'gemini-2.5-flash-native-audio-preview-12-2025' for audio modality tasks.
 * - Initialize new GoogleGenAI({ apiKey: process.env.API_KEY }) directly.
 */

const AUDIO_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const PRO_MODEL = 'gemini-3-pro-preview';

export const connectLiveConsultation = (callbacks: any) => {
  // Create instance right before connection
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return ai.live.connect({
    model: AUDIO_MODEL,
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
      },
      systemInstruction: 'You are an expert Kentian Homeopathic Consultant. Listen to the case taking process and assist the doctor by suggesting rubrics and identifying key symptoms using the LSMC framework.',
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    if (audioBlob.size === 0) throw new Error("Audio recording is empty.");

    // Direct initialization to ensure process.env.API_KEY is properly accessed
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const base64Audio = await blobToBase64(audioBlob);
    
    // Normalize and clean MIME type for API compatibility
    let mimeType = audioBlob.type || 'audio/webm';
    if (mimeType.includes(';')) mimeType = mimeType.split(';')[0];
    
    const supportedMimes = ['audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/mp4'];
    if (!supportedMimes.includes(mimeType)) {
      mimeType = mimeType.includes('m4a') ? 'audio/mp4' : 'audio/webm';
    }

    const response = await ai.models.generateContent({
      model: AUDIO_MODEL, 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: "Transcribe this homeopathic clinical recording accurately. Extract patient symptoms in their original phrasing (supporting Urdu/Hindi/English) and organize them for a medical case record."
          }
        ]
      }
    });

    // Use .text property as per guidelines (not a function)
    const text = response.text;
    if (!text) throw new Error("AI returned an empty response. The audio might be unclear.");
    
    return text.trim();
  } catch (error: any) {
    console.error("Transcription detailed error:", error);
    throw new Error(error.message || "The transcription service failed to process the audio.");
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
          text: `You are a Kentian Homeopath. Analyze this clinical data and produce a professional case summary. 
          Use headers: 
          1. MIND & DISPOSITION
          2. PHYSICAL GENERALS (Appetite, Thirst, Sleep, Thermals)
          3. PARTICULARS (Head to Toe - LSMC format)
          
          Data:
          ${joinedText}`
        }]
      }
    });
    return response.text || "Case generation failed.";
  } catch (error: any) {
    console.error("Case Analysis Error:", error);
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
          text: `Identify the most relevant rubrics from Kent's Repertory based on this clinical data. 
          Format: CHAPTER - RUBRIC: sub-rubric (Degree)
          
          Data:
          ${joinedText}`
        }]
      }
    });
    return response.text || "Rubric extraction failed.";
  } catch (error: any) {
    console.error("Rubric Extraction Error:", error);
    throw new Error(error.message || "Failed to extract rubrics.");
  }
};

export const chatWithTranscript = async (context: string, question: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [{
          text: `Context:\n${context}\n\nQuestion: ${question}\n\nAs a homeopathic clinical advisor, answer the question above.`
        }]
      }
    });
    return response.text || "No response generated.";
  } catch (error: any) {
    console.error("Chat Error:", error);
    throw new Error(error.message || "Consultation chat failed.");
  }
};
