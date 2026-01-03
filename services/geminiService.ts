
import { GoogleGenAI } from "@google/genai";
import { blobToBase64 } from "../utils/audioUtils";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = 'gemini-3-pro-preview';

/**
 * Transcribes audio into Hinglish/Hindi with English medical terms.
 */
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    const base64Audio = await blobToBase64(audioBlob);
    const mimeType = audioBlob.type || 'audio/webm';

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: `
            You are a medical scribe for a Homeopathic Doctor. 
            Listen to the patient/doctor interaction and transcribe with these rules:
            1. **Language**: Transcribe in Hinglish (Romanized Hindi/Urdu) or Hindi script.
            2. **English Medical Terms**: Always use standard English for medical terms or specific anatomical descriptions.
            3. **Clarity**: Ensure the patient's narrative regarding their pain, feelings, and modalities is captured accurately.
            Return ONLY the transcript.
            `
          }
        ]
      }
    });

    return response.text?.trim() || "No transcription available.";
  } catch (error) {
    console.error("Transcription Error:", error);
    throw error;
  }
};

/**
 * Generates a Kentian Case Analysis in STRICT ENGLISH.
 */
export const generateKentianCase = async (segments: string[]): Promise<string> => {
  try {
    const joinedText = segments.join("\n\n");
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            text: `
            Analyze the following patient narrative and structure it into a formal Homeopathic Case using the Kentian Method.
            
            IMPORTANT: ALL OUTPUT MUST BE IN PROFESSIONAL MEDICAL ENGLISH.
            
            Structure:
            1. **MIND**: Mental and emotional state, fears, temperament, and dispositional symptoms.
            2. **PHYSICAL GENERALS**: Thermal state (chilly/hot), cravings/aversions, sleep patterns, appetite, and general modalities (weather, time, etc.).
            3. **PARTICULARS**: Specific organ or systemic symptoms. Use the LSMC format (Location, Sensation, Modality, Concomitants).
            
            Input Data (Transcript/Notes):
            ${joinedText}
            `
          }
        ]
      }
    });

    return response.text?.trim() || "Could not generate case analysis.";
  } catch (error) {
    console.error("Case Generation Error:", error);
    throw error;
  }
};

/**
 * Extracts Rubrics in standard Repertory English.
 */
export const extractKentRubrics = async (segments: string[]): Promise<string> => {
  try {
    const joinedText = segments.join("\n\n");
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            text: `
            Identify potential Rubrics from this narrative for Kent's Repertory of Homeopathic Materia Medica.
            
            IMPORTANT: OUTPUT MUST BE IN ENGLISH ONLY. Use standard repertory terminology.
            
            Format: [Chapter] - [Main Rubric]: [Sub-rubric], [Sub-sub-rubric]
            Example: 
            STOMACH - DESIRES: sweets.
            MIND - FEAR: dark, of the.
            
            Narrative Data:
            ${joinedText}
            `
          }
        ]
      }
    });

    return response.text?.trim() || "No rubrics identified.";
  } catch (error) {
    console.error("Rubric Extraction Error:", error);
    throw error;
  }
};

/**
 * Professional AI Consultant answering in English.
 */
export const chatWithTranscript = async (context: string, question: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: `
            You are an expert Homeopathic Consultant. 
            Context: "${context}"
            
            Doctor's Inquiry: "${question}"
            
            Rules:
            - Respond strictly in English.
            - Be concise and professional.
            - Reference Kent's philosophy or repertory where relevant.
            `
          }
        ]
      }
    });
    
    return response.text || "I could not generate an answer.";
  } catch (error) {
    console.error("Chat Error:", error);
    throw error;
  }
};
