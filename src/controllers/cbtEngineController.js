const pool = require('../config/db');
const crypto = require('crypto');

// 1. Setup / Selection View (Now based on Mocks)
exports.getMockSetup = async (req, res) => {
    try {
        const [mocks] = await pool.query(`
            SELECT m.*, e.name as exam_name, b.name as body_name
            FROM cbt_mocks m
            JOIN cbt_exams e ON m.exam_id = e.id
            JOIN cbt_exam_bodies b ON e.exam_body_id = b.id
            WHERE m.status = ?
            ORDER BY m.created_at DESC
        `, ['PUBLISHED']);
        
        res.render('cbt/setup', { 
            active_page: 'cbt_mock',
            mocks
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

// 2. Start Session 
exports.postStartSession = async (req, res) => {
    try {
        const { mock_id } = req.body;
        const userId = req.session.user_id;

        const [mockInfo] = await pool.query(`
            SELECT m.*, e.exam_body_id 
            FROM cbt_mocks m 
            JOIN cbt_exams e ON m.exam_id = e.id 
            WHERE m.id = ? AND m.status = 'PUBLISHED'
        `, [mock_id]);

        if (mockInfo.length === 0) return res.status(404).send("Mock not found.");
        const mock = mockInfo[0];

        // Ensure user hasn't an active IN_PROGRESS session 
        await pool.query('UPDATE cbt_exam_sessions SET status = ? WHERE user_id = ? AND status = ?', ['ABANDONED', userId, 'IN_PROGRESS']);

        const sessionId = crypto.randomUUID();
        let allQuestions = [];

        // Fetch subject rules for this mock
        const [rules] = await pool.query('SELECT subject_id, question_count FROM cbt_mock_subjects WHERE mock_id = ?', [mock_id]);

        if (rules.length === 0) {
            return res.status(400).send("Mock blueprint is empty (no subjects configured).");
        }

        for (const rule of rules) {
            // For each subject, randomly pull `question_count` questions
            const [q] = await pool.query(`
                SELECT id FROM cbt_questions 
                WHERE subject_id = ? AND status = 'PUBLISHED' 
                ORDER BY RAND() LIMIT ?
            `, [rule.subject_id, rule.question_count]);
            
            allQuestions = allQuestions.concat(q);
        }

        // Shuffle all questions together so subjects are mixed (or we can keep them grouped, let's keep grouped for now)
        // Actually, let's group by subject in the frontend later, but for now we just dump them into session_questions.

        if (allQuestions.length === 0) {
            return res.status(400).send("Not enough questions in the bank to fulfill this mock.");
        }

        // Create Session
        await pool.query(`
            INSERT INTO cbt_exam_sessions (id, user_id, exam_body_id, exam_id, mock_id, duration_minutes, total_questions) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [sessionId, userId, mock.exam_body_id, mock.exam_id, mock.id, mock.time_limit_minutes, allQuestions.length]);

        // Insert Session Questions
        for (let i = 0; i < allQuestions.length; i++) {
            await pool.query(`
                INSERT INTO cbt_session_questions (session_id, question_id, question_number)
                VALUES (?, ?, ?)
            `, [sessionId, allQuestions[i].id, i + 1]);
        }

        res.redirect(`/cbt/engine/${sessionId}`);
    } catch(err) {
        console.error(err);
        res.status(500).send("Error starting session: " + err.message);
    }
};

// 3. Main CBT Engine View
exports.getEngine = async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const userId = req.session.user_id;

        const [session] = await pool.query(`
            SELECT s.*, m.title as mock_title, e.name as exam_name, b.code as body_code
            FROM cbt_exam_sessions s
            JOIN cbt_mocks m ON s.mock_id = m.id
            JOIN cbt_exams e ON s.exam_id = e.id
            JOIN cbt_exam_bodies b ON s.exam_body_id = b.id
            WHERE s.id = ? AND s.user_id = ?
        `, [sessionId, userId]);

        if (session.length === 0) return res.status(404).send("Session not found.");
        
        if (session[0].status !== 'IN_PROGRESS') {
            return res.redirect(`/cbt/results/${sessionId}`);
        }

        const [questions] = await pool.query(`
            SELECT sq.question_number, sq.selected_option, q.id as q_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.option_e 
            FROM cbt_session_questions sq
            JOIN cbt_questions q ON sq.question_id = q.id
            WHERE sq.session_id = ?
            ORDER BY sq.question_number ASC
        `, [sessionId]);

        res.render('cbt/engine', {
            active_page: 'cbt_mock',
            session: session[0],
            questions
        });
    } catch(err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

// 4. Auto-Save AJAX
exports.postAutoSave = async (req, res) => {
    try {
        const { session_id, question_id, selected_option } = req.body;
        
        const [session] = await pool.query('SELECT status FROM cbt_exam_sessions WHERE id = ? AND user_id = ?', [session_id, req.session.user_id]);
        if (session.length === 0 || session[0].status !== 'IN_PROGRESS') {
            return res.status(403).json({ error: "Session expired or invalid" });
        }

        await pool.query('UPDATE cbt_session_questions SET selected_option = ? WHERE session_id = ? AND question_id = ?', [selected_option, session_id, question_id]);
        
        res.json({ success: true });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// 5. Log Violation (Tab Switch)
exports.postLogViolation = async (req, res) => {
    try {
        const { session_id } = req.body;
        await pool.query('UPDATE cbt_exam_sessions SET tab_switches = tab_switches + 1 WHERE id = ? AND user_id = ?', [session_id, req.session.user_id]);
        res.json({ success: true });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// 6. Final Submit
exports.postSubmit = async (req, res) => {
    try {
        const { session_id } = req.body;
        const userId = req.session.user_id;

        const [session] = await pool.query('SELECT * FROM cbt_exam_sessions WHERE id = ? AND user_id = ?', [session_id, userId]);
        if (session.length === 0 || session[0].status !== 'IN_PROGRESS') {
            return res.redirect(`/cbt/results/${session_id}`);
        }

        const [answers] = await pool.query(`
            SELECT sq.id, sq.selected_option, q.correct_answer 
            FROM cbt_session_questions sq
            JOIN cbt_questions q ON sq.question_id = q.id
            WHERE sq.session_id = ?
        `, [session_id]);

        let score = 0;
        for (const ans of answers) {
            const isCorrect = ans.selected_option === ans.correct_answer;
            if (isCorrect) score++;
            
            await pool.query('UPDATE cbt_session_questions SET is_correct = ? WHERE id = ?', [isCorrect, ans.id]);
        }

        await pool.query('UPDATE cbt_exam_sessions SET status = ?, end_time = NOW(), score = ? WHERE id = ?', ['COMPLETED', score, session_id]);

        res.redirect(`/cbt/results/${session_id}`);
    } catch(err) {
        console.error(err);
        res.status(500).send("Error submitting exam: " + err.message);
    }
};

// 7. Success/Results Page
exports.getResults = async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const [session] = await pool.query(`
            SELECT s.*, m.title as mock_title 
            FROM cbt_exam_sessions s
            JOIN cbt_mocks m ON s.mock_id = m.id
            WHERE s.id = ? AND s.user_id = ?
        `, [sessionId, req.session.user_id]);
        
        if (session.length === 0) return res.status(404).send("Session not found.");
        
        res.render('cbt/submission_success', {
            active_page: 'cbt_mock',
            session: session[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};
