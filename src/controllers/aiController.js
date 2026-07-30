const { generateNvidiaCompletion } = require('../services/ai');
const pool = require('../config/db');
exports.getAiExamView = async (req, res) => {
    let ai_limit_message = null;
    let ai_remaining = null;
    if (req.session.user.subscription_plan === 'Premium') {
        try {
            const today = new Date().toISOString().split('T')[0];
            const [usage] = await pool.query('SELECT exams_generated FROM ai_usage_tracking WHERE user_id = ? AND usage_date = ?', [req.session.user_id, today]);
            const used = usage.length > 0 ? usage[0].exams_generated : 0;
            const remaining = Math.max(0, 3 - used);
            ai_remaining = remaining;
            ai_limit_message = `You are on the Premium Plan. You have ${remaining} out of 3 AI requests remaining today. Upgrade to Full Premium for unlimited AI.`;
        } catch(err) {
            console.error(err);
            // If table doesn't exist yet, default to 3
            ai_remaining = 3;
            ai_limit_message = `You are on the Premium Plan. You have 3 out of 3 AI requests remaining today. Upgrade to Full Premium for unlimited AI.`;
        }
    }

    res.render('acct/ai_exam', { course: req.params.course, ai_limit_message, ai_remaining });
};

const withTimeout = (promise, ms, timeoutError = new Error('Promise timed out')) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(timeoutError), ms))
    ]);
};

exports.generateExam = async (req, res) => {
    try {
        // --- Usage Limit Check ---
        if (req.session.user.subscription_plan === 'Premium') {
            const today = new Date().toISOString().split('T')[0];
            const [usage] = await pool.query('SELECT exams_generated FROM ai_usage_tracking WHERE user_id = ? AND usage_date = ?', [req.session.user_id, today]);
            if (usage.length > 0 && usage[0].exams_generated >= 3) {
                return res.json({ success: false, error: "You have reached the maximum limit of 3 AI requests per day on the Premium plan. Please upgrade to Full Premium for unlimited AI access." });
            }
        }
        // -----------------------

        const course = req.query.course || 'General Knowledge';
        let count = parseInt(req.query.count) || 4;
        if (count > 20) count = 20;

        if (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY === 'PASTE_API_KEY_HERE') {
            const mock_exam = {
                success: true,
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

        const completionText = await withTimeout(
            generateNvidiaCompletion(prompt, "You are a university professor creating an exam. Output strict JSON only. Do not wrap in markdown tags."),
            15000,
            new Error("AI service busy. Please try again.")
        );
        let result = {};
        try {
            // Some models wrap in markdown ```json
            const cleanedText = completionText.replace(/```json\n?|```/g, '').trim();
            result = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error("Failed to parse JSON:", completionText);
            throw new Error("AI returned invalid JSON format.");
        }
        result.success = true;

        // --- Increment Usage ---
        if (req.session.user.subscription_plan === 'Premium') {
            const today = new Date().toISOString().split('T')[0];
            await pool.query(`
                INSERT INTO ai_usage_tracking (user_id, usage_date, exams_generated) 
                VALUES (?, ?, 1) 
                ON DUPLICATE KEY UPDATE exams_generated = exams_generated + 1
            `, [req.session.user_id, today]);
        }
        // -----------------------

        res.json(result);
    } catch (err) {
        console.error("AI Generation Error:", err);
        res.json({ success: false, error: err.message || 'Failed to generate exam from AI provider.' });
    }
};

exports.gradeTheory = async (req, res) => {
    try {
        const question = req.body.question || '';
        const answer = req.body.answer || '';

        if (!question || !answer) {
            return res.json({ success: false, error: 'Missing data' });
        }

        if (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY === 'PASTE_API_KEY_HERE') {
            return res.json({
                success: true,
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

        const completionText = await withTimeout(
            generateNvidiaCompletion(prompt, "You are a university professor grading exams. Output strict JSON only. Do not wrap in markdown tags."),
            15000,
            new Error("AI service busy. Please try again.")
        );
        let result = {};
        try {
            const cleanedText = completionText.replace(/```json\n?|```/g, '').trim();
            result = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error("Failed to parse JSON:", completionText);
            throw new Error("AI returned invalid JSON format.");
        }
        result.success = true;
        res.json(result);
    } catch (err) {
        console.error("AI Grading Error:", err);
        res.json({ success: false, error: err.message || 'Failed to grade answer from AI provider.' });
    }
};

exports.getPdfViewer = async (req, res) => {
    const pdf_url = req.query.url;
    if (!pdf_url) {
        return res.status(400).send("No PDF URL provided.");
    }

    let ai_limit_message = null;
    let ai_remaining = null;
    if (req.session.user.subscription_plan === 'Premium') {
        try {
            const today = new Date().toISOString().split('T')[0];
            const [usage] = await pool.query('SELECT exams_generated FROM ai_usage_tracking WHERE user_id = ? AND usage_date = ?', [req.session.user_id, today]);
            const used = usage.length > 0 ? usage[0].exams_generated : 0;
            const remaining = Math.max(0, 3 - used);
            ai_remaining = remaining;
            ai_limit_message = `Premium Plan: You have ${remaining} out of 3 AI requests remaining today. Upgrade to Full Premium for unlimited AI access.`;
        } catch(err) {
            console.error(err);
            ai_remaining = 3;
            ai_limit_message = `Premium Plan: You have 3 out of 3 AI requests remaining today. Upgrade to Full Premium for unlimited AI access.`;
        }
    }

    res.render('acct/pdf_viewer', { pdf_url, ai_limit_message, ai_remaining });
};

exports.chatPdf = async (req, res) => {
    try {
        // --- Usage Limit Check ---
        if (req.session.user.subscription_plan === 'Premium') {
            try {
                const today = new Date().toISOString().split('T')[0];
                const [usage] = await pool.query('SELECT exams_generated FROM ai_usage_tracking WHERE user_id = ? AND usage_date = ?', [req.session.user_id, today]);
                if (usage.length > 0 && usage[0].exams_generated >= 3) {
                    return res.json({ error: "You have reached the maximum limit of 3 AI requests per day on the Premium plan. Please upgrade to Full Premium." });
                }
            } catch (e) {
                console.error("Usage limit query error:", e);
            }
        }
        // -----------------------

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

            // --- Increment Usage ---
            if (req.session.user.subscription_plan === 'Premium') {
                try {
                    const today = new Date().toISOString().split('T')[0];
                    await pool.query(`
                        INSERT INTO ai_usage_tracking (user_id, usage_date, exams_generated) 
                        VALUES (?, ?, 1) 
                        ON DUPLICATE KEY UPDATE exams_generated = exams_generated + 1
                    `, [req.session.user_id, today]);
                } catch (e) {
                    console.error("Usage limit increment error:", e);
                }
            }
            // -----------------------

            res.json(data);
        } else {
            res.json({ error: 'Invalid action' });
        }
    } catch (err) {
        console.error(err);
        res.json({ error: 'Server error communicating with PDF AI.' });
    }
};
