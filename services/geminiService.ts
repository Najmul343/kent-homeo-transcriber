
import { GoogleGenAI, Modality } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";

const MODEL_NAME = 'gemini-3-pro-preview';

/**
 * Helper to get an AI instance safely.
 */
const getAi = () => {
  try {
    // In some environments, process.env.API_KEY is replaced during build.
    // We access it cautiously to avoid ReferenceErrors.
    const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : (window as any).process?.env?.API_KEY;
    
    if (!apiKey) {
      console.error("Gemini API Key is missing from environment variables.");
      throw new Error("API_KEY_MISSING");
    }
    return new GoogleGenAI({ apiKey });
  } catch (e) {
    console.error("Error initializing GoogleGenAI:", e);
    throw e;
  }
};

export const connectLiveConsultation = (callbacks: any) => {
  const ai = getAi();
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
      },
      systemInstruction: `
        You are an expert Homeopathic Consultant specializing in Kent's Method.
        Listen to the doctor/patient and assist in real-time.
        - If the doctor asks for potential rubrics, suggest them using standard repertory language.
        - If the doctor is taking a case, help clarify symptoms (Location, Sensation, Modality, Concomitant).
        - Keep responses concise and medical.
        - Use professional English for all medical analysis.
      `,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    const ai = getAi();
    const base64Audio = await blobToBase64(audioBlob);
    
    // Clean MIME type: Gemini prefers 'audio/webm' over 'audio/webm;codecs=opus'
    let mimeType = audioBlob.type || 'audio/webm';
    if (mimeType.includes(';')) {
      mimeType = mimeType.split(';')[0];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: `Transcribe this homeopathic consultation narrative. Use Hinglish/Urdu/Hindi for patient symptoms but English for medical terms.`
          }
        ]
      }]
    });

    return response.text?.trim() || "No transcription available.";
  } catch (error: any) {
    console.error("Transcription API Error:", error);
    throw error;
  }
};

export const generateKentianCase = async (segments: string[]): Promise<string> => {
  try {
    const ai = getAi();
    const joinedText = segments.join("\n\n");
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{
        role: 'user',
        parts: [{
          text: `Analyze this narrative and structure it into a Kentian Case (MIND, PHYSICAL GENERALS, PARTICULARS - LSMC). Use STRICT MEDICAL ENGLISH.\n\n${joinedText}`
        }]
      }]
    });
    return response.text?.trim() || "Could not generate case analysis.";
  } catch (error: any) {
    console.error("Case Generation Error:", error);
    throw error;
  }
};

export const extractKentRubrics = async (segments: string[]): Promise<string> => {
  try {
    const ai = getAi();
    const joinedText = segments.join("\n\n");
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{
        role: 'user',
        parts: [{
          text: `Identify Rubrics for Kent's Repertory from this data. Format: CHAPTER - RUBRIC: sub-rubric. Use English ONLY.\n\n${joinedText}`
        }]
      }]
    });
    return response.text?.trim() || "No rubrics identified.";
  } catch (error: any) {
    console.error("Rubric Extraction Error:", error);
    throw error;
  }
};

export const chatWithTranscript = async (context: string, question: string): Promise<string> => {
  try {
    const ai = getAi();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{
        role: 'user',
        parts: [{
          text: `Expert Homeopathic Consultant context: "${context}". Question: "${question}". Answer in English.`
        }]
      }]
    });
    return response.text || "I could not generate an answer.";
  } catch (error: any) {
    console.error("Chat Error:", error);
    throw error;
  }
};
