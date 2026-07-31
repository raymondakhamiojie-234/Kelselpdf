// ai.js - NVIDIA NIM Cloud Client
async function generateNvidiaCompletion(prompt, systemInstruction) {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey || apiKey === 'PASTE_API_KEY_HERE') {
        throw new Error("NVIDIA_API_KEY is not configured.");
    }

    const messages = [];
    if (systemInstruction) {
        messages.push({ role: "system", content: systemInstruction });
    }
    messages.push({ role: "user", content: prompt });

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            model: "google/diffusiongemma-26b-a4b-it",
            messages: messages,
            max_tokens: 2048,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("NVIDIA API Error:", response.status, errorText);
        throw new Error(`NVIDIA API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

const withTimeout = (promise, ms, timeoutError = new Error('Promise timed out')) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(timeoutError), ms))
    ]);
};

module.exports = { generateNvidiaCompletion, withTimeout };
