const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { generateNvidiaCompletion, withTimeout } = require('../services/ai');
const { jsonrepair } = require('jsonrepair');

exports.getMyMaterials = async (req, res) => {
    try {
        const [materials] = await pool.query('SELECT * FROM user_materials WHERE user_id = ? ORDER BY uploaded_at DESC', [req.session.user_id]);
        
        let limit_message = null;
        let materials_remaining = null;
        if (req.session.user.subscription_plan === 'Premium') {
            materials_remaining = Math.max(0, 7 - materials.length);
            limit_message = `Premium Plan: You have used ${materials.length} of 7 material uploads.`;
        }
        
        res.render('acct/my_materials', { materials, limit_message, materials_remaining });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.uploadMaterial = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send("No file uploaded.");
        }

        // --- Usage Limit Check ---
        if (req.session.user.subscription_plan === 'Premium') {
            const [rows] = await pool.query('SELECT COUNT(*) as count FROM user_materials WHERE user_id = ?', [req.session.user_id]);
            if (rows[0].count >= 7) {
                fs.unlinkSync(req.file.path); // Delete temp file
                return res.status(403).send("You have reached the maximum limit of 7 materials on the Premium plan. Please upgrade to Full Premium for unlimited materials.");
            }
        }
        // -----------------------
        
        const originalName = req.file.originalname;
        const filename = req.file.filename;

        // Parse PDF immediately instead of storing it
        let content = '';
        try {
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdfParse(dataBuffer);
            content = pdfData.text;
        } catch (parseErr) {
            console.error("PDF Parse Error:", parseErr);
            fs.unlinkSync(req.file.path);
            return res.status(400).send("Failed to parse PDF. Please ensure it is a valid text-based PDF document.");
        }

        await pool.query(
            'INSERT INTO user_materials (user_id, original_name, filename, content) VALUES (?, ?, ?, ?)',
            [req.session.user_id, originalName, filename, content]
        );

        // Delete the temp file now that we have the text
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.redirect('/my_materials');
    } catch (err) {
        console.error(err);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).send("Server Error");
    }
};

exports.explainMaterial = async (req, res) => {
    try {
        // --- Usage Limit Check ---
        if (req.session.user.subscription_plan === 'Premium') {
            const today = new Date().toISOString().split('T')[0];
            const [usage] = await pool.query('SELECT exams_generated FROM ai_usage_tracking WHERE user_id = ? AND usage_date = ?', [req.session.user_id, today]);
            if (usage.length > 0 && usage[0].exams_generated >= 7) {
                return res.json({ success: false, error: "You have reached the maximum limit of 7 AI requests per day on the Premium plan. Please upgrade to Full Premium." });
            }
        }
        // -----------------------

        const materialId = req.body.material_id;
        const [rows] = await pool.query('SELECT * FROM user_materials WHERE id = ? AND user_id = ?', [materialId, req.session.user_id]);
        
        if (rows.length === 0) return res.json({ success: false, error: "Material not found" });
        
        const material = rows[0];
        
        if (!material.content) return res.json({ success: false, error: "Material content is empty or not parsed correctly." });
        
        const text = material.content.substring(0, 30000); // Limit text to avoid token limits

        if (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY === 'PASTE_API_KEY_HERE') {
            return res.json({ explanation: "Mock explanation: This document discusses key topics found in your PDF. (Add NVIDIA API Key to see real results)." });
        }

        let completionText;
        try {
            const prompt = `You are a helpful AI tutor. Summarize and explain the core concepts of the following document. Make it easy to understand for a student.\n\nDocument Text:\n${text}`;
            completionText = await withTimeout(
                generateNvidiaCompletion(prompt, "You are an AI tutor."),
                30000,
                new Error("AI service busy. Please try again.")
            );

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

        } catch (apiErr) {
            console.error("NVIDIA API Error:", apiErr);
            return res.json({ success: false, error: "AI Service Error: " + apiErr.message });
        }
        
        res.json({ success: true, explanation: completionText });
    } catch (err) {
        console.error("General Server Error:", err);
        res.json({ success: false, error: "Server Error: " + err.message });
    }
};

exports.generateExam = async (req, res) => {
    try {
        // --- Usage Limit Check ---
        if (req.session.user.subscription_plan === 'Premium') {
            const today = new Date().toISOString().split('T')[0];
            const [usage] = await pool.query('SELECT exams_generated FROM ai_usage_tracking WHERE user_id = ? AND usage_date = ?', [req.session.user_id, today]);
            if (usage.length > 0 && usage[0].exams_generated >= 7) {
                return res.json({ success: false, error: "You have reached the maximum limit of 7 AI requests per day on the Premium plan. Please upgrade to Full Premium." });
            }
        }
        // -----------------------

        const materialId = req.body.material_id;
        const [rows] = await pool.query('SELECT * FROM user_materials WHERE id = ? AND user_id = ?', [materialId, req.session.user_id]);
        
        if (rows.length === 0) return res.status(404).json({ error: "Material not found" });
        
        const material = rows[0];
        
        if (!material.content) return res.status(400).json({ error: "Material content is empty or not parsed correctly." });
        
        const text = material.content.substring(0, 30000);

        if (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY === 'PASTE_API_KEY_HERE') {
            return res.json({ 
                success: true, 
                exam_data: { 
                    mcqs: [{ question: "Mock question from your material?", options: ["A. True","B. False","C. Maybe","D. None"], answer_index: 0 }],
                    theory: "Explain a concept from this material.",
                    title: `Exam on ${material.original_name}`, 
                    course: "Custom" 
                } 
            });
        }

        const examType = req.body.exam_type || 'both';
        let prompt = '';
        
        if (examType === 'cbe') {
            prompt = `Based strictly on the following document text, generate exactly 5 multiple-choice questions.
Return ONLY a raw JSON object with this exact structure (no markdown tags):
{
  "mcqs": [
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "answer_index": 0 }
  ]
}

Document Text:
${text}`;
        } else if (examType === 'theory') {
            prompt = `Based strictly on the following document text, generate exactly 2 open-ended theory questions.
Return ONLY a raw JSON object with this exact structure (no markdown tags):
{
  "theory": "1. ...\\n2. ..."
}

Document Text:
${text}`;
        } else {
            prompt = `Based strictly on the following document text, generate exactly 5 multiple-choice questions and 1 open-ended theory question.
Return ONLY a raw JSON object with this exact structure (no markdown tags):
{
  "mcqs": [
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "answer_index": 0 }
  ],
  "theory": "..."
}

Document Text:
${text}`;
        }

        let completionText;
        try {
            completionText = await withTimeout(
                generateNvidiaCompletion(prompt, "You are a university professor creating an exam. Output strict JSON only. Do not wrap in markdown tags."),
                30000,
                new Error("AI service busy. Please try again.")
            );
        } catch (apiErr) {
            console.error("NVIDIA API Error:", apiErr);
            return res.json({ success: false, error: "AI Service Error: " + apiErr.message });
        }

        try {
            const match = completionText.match(/\{[\s\S]*\}/);
            let jsonText = match ? match[0] : completionText;
            
            // Clean control characters that break JSON parsing (e.g. unescaped newlines in strings)
            jsonText = jsonText.replace(/[\u0000-\u001F]+/g, ' ');
            
            // Use jsonrepair for trailing commas, missing quotes, etc.
            const repairedJson = jsonrepair(jsonText);
            const result = JSON.parse(repairedJson);

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

            res.json({ success: true, exam_data: result });
        } catch (parseErr) {
            console.error("JSON Parse Error:", parseErr, completionText);
            return res.json({ success: false, error: "AI returned invalid format." });
        }
    } catch (err) {
        console.error("General Server Error:", err);
        res.json({ success: false, error: "Server Error: " + err.message });
    }
};
