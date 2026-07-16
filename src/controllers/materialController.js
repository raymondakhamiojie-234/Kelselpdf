const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { genAI, getBestGeminiModel } = require('../services/ai');

exports.getMyMaterials = async (req, res) => {
    try {
        const [materials] = await pool.query('SELECT * FROM user_materials WHERE user_id = ? ORDER BY uploaded_at DESC', [req.session.user_id]);
        res.render('acct/my_materials', { materials });
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
        
        const originalName = req.file.originalname;
        const filename = req.file.filename;

        await pool.query(
            'INSERT INTO user_materials (user_id, original_name, filename) VALUES (?, ?, ?)',
            [req.session.user_id, originalName, filename]
        );

        res.redirect('/my_materials');
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.explainMaterial = async (req, res) => {
    try {
        const materialId = req.body.material_id;
        const [rows] = await pool.query('SELECT * FROM user_materials WHERE id = ? AND user_id = ?', [materialId, req.session.user_id]);
        
        if (rows.length === 0) return res.status(404).json({ error: "Material not found" });
        
        const material = rows[0];
        const filePath = path.join(__dirname, '../../public/uploads/materials', material.filename);
        
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on server" });

        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        const text = data.text.substring(0, 30000); // Limit text to avoid token limits

        if (!genAI) {
            return res.json({ explanation: "Mock explanation: This document discusses key topics found in your PDF. (Add Gemini API Key to see real results)." });
        }

        const modelName = await getBestGeminiModel();
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const prompt = `You are a helpful AI tutor. Summarize and explain the core concepts of the following document. Make it easy to understand for a student.\n\nDocument Text:\n${text}`;
        const completion = await model.generateContent(prompt);
        
        res.json({ explanation: completion.response.text() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
};

exports.generateExam = async (req, res) => {
    try {
        const materialId = req.body.material_id;
        const [rows] = await pool.query('SELECT * FROM user_materials WHERE id = ? AND user_id = ?', [materialId, req.session.user_id]);
        
        if (rows.length === 0) return res.status(404).json({ error: "Material not found" });
        
        const material = rows[0];
        const filePath = path.join(__dirname, '../../public/uploads/materials', material.filename);
        
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on server" });

        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        const text = data.text.substring(0, 30000);

        if (!genAI) {
            return res.json({
                mcqs: [
                    { question: "Mock question based on PDF?", options: ["A", "B", "C", "D"], answer_index: 0 }
                ],
                theory: "Mock theory question based on PDF."
            });
        }

        const prompt = `Based strictly on the following document text, generate exactly 5 multiple-choice questions and 1 open-ended theory question.
Return ONLY a raw JSON object with this exact structure (no markdown tags):
{
  "mcqs": [
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "answer_index": 0 }
  ],
  "theory": "..."
}

Document Text:
${text}`;

        const modelName = await getBestGeminiModel();
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: "application/json" }
        });
        
        const completion = await model.generateContent(prompt);
        const result = JSON.parse(completion.response.text());
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
};
