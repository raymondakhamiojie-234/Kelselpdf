const pool = require('../config/db');
const crypto = require('crypto');

// 1. Setup / Selection View
exports.getMockSetup = async (req, res) => {
    try {
        const [examBodies] = await pool.query('SELECT * FROM cbt_exam_bodies WHERE status = ? ORDER BY name ASC', ['ACTIVE']);
        const selectedBody = req.query.body || (examBodies.length > 0 ? examBodies[0].id : null);
        
        let exams = [];
        let subjects = [];
        
        if (selectedBody) {
            const [fetchedExams] = await pool.query('SELECT * FROM cbt_exams WHERE exam_body_id = ? AND status = ?', [selectedBody, 'ACTIVE']);
            exams = fetchedExams;
            
            // In a real advanced mock system, subjects are selected dynamically. 
            // For MVP Phase 4, we fetch all subjects for the selected exam to let them practice a specific subject 
            // or we can just randomize across all subjects of an exam. Let's do single subject mock for simplicity.
            if (exams.length > 0) {
                const selectedExam = req.query.exam || exams[0].id;
                const [fetchedSubjects] = await pool.query('SELECT * FROM cbt_subjects WHERE exam_id = ? AND status = ?', [selectedExam, 'ACTIVE']);
                subjects = fetchedSubjects;
            }
        }

        res.render('cbt/setup', { 
            active_page: 'cbt_mock',
            examBodies,
            exams,
            subjects,
            selectedBody,
            selectedExam: req.query.exam
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

// 2. Start Session (Generate DB snapshot and redirect)
exports.postStartSession = async (req, res) => {
    try {
        const { exam_body_id, exam_id, subject_id, duration } = req.body;
        const userId = req.session.user_id;
        
        // Ensure user hasn't an active IN_PROGRESS session (to prevent multi-tab abuse)
        await pool.query('UPDATE cbt_exam_sessions SET status = ? WHERE user_id = ? AND status = ?', ['ABANDONED', userId, 'IN_PROGRESS']);

        // Generate Session ID
        const sessionId = crypto.randomUUID();

        // Randomize questions for this session (e.g. 50 questions)
        let query = 'SELECT id FROM cbt_questions WHERE status = ?';
        let params = ['PUBLISHED'];
        
        if (subject_id) {
            query += ' AND subject_id = ?';
            params.push(subject_id);
        } else if (exam_id) {
            query += ' AND exam_id = ?';
            params.push(exam_id);
        }
        
        query += ' ORDER BY RAND() LIMIT 50';
        
        const [questions] = await pool.query(query, params);
        
        if (questions.length === 0) {
            return res.status(400).send("No published questions available for this selection.");
        }

        // Create Session
        await pool.query(`
            INSERT INTO cbt_exam_sessions (id, user_id, exam_body_id, exam_id, duration_minutes, total_questions) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, [sessionId, userId, exam_body_id, exam_id, duration || 60, questions.length]);

        // Insert Session Questions
        for (let i = 0; i < questions.length; i++) {
            await pool.query(`
                INSERT INTO cbt_session_questions (session_id, question_id, question_number)
                VALUES (?, ?, ?)
            `, [sessionId, questions[i].id, i + 1]);
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
            SELECT s.*, e.name as exam_name, b.code as body_code
            FROM cbt_exam_sessions s
            JOIN cbt_exams e ON s.exam_id = e.id
            JOIN cbt_exam_bodies b ON s.exam_body_id = b.id
            WHERE s.id = ? AND s.user_id = ?
        `, [sessionId, userId]);

        if (session.length === 0) return res.status(404).send("Session not found.");
        
        if (session[0].status !== 'IN_PROGRESS') {
            return res.redirect(`/cbt/results/${sessionId}`);
        }

        // Fetch Questions and User's currently selected answers
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
        
        // Verify session ownership and status
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

        // Calculate Score
        // We fetch the correct answers and compare them with selected options
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
            
            // Save correctness to DB for analytical reporting later
            await pool.query('UPDATE cbt_session_questions SET is_correct = ? WHERE id = ?', [isCorrect, ans.id]);
        }

        await pool.query('UPDATE cbt_exam_sessions SET status = ?, end_time = NOW(), score = ? WHERE id = ?', ['COMPLETED', score, session_id]);

        res.redirect(`/cbt/results/${session_id}`);
    } catch(err) {
        console.error(err);
        res.status(500).send("Error submitting exam: " + err.message);
    }
};

// 7. Success/Results Page (Basic Phase 4)
exports.getResults = async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const [session] = await pool.query('SELECT * FROM cbt_exam_sessions WHERE id = ? AND user_id = ?', [sessionId, req.session.user_id]);
        
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
