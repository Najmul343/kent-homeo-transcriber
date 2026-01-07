import { GoogleGenAI, Modality } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";

// Model constants
const CASE_MODEL = 'gemini-3-pro-preview';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const TRANSCRIPTION_MODEL = 'gemini-3-flash-preview';

/**
 * Creates a fresh AI instance using the globally provided API_KEY.
 * Per instructions, we assume process.env.API_KEY is pre-configured by the environment.
 */
const getAi = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY as string });
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
      systemInstruction: 'You are an expert Homeopathic Consultant specializing in Kent\'s Method. Listen to the doctor/patient and assist in real-time.',
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    if (audioBlob.size === 0) {
      throw new Error("Recording is empty.");
    }

    const ai = getAi();
    const base64Audio = await blobToBase64(audioBlob);
    
    // Clean and normalize MIME type
    let mimeType = audioBlob.type || 'audio/webm';
    if (mimeType.includes(';')) {
      mimeType = mimeType.split(';')[0];
    }
    
    // Map common mobile/browser types to Gemini supported ones
    const supportedMimes = ['audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/mp4'];
    if (!supportedMimes.includes(mimeType)) {
      // If the mime type is something like audio/x-m4a, treat it as audio/mp4 for the API
      if (mimeType.includes('m4a')) {
        mimeType = 'audio/mp4';
      } else {
        // Fallback to webm as it is the most common for MediaRecorder
        mimeType = 'audio/webm';
      }
    }

    // Using the exact structure from documentation: contents: { parts: [...] }
    const response = await ai.models.generateContent({
      model: TRANSCRIPTION_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: "Please transcribe this homeopathic medical recording accurately. Maintain the original language (Urdu, Hindi, or Hinglish) for the patient's actual symptoms, but provide headers in English. Format the output as a clinical transcript."
          }
        ]
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No transcription text was generated. The audio might be too quiet or distorted.");
    }
    return text.trim();
  } catch (error: any) {
    console.error("Transcription API Detailed Error:", error);
    // Extract a more meaningful message if available from the SDK error
    const msg = error.message || "The AI service failed to process the audio.";
    throw new Error(msg);
  }
};

export const generateKentianCase = async (segments: string[]): Promise<string> => {
  try {
    const ai = getAi();
    const joinedText = segments.join("\n\n");
    const response = await ai.models.generateContent({
      model: CASE_MODEL,
      contents: {
        parts: [{
          text: `You are a Kentian Homeopath. Structure this patient data into a professional Case Summary with headers for MIND, PHYSICAL GENERALS, and PARTICULARS (LSMC format):\n\n${joinedText}`
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
    const ai = getAi();
    const joinedText = segments.join("\n\n");
    const response = await ai.models.generateContent({
      model: CASE_MODEL,
      contents: {
        parts: [{
          text: `Identify the primary Homeopathic Rubrics from Kent's Repertory based on these symptoms. Use the format CHAPTER - RUBRIC: sub-rubric:\n\n${joinedText}`
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
    const ai = getAi();
    const response = await ai.models.generateContent({
      model: TRANSCRIPTION_MODEL,
      contents: {
        parts: [{
          text: `Based on this homeopathic transcript:\n${context}\n\nAnswer this clinical question: ${question}`
        }]
      }
    });
    return response.text || "Could not generate an answer.";
  } catch (error: any) {
    console.error("Chat Consultation Error:", error);
    throw new Error(error.message || "Consultation failed.");
  }
};
