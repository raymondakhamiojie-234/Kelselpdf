const { genAI, getBestGeminiModel } = require('../services/ai');

exports.getAiExamView = (req, res) => {
    res.render('acct/ai_exam', { course: req.params.course });
};

exports.generateExam = async (req, res) => {
    try {
        const course = req.query.course || 'General Knowledge';
        let count = parseInt(req.query.count) || 4;
        if (count > 20) count = 20;

        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'AIza-placeholder') {
            const mock_exam = {
                mcqs: [
                    { question: `What is the foundational principle of ${course}?`, options: ["A. Data Processing", "B. Theoretical Analysis", "C. Core Fundamentals", "D. Practical Application"], answer_index: 2 },
                    { question: `Which of the following is most commonly associated with ${course}?`, options: ["A. Historical Context", "B. Advanced Methodologies", "C. Basic Syntax", "D. All of the above"], answer_index: 3 },
                    { question: `In the context of ${course}, what is the most important factor?`, options: ["A. Accuracy", "B. Speed", "C. Creativity", "D. Documentation"], answer_index: 0 },
                    { question: `How does ${course} impact modern applications?`, options: ["A. It doesn't", "B. It provides structural integrity", "C. It is purely theoretical", "D. It replaces older systems"], answer_index: 1 }
                ],
                theory: `Explain the core fundamentals and methodologies of ${course} and how they apply to real-world scenarios.`
            };
            return res.json(mock_exam);
        }

        const prompt = `Generate exactly ${count} multiple-choice questions and 1 open-ended theory question for a university-level course named '${course}'. 
Return ONLY a raw JSON object with this exact structure:
{
  "mcqs": [
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "answer_index": 0 }
  ],
  "theory": "..."
}`;

        const modelName = await getBestGeminiModel();
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: "application/json" },
            systemInstruction: "You are a university professor creating an exam. Output strict JSON."
        });

        const completion = await model.generateContent(prompt);
        const result = JSON.parse(completion.response.text());
        res.json(result);
    } catch (err) {
        console.error("AI Generation Error:", err);
        res.json({ error: 'Failed to generate exam from AI provider: ' + (err.message || 'Unknown error') });
    }
};

exports.gradeTheory = async (req, res) => {
    try {
        const question = req.body.question || '';
        const answer = req.body.answer || '';

        if (!question || !answer) {
            return res.json({ error: 'Missing data' });
        }

        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'AIza-placeholder') {
            return res.json({
                score: 7,
                percentage: 70,
                feedback: `This is a mock grade because no API key is configured. You provided a solid answer to "${question}". Keep up the good work!`
            });
        }

        const prompt = `You are a strict university professor grading an exam.
Question: ${question}
Student's Answer: ${answer}

Grade the answer on a scale of 0 to 10.
Return ONLY a raw JSON object with this exact structure:
{
  "score": 8,
  "percentage": 80,
  "feedback": "Detailed explanation of why they got this score..."
}`;

        const modelName = await getBestGeminiModel();
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: "application/json" },
            systemInstruction: "You are a university professor grading exams. Output strict JSON."
        });

        const completion = await model.generateContent(prompt);
        const result = JSON.parse(completion.response.text());
        res.json(result);
    } catch (err) {
        console.error("AI Grading Error:", err);
        res.json({ error: 'Failed to grade answer from AI provider: ' + (err.message || 'Unknown error') });
    }
};

exports.getPdfViewer = (req, res) => {
    const pdf_url = req.query.url;
    if (!pdf_url) {
        return res.status(400).send("No PDF URL provided.");
    }
    res.render('acct/pdf_viewer', { pdf_url });
};

exports.chatPdf = async (req, res) => {
    try {
        const action = req.body.action;
        const apiKey = process.env.CHATPDF_API_KEY || 'sec_placeholder';

        if (action === 'upload') {
            const pdf_url = req.body.pdf_url;
            const absolute_url = pdf_url.startsWith('http') ? pdf_url : `http://${req.headers.host}/${pdf_url}`;

            if (apiKey === 'sec_placeholder') {
                return res.json({ sourceId: 'mock_source_id_12345' });
            }

            const response = await fetch('https://api.chatpdf.com/v1/sources/add-url', {
                method: 'POST',
                headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: absolute_url })
            });
            const data = await response.json();
            res.json(data);
        } else if (action === 'chat') {
            const sourceId = req.body.sourceId;
            const message = req.body.message;

            if (apiKey === 'sec_placeholder') {
                return res.json({ content: "I am a mock AI response since the ChatPDF API key isn't configured yet. I read the PDF and it's fascinating!" });
            }

            const response = await fetch('https://api.chatpdf.com/v1/chats/message', {
                method: 'POST',
                headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceId: sourceId,
                    messages: [{ role: 'user', content: message }]
                })
            });
            const data = await response.json();
            res.json(data);
        } else {
            res.json({ error: 'Invalid action' });
        }
    } catch (err) {
        console.error(err);
        res.json({ error: 'Server error communicating with PDF AI.' });
    }
};
