const pool = require('../config/db');
const { extractTextFromPDF, extractQuestionsFromText } = require('../services/questionExtractorService');
const csv = require('csv-parser');
const fs = require('fs');

// Render the import UI
exports.getImportView = async (req, res) => {
    try {
        const [bodies] = await pool.query('SELECT * FROM cbt_exam_bodies ORDER BY name ASC');
        res.render('admin/cbt/import', { bodies, error: null, success: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error: " + err.message);
    }
};

// Handle PDF Upload
exports.postImportPDF = async (req, res) => {
    try {
        const { exam_body_id, exam_id, subject_id, paper_id, year, source } = req.body;
        
        if (!req.file) {
            throw new Error("No PDF file uploaded.");
        }

        // 1. Extract text from PDF
        const rawText = await extractTextFromPDF(req.file.buffer);

        // 2. We can't send massive PDFs all at once. We'll take the first chunk for MVP, 
        // or chunk it if needed. For now, take first 30,000 chars to avoid prompt limits.
        const chunk = rawText.substring(0, 30000); 

        // 3. Send to Gemini for JSON extraction
        const questions = await extractQuestionsFromText(chunk);

        // 4. Save to Database as PENDING_REVIEW
        for (const q of questions) {
            await pool.query(`
                INSERT INTO cbt_questions 
                (exam_body_id, exam_id, subject_id, paper_id, year, question_text, option_a, option_b, option_c, option_d, option_e, correct_answer, explanation, topic, difficulty, source, source_type, license_status, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PDF_UPLOAD', 'PENDING_REVIEW', 'DRAFT')
            `, [
                exam_body_id || null, 
                exam_id || null, 
                subject_id, 
                paper_id || null, 
                year || null, 
                q.question_text, 
                q.option_a, q.option_b, q.option_c, q.option_d, q.option_e || null, 
                q.correct_answer, 
                q.explanation, 
                null, // For now, we skip topic_id binding until we create a topic resolution layer
                q.difficulty || 'MEDIUM', 
                source || req.file.originalname
            ]);
        }

        res.render('admin/cbt/import', { 
            bodies: await getBodies(), 
            error: null, 
            success: `Successfully extracted and drafted ${questions.length} questions. Please review them in the Review Queue.`
        });
        
    } catch (err) {
        console.error("PDF Import Error:", err);
        res.render('admin/cbt/import', { 
            bodies: await getBodies(), 
            error: "Import Failed: " + err.message, 
            success: null 
        });
    }
};

// Helper for rendering
async function getBodies() {
    const [bodies] = await pool.query('SELECT * FROM cbt_exam_bodies ORDER BY name ASC');
    return bodies;
}

// Render Review Queue
exports.getReviewQueue = async (req, res) => {
    try {
        const [questions] = await pool.query(`
            SELECT q.*, s.name as subject_name 
            FROM cbt_questions q
            JOIN cbt_subjects s ON q.subject_id = s.id
            WHERE q.status = 'DRAFT' OR q.license_status = 'PENDING_REVIEW'
            ORDER BY q.created_at ASC
        `);
        res.render('admin/cbt/review', { questions, error: null, success: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error: " + err.message);
    }
};

// Handle Approval
exports.postApproveQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const { question_text, option_a, option_b, option_c, option_d, correct_answer, license_status } = req.body;
        
        await pool.query(`
            UPDATE cbt_questions 
            SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_answer = ?, license_status = ?, status = 'PUBLISHED'
            WHERE id = ?
        `, [question_text, option_a, option_b, option_c, option_d, correct_answer, license_status || 'AUTHORIZED', id]);
        
        res.redirect('/admin/cbt/review');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error approving question: " + err.message);
    }
};

// Handle Rejection (Delete)
exports.postRejectQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM cbt_questions WHERE id = ?', [id]);
        res.redirect('/admin/cbt/review');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error rejecting question: " + err.message);
    }
};

// AJAX Endpoint to get Exams for a Body
exports.getExamsForBody = async (req, res) => {
    try {
        const [exams] = await pool.query('SELECT id, name FROM cbt_exams WHERE exam_body_id = ? ORDER BY name ASC', [req.params.bodyId]);
        res.json(exams);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
};

// AJAX Endpoint to get Subjects for an Exam
exports.getSubjectsForExam = async (req, res) => {
    try {
        const [subjects] = await pool.query('SELECT id, name FROM cbt_subjects WHERE exam_id = ? ORDER BY name ASC', [req.params.examId]);
        res.json(subjects);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
};
