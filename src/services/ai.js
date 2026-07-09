const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'AIza-placeholder') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

async function getBestGeminiModel() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        
        if (data.models && Array.isArray(data.models)) {
            const models = data.models;
            const flashModel = models.find(m => m.name.includes('gemini-1.5-flash') && m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'));
            if (flashModel) return flashModel.name.replace('models/', '');
            
            const proModel = models.find(m => m.name.includes('gemini-pro') && m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'));
            if (proModel) return proModel.name.replace('models/', '');
        }
    } catch (error) {
        console.error("Failed to dynamically fetch Gemini models, falling back to default.", error);
    }
    return "gemini-1.5-flash"; 
}

module.exports = { genAI, getBestGeminiModel };
