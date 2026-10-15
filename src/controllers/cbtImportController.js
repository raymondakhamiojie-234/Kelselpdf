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

        const directPublish = req.body.direct_publish === 'on' || req.body.direct_publish === 'true' || req.body.direct_publish === true;
        const autoCreateMock = req.body.auto_create_mock === 'on' || req.body.auto_create_mock === 'true' || req.body.auto_create_mock === true;
        const initialStatus = directPublish ? 'PUBLISHED' : 'DRAFT';
        const initialLicense = directPublish ? 'AUTHORIZED' : 'PENDING_REVIEW';

        // 4. Save to Database
        for (const q of questions) {
            await pool.query(`
                INSERT INTO cbt_questions 
                (exam_body_id, exam_id, subject_id, paper_id, year, question_text, option_a, option_b, option_c, option_d, option_e, correct_answer, explanation, topic, topic_id, difficulty, source, source_type, license_status, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PDF_UPLOAD', ?, ?)
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
                q.topic || null,
                null, // topic_id
                q.difficulty || 'MEDIUM', 
                source || req.file.originalname,
                initialLicense,
                initialStatus
            ]);
        }

        // 5. If auto_create_mock or directPublish, ensure a Mock Exam Blueprint exists in cbt_mocks
        let mockCreatedTitle = null;
        if (directPublish || autoCreateMock) {
            try {
                const [subjInfo] = await pool.query('SELECT name, exam_id FROM cbt_subjects WHERE id = ?', [subject_id]);
                const targetExamId = exam_id || (subjInfo[0] ? subjInfo[0].exam_id : null);
                const [examInfo] = await pool.query('SELECT name, code FROM cbt_exams WHERE id = ?', [targetExamId]);

                if (subjInfo.length > 0 && examInfo.length > 0) {
                    mockCreatedTitle = `${examInfo[0].code || examInfo[0].name} ${subjInfo[0].name} Mock`;
                    const [countRes] = await pool.query("SELECT COUNT(*) as cnt FROM cbt_questions WHERE subject_id = ? AND status = 'PUBLISHED'", [subject_id]);
                    const availableQ = countRes[0] ? parseInt(countRes[0].cnt) : questions.length;
                    const mockQCount = availableQ > 0 ? availableQ : questions.length;

                    const [existingMock] = await pool.query("SELECT id FROM cbt_mocks WHERE title = ? AND exam_id = ?", [mockCreatedTitle, targetExamId]);
                    let mockId;
                    if (existingMock.length === 0) {
                        const [ins] = await pool.query(`
                            INSERT INTO cbt_mocks (exam_id, title, description, time_limit_minutes, is_premium, status, candidate_subject_selection, required_elective_count)
                            VALUES (?, ?, ?, ?, false, 'PUBLISHED', false, 0)
                        `, [targetExamId, mockCreatedTitle, `Authentic CBT mock examination for ${subjInfo[0].name}.`, Math.max(30, Math.round(mockQCount * 1.5))]);
                        mockId = ins.insertId;
                    } else {
                        mockId = existingMock[0].id;
                        await pool.query("UPDATE cbt_mocks SET status = 'PUBLISHED' WHERE id = ?", [mockId]);
                    }

                    if (mockId) {
                        const [existingSub] = await pool.query("SELECT id FROM cbt_mock_subjects WHERE mock_id = ? AND subject_id = ?", [mockId, subject_id]);
                        if (existingSub.length === 0) {
                            await pool.query("INSERT INTO cbt_mock_subjects (mock_id, subject_id, question_count, is_compulsory) VALUES (?, ?, ?, true)", [mockId, subject_id, mockQCount]);
                        } else {
                            await pool.query("UPDATE cbt_mock_subjects SET question_count = ? WHERE id = ?", [mockQCount, existingSub[0].id]);
                        }
                    }
                }
            } catch (mockErr) {
                console.error("Auto mock creation notice:", mockErr.message);
            }
        }

        let successMsg = `Successfully extracted and saved ${questions.length} questions.`;
        if (directPublish) {
            successMsg = `Successfully extracted and published ${questions.length} questions live! The Mock Exam "${mockCreatedTitle || 'Subject Mock'}" is now active and visible on the Mock Exam page.`;
        } else {
            successMsg += ` Questions are currently in DRAFT status. Please visit the Review Queue to approve and publish them live.`;
        }

        res.render('admin/cbt/import', { 
            bodies: await getBodies(), 
            error: null, 
            success: successMsg
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

// Bulk Approve All
exports.postApproveAllQuestions = async (req, res) => {
    try {
        await pool.query(`
            UPDATE cbt_questions 
            SET status = 'PUBLISHED', license_status = 'AUTHORIZED'
            WHERE status = 'DRAFT' OR license_status = 'PENDING_REVIEW'
        `);
        res.redirect('/admin/cbt/review');
    } catch (err) {
        console.error("Error bulk approving questions:", err);
        res.status(500).send("Error approving questions: " + err.message);
    }
};

// Handle Individual Approval
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
