const pdf = require('pdf-parse');
const { jsonrepair } = require('jsonrepair');
const { generateNvidiaCompletion } = require('./ai');

// Extract text from PDF buffer
async function extractTextFromPDF(buffer) {
    try {
        const data = await pdf(buffer);
        return data.text;
    } catch (err) {
        console.error("PDF Parsing error:", err);
        throw new Error("Failed to parse PDF file.");
    }
}

// Extract questions from raw text using Nvidia NIM
async function extractQuestionsFromText(rawText) {
    const systemInstruction = `You are an expert examination parser. Your task is to extract multiple-choice questions from the user's text and output them STRICTLY in a JSON array format.

RULES:
1. Identify each question, its options (A, B, C, D, E), and the correct answer if present.
2. Output a valid JSON array of objects.
3. Use this exact JSON structure for each object:
{
  "question_text": "The actual question text...",
  "option_a": "First option text...",
  "option_b": "Second option text...",
  "option_c": "Third option text...",
  "option_d": "Fourth option text...",
  "option_e": "Fifth option text, or null if only 4 options",
  "correct_answer": "A, B, C, D, or E (or null if not found)",
  "explanation": "Any provided explanation, or null",
  "topic": "Infer a 1-3 word topic based on the question context",
  "difficulty": "EASY, MEDIUM, or HARD based on context"
}
4. DO NOT wrap the output in markdown code blocks like \`\`\`json. Return ONLY the raw JSON string. DO NOT ADD ANY OTHER TEXT.`;

    try {
        let textResponse = await generateNvidiaCompletion(rawText, systemInstruction);
        
        // Clean up possible markdown wrappers
        textResponse = textResponse.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
        
        // Repair JSON if necessary
        const repairedJson = jsonrepair(textResponse);
        const questions = JSON.parse(repairedJson);
        
        if (!Array.isArray(questions)) {
             throw new Error("AI did not return an array.");
        }
        
        return questions;
    } catch (err) {
        console.error("NVIDIA Extraction Error:", err);
        throw new Error("Failed to extract questions using AI: " + err.message);
    }
}

module.exports = { extractTextFromPDF, extractQuestionsFromText };
