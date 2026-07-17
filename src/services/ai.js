const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'AIza-placeholder') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

async function getBestGeminiModel() {
    // Hardcoding gemini-1.5-flash because it has a generous free tier (15 RPM)
    // Dynamic fetching fails if flash is on page 2 of the API, falling back to 
    // gemini-pro which has a strict 2 RPM limit and causes 429 Too Many Requests.
    return "gemini-1.5-flash"; 
}

module.exports = { genAI, getBestGeminiModel };
