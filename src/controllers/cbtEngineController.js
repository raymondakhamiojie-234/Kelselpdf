const pool = require('../config/db');
const crypto = require('crypto');

// 0. Unified Hub Landing Page
exports.getStudentHub = async (req, res) => {
    try {
        const [examBodies] = await pool.query('SELECT * FROM cbt_exam_bodies WHERE status = ? ORDER BY name ASC', ['ACTIVE']);
        res.render('cbt/hub', { 
            active_page: 'cbt_hub',
            examBodies
        });
    } catch(err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

// 0.5. Dedicated Exam Hub
exports.getExamHub = async (req, res) => {
    try {
        const bodyCode = req.params.code;
        const [bodyInfo] = await pool.query('SELECT * FROM cbt_exam_bodies WHERE code = ?', [bodyCode]);
        
        if (bodyInfo.length === 0) return res.redirect('/cbt');
        
        const body = bodyInfo[0];
        
        res.render('cbt/exam_hub', {
            active_page: 'cbt_hub',
            body
        });
    } catch(err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

// 1. Setup / Selection View 
exports.getMockSetup = async (req, res) => {
    try {
        const [mocks] = await pool.query(`
            SELECT m.*, e.name as exam_name, b.name as body_name
            FROM cbt_mocks m
            JOIN cbt_exams e ON m.exam_id = e.id
            JOIN cbt_exam_bodies b ON e.exam_body_id = b.id
            WHERE m.status = ? ${req.query.body_id ? 'AND b.id = ?' : ''}
            ORDER BY m.created_at DESC
        `, req.query.body_id ? ['PUBLISHED', req.query.body_id] : ['PUBLISHED']);
        
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
        const { mock_id, selected_electives } = req.body;
        const userId = req.session.user_id;

        const [mockInfo] = await pool.query(`
            SELECT m.*, e.exam_body_id 
            FROM cbt_mocks m 
            JOIN cbt_exams e ON m.exam_id = e.id 
            WHERE m.id = ? AND m.status = 'PUBLISHED'
        `, [mock_id]);

        if (mockInfo.length === 0) return res.status(404).send("Mock not found.");
        const mock = mockInfo[0];

        // Enforce Premium Access
        if (mock.is_premium) {
            const user = req.session.user;
            const isSubscribed = user && user.has_paid && (!user.expiry_date || new Date(user.expiry_date) > new Date());
            if (!isSubscribed) {
                return res.redirect('/payment?locked=true');
            }
        }

        // Fetch subject rules for this mock
        const [rules] = await pool.query('SELECT subject_id, question_count, is_compulsory FROM cbt_mock_subjects WHERE mock_id = ?', [mock_id]);
        if (rules.length === 0) return res.status(400).send("Mock blueprint is empty.");

        // CANDIDATE SUBJECT SELECTION LOGIC (JAMB)
        if (mock.candidate_subject_selection && !selected_electives) {
            // Need to render the subject selection screen!
            const [subjectsData] = await pool.query(`
                SELECT ms.*, s.name as subject_name 
                FROM cbt_mock_subjects ms 
                JOIN cbt_subjects s ON ms.subject_id = s.id 
                WHERE ms.mock_id = ?
            `, [mock_id]);
            
            return res.render('cbt/select_subjects', {
                active_page: 'cbt_mock',
                mock,
                subjects: subjectsData
            });
        }

        // Determine Final Allowed Subjects
        let activeRules = [];
        if (mock.candidate_subject_selection) {
            let electives = [];
            if (Array.isArray(selected_electives)) { electives = selected_electives; }
            else if (typeof selected_electives === 'string') { electives = [selected_electives]; }
            
            if (electives.length !== mock.required_elective_count) {
                return res.status(400).send(`You must select exactly ${mock.required_elective_count} electives.`);
            }
            
            activeRules = rules.filter(r => r.is_compulsory || electives.includes(r.subject_id.toString()));
        } else {
            activeRules = rules; // Take all
        }

        // Ensure user hasn't an active IN_PROGRESS session 
        await pool.query('UPDATE cbt_exam_sessions SET status = ? WHERE user_id = ? AND status = ?', ['ABANDONED', userId, 'IN_PROGRESS']);

        const sessionId = crypto.randomUUID();
        let allQuestions = [];

        for (const rule of activeRules) {
            const [q] = await pool.query(`
                SELECT id FROM cbt_questions 
                WHERE subject_id = ? AND status = 'PUBLISHED' 
                ORDER BY RAND() LIMIT ?
            `, [rule.subject_id, rule.question_count]);
            
            allQuestions = allQuestions.concat(q);
        }

        if (allQuestions.length === 0) return res.status(400).send("Not enough questions in the bank.");

        await pool.query(`
            INSERT INTO cbt_exam_sessions (id, user_id, exam_body_id, exam_id, mock_id, duration_minutes, total_questions) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [sessionId, userId, mock.exam_body_id, mock.exam_id, mock.id, mock.time_limit_minutes, allQuestions.length]);

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

// 6. Final Submit & Analytics Generation
exports.postSubmit = async (req, res) => {
    try {
        const { session_id } = req.body;
        const userId = req.session.user_id;

        const [session] = await pool.query('SELECT * FROM cbt_exam_sessions WHERE id = ? AND user_id = ?', [session_id, userId]);
        if (session.length === 0 || session[0].status !== 'IN_PROGRESS') {
            return res.redirect(`/cbt/results/${session_id}`);
        }

        // Fetch answers with their subject associations
        const [answers] = await pool.query(`
            SELECT sq.id, sq.selected_option, q.correct_answer, q.subject_id 
            FROM cbt_session_questions sq
            JOIN cbt_questions q ON sq.question_id = q.id
            WHERE sq.session_id = ?
        `, [session_id]);

        let totalScore = 0;
        let subjectStats = {};

        for (const ans of answers) {
            const isCorrect = ans.selected_option === ans.correct_answer;
            if (isCorrect) totalScore++;
            
            // Initialize subject tracker if missing
            if (!subjectStats[ans.subject_id]) {
                subjectStats[ans.subject_id] = { score: 0, total: 0 };
            }
            
            subjectStats[ans.subject_id].total++;
            if (isCorrect) subjectStats[ans.subject_id].score++;

            await pool.query('UPDATE cbt_session_questions SET is_correct = ? WHERE id = ?', [isCorrect, ans.id]);
        }

        await pool.query('UPDATE cbt_exam_sessions SET status = ?, end_time = NOW(), score = ? WHERE id = ?', ['COMPLETED', totalScore, session_id]);

        // Insert subject-level analytics
        for (const [subject_id, stats] of Object.entries(subjectStats)) {
            const accuracy = (stats.score / stats.total) * 100;
            await pool.query(`
                INSERT INTO cbt_session_analytics (session_id, subject_id, score, total_questions, accuracy_percentage)
                VALUES (?, ?, ?, ?, ?)
            `, [session_id, subject_id, stats.score, stats.total, accuracy]);
        }

        res.redirect(`/cbt/results/${session_id}`);
    } catch(err) {
        console.error(err);
        res.status(500).send("Error submitting exam: " + err.message);
    }
};

// 7. Results Dashboard & Advanced Analytics
exports.getResults = async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const userId = req.session.user_id;

        const [session] = await pool.query(`
            SELECT s.*, m.title as mock_title 
            FROM cbt_exam_sessions s
            JOIN cbt_mocks m ON s.mock_id = m.id
            WHERE s.id = ? AND s.user_id = ?
        `, [sessionId, userId]);
        
        if (session.length === 0) return res.status(404).send("Session not found.");
        const currentSession = session[0];
        
        // 1. Fetch Subject Analytics Breakdown
        const [analytics] = await pool.query(`
            SELECT a.*, s.name as subject_name 
            FROM cbt_session_analytics a
            JOIN cbt_subjects s ON a.subject_id = s.id
            WHERE a.session_id = ?
        `, [sessionId]);

        // 2. Fetch Percentile Rank for this Mock
        const [allScoresResult] = await pool.query(`
            SELECT score FROM cbt_exam_sessions 
            WHERE mock_id = ? AND status = 'COMPLETED'
        `, [currentSession.mock_id]);
        
        let percentile = 100;
        if (allScoresResult.length > 1) {
            const allScores = allScoresResult.map(s => s.score).sort((a,b) => a - b);
            const belowCount = allScores.filter(s => s < currentSession.score).length;
            percentile = Math.round((belowCount / allScores.length) * 100);
        }

        // 3. Recommended Study Materials based on Weak Subjects (< 50%)
        let recommendedMaterials = [];
        const weakSubjects = analytics.filter(a => a.accuracy_percentage < 50);
        
        if (weakSubjects.length > 0) {
            // Simplified material recommendation using ILIKE match on subject names for Phase 6
            // Or ideally mapping them directly if materials have subject_ids. For now we search title.
            const weakNames = weakSubjects.map(w => w.subject_name.split(' ')[0]); // Grab first keyword
            let likeQueries = weakNames.map(name => `title ILIKE '%${name}%'`).join(' OR ');
            
            const [materials] = await pool.query(`
                SELECT * FROM exam_materials 
                WHERE ${likeQueries}
                LIMIT 3
            `);
            recommendedMaterials = materials;
        }

        res.render('cbt/submission_success', {
            active_page: 'cbt_mock',
            session: currentSession,
            analytics,
            percentile,
            recommendedMaterials
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

