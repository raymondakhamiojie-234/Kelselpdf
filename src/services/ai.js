const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'AIza-placeholder') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

async function getBestGeminiModel() {
    try {
        let models = [];
        let nextPageToken = "";
        do {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}&pageSize=100${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
            const response = await fetch(url);
            if (!response.ok) {
                console.error("Failed to fetch models, status:", response.status);
                break;
            }
            const data = await response.json();
            if (data.models) models = models.concat(data.models);
            nextPageToken = data.nextPageToken;
        } while (nextPageToken);

        if (models.length > 0) {
            // Try 1.5 flash
            const flashModel = models.find(m => m.name.includes('gemini-1.5-flash') && m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'));
            if (flashModel) return flashModel.name.replace('models/', '');
            
            // Try 1.5 pro
            const pro15Model = models.find(m => m.name.includes('gemini-1.5-pro') && m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'));
            if (pro15Model) return pro15Model.name.replace('models/', '');

            // Try 1.0 pro
            const proModel = models.find(m => m.name.includes('gemini-pro') && m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'));
            if (proModel) return proModel.name.replace('models/', '');
            
            // Fallback to literally ANY model that supports generateContent
            const anyModel = models.find(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'));
            if (anyModel) return anyModel.name.replace('models/', '');
        }
    } catch (error) {
        console.error("Failed to dynamically fetch Gemini models", error);
    }
    return "gemini-1.5-flash"; 
}

module.exports = { genAI, getBestGeminiModel };
