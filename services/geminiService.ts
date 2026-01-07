
import { GoogleGenAI, Modality } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";

// Model constants based on task type
const CASE_MODEL = 'gemini-3-pro-preview';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const TRANSCRIPTION_MODEL = 'gemini-3-flash-preview';

/**
 * Helper to get an AI instance safely.
 */
const getAi = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("Missing API_KEY. Please check your environment.");
  }
  return new GoogleGenAI({ apiKey });
};

export const connectLiveConsultation = (callbacks: any) => {
  const ai = getAi();
  return ai.live.connect({
    model: LIVE_MODEL,
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
      },
      systemInstruction: `
        You are an expert Homeopathic Consultant specializing in Kent's Method.
        Listen to the doctor/patient and assist in real-time.
        - Suggest potential rubrics using standard repertory language.
        - Help clarify symptoms using the LSMC (Location, Sensation, Modality, Concomitant) framework.
        - Use professional medical English.
      `,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    if (audioBlob.size === 0) {
      throw new Error("Audio data is empty. Please try recording again.");
    }

    const ai = getAi();
    const base64Audio = await blobToBase64(audioBlob);
    
    // Normalize MIME type for Gemini
    let mimeType = audioBlob.type || 'audio/webm';
    if (mimeType.includes(';')) {
      mimeType = mimeType.split(';')[0];
    }
    
    // Explicit mapping for common browser formats
    if (mimeType === 'audio/x-m4a' || mimeType === 'audio/m4a') mimeType = 'audio/mp4';
    if (mimeType === 'audio/ogg') mimeType = 'audio/webm'; // Webm is safer for Gemini than ogg in some envs

    const response = await ai.models.generateContent({
      model: TRANSCRIPTION_MODEL,
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: `Please transcribe this homeopathic medical recording accurately. 
            Patient symptoms should be kept in their original language (Urdu, Hindi, or English), 
            but organize clinical observations using medical terminology. 
            Format the output as a clean narrative transcript.`
          }
        ]
      }]
    });

    const text = response.text;
    if (!text) {
      throw new Error("The AI returned an empty transcription. This can happen if the audio is unclear or too short.");
    }
    return text.trim();
  } catch (error: any) {
    console.error("Transcription API Error:", error);
    // Return a more descriptive error message
    const message = error.message || "Unknown API Error";
    throw new Error(message);
  }
};

export const generateKentianCase = async (segments: string[]): Promise<string> => {
  try {
    const ai = getAi();
    const joinedText = segments.join("\n\n");
    const response = await ai.models.generateContent({
      model: CASE_MODEL,
      contents: [{
        parts: [{
          text: `Structure this homeopathic data into a professional Kentian Case. 
          Use the following headers: 
          1. MIND & DISPOSITION
          2. PHYSICAL GENERALS (Appetite, Thirst, Sleep, Thermals)
          3. PARTICULARS (Head to Toe - LSMC format)
          
          Clinical Data:
          ${joinedText}`
        }]
      }]
    });
    return response.text?.trim() || "Case analysis generation failed.";
  } catch (error: any) {
    console.error("Case Analysis Error:", error);
    throw error;
  }
};

export const extractKentRubrics = async (segments: string[]): Promise<string> => {
  try {
    const ai = getAi();
    const joinedText = segments.join("\n\n");
    const response = await ai.models.generateContent({
      model: CASE_MODEL,
      contents: [{
        parts: [{
          text: `Convert the following symptoms into standard Kent's Repertory Rubrics. 
          Format: CHAPTER - RUBRIC: sub-rubric (degree).
          
          Symptom Data:
          ${joinedText}`
        }]
      }]
    });
    return response.text?.trim() || "Rubric extraction failed.";
  } catch (error: any) {
    console.error("Rubric Extraction Error:", error);
    throw error;
  }
};

export const chatWithTranscript = async (context: string, question: string): Promise<string> => {
  try {
    const ai = getAi();
    const response = await ai.models.generateContent({
      model: TRANSCRIPTION_MODEL,
      contents: [{
        parts: [{
          text: `Context: ${context}\n\nQuestion: ${question}\n\nAs a homeopathic consultant, provide a concise medical answer.`
        }]
      }]
    });
    return response.text || "I could not generate an answer.";
  } catch (error: any) {
    console.error("Consultation Chat Error:", error);
    throw error;
  }
};
