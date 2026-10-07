const pool = require('../config/db');

exports.getPracticeDashboard = async (req, res) => {
    try {
        const [examBodies] = await pool.query('SELECT * FROM cbt_exam_bodies WHERE status = ? ORDER BY name ASC', ['ACTIVE']);
        
        // Fetch recent practice history
        const [history] = await pool.query(`
            SELECT h.*, s.name as subject_name, b.code as body_code
            FROM cbt_practice_history h
            JOIN cbt_subjects s ON h.subject_id = s.id
            JOIN cbt_exam_bodies b ON h.exam_body_id = b.id
            WHERE h.user_id = ?
            ORDER BY h.last_accessed DESC LIMIT 5
        `, [req.session.user_id]);

        res.render('cbt/practice_dashboard', { 
            active_page: 'cbt_practice', 
            examBodies, 
            history 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

exports.getPracticeSetup = async (req, res) => {
    try {
        const bodyId = req.query.body;
        if (!bodyId) return res.redirect('/practice');

        const [bodyInfo] = await pool.query('SELECT name, code FROM cbt_exam_bodies WHERE id = ?', [bodyId]);
        const [exams] = await pool.query('SELECT * FROM cbt_exams WHERE exam_body_id = ? AND status = ?', [bodyId, 'ACTIVE']);
        
        res.render('cbt/practice_setup', { 
            active_page: 'cbt_practice', 
            body: bodyInfo[0], 
            exams,
            bodyId 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

exports.getPracticeSession = async (req, res) => {
    try {
        const { subject_id, year } = req.query;
        if (!subject_id) return res.redirect('/practice');

        const [subjectInfo] = await pool.query(`
            SELECT s.name as subject_name, e.name as exam_name, b.code as body_code, b.id as body_id, e.id as exam_id
            FROM cbt_subjects s
            JOIN cbt_exams e ON s.exam_id = e.id
            JOIN cbt_exam_bodies b ON e.exam_body_id = b.id
            WHERE s.id = ?
        `, [subject_id]);

        if (subjectInfo.length === 0) return res.redirect('/practice');

        // Fetch published questions
        let query = 'SELECT id, question_text, option_a, option_b, option_c, option_d, option_e FROM cbt_questions WHERE subject_id = ? AND status = ?';
        let params = [subject_id, 'PUBLISHED'];

        if (year) {
            query += ' AND year = ?';
            params.push(year);
        }

        query += ' ORDER BY RANDOM() LIMIT 50'; // For practice, limit to 50 random

        const [questions] = await pool.query(query, params);

        // Upsert History
        await pool.query(`
            INSERT INTO cbt_practice_history (user_id, exam_body_id, exam_id, subject_id, year, last_accessed)
            VALUES (?, ?, ?, ?, ?, NOW())
            ON CONFLICT (user_id, subject_id, year) 
            DO UPDATE SET last_accessed = NOW()
        `, [req.session.user_id, subjectInfo[0].body_id, subjectInfo[0].exam_id, subject_id, year || null]);

        res.render('cbt/practice_session', {
            active_page: 'cbt_practice',
            info: subjectInfo[0],
            year: year || 'Random Years',
            questions
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

// AJAX Endpoint
exports.postCheckAnswer = async (req, res) => {
    try {
        const { question_id, selected_option } = req.body;
        
        const [qData] = await pool.query('SELECT correct_answer, explanation FROM cbt_questions WHERE id = ?', [question_id]);
        if (qData.length === 0) return res.status(404).json({ error: "Not found" });

        const isCorrect = qData[0].correct_answer === selected_option;

        res.json({
            correct: isCorrect,
            correct_answer: qData[0].correct_answer,
            explanation: qData[0].explanation || "No explanation provided."
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// AJAX Endpoint
exports.postToggleBookmark = async (req, res) => {
    try {
        const { question_id } = req.body;
        const userId = req.session.user_id;

        const [existing] = await pool.query('SELECT id FROM cbt_bookmarks WHERE user_id = ? AND question_id = ?', [userId, question_id]);
        
        if (existing.length > 0) {
            await pool.query('DELETE FROM cbt_bookmarks WHERE id = ?', [existing[0].id]);
            res.json({ bookmarked: false });
        } else {
            await pool.query('INSERT INTO cbt_bookmarks (user_id, question_id) VALUES (?, ?)', [userId, question_id]);
            res.json({ bookmarked: true });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// AJAX Endpoint to track history updates (questions attempted/correct)
exports.postUpdateHistory = async (req, res) => {
    try {
        const { subject_id, year, is_correct } = req.body;
        const userId = req.session.user_id;

        // Since upsert in Postgres is complex with nulls, we do a basic update.
        // It's already upserted on page load.
        let query = 'UPDATE cbt_practice_history SET questions_attempted = questions_attempted + 1';
        if (is_correct) {
            query += ', correct_answers = correct_answers + 1';
        }
        
        if (year) {
            query += ' WHERE user_id = ? AND subject_id = ? AND year = ?';
            await pool.query(query, [userId, subject_id, year]);
        } else {
            query += ' WHERE user_id = ? AND subject_id = ? AND year IS NULL';
            await pool.query(query, [userId, subject_id]);
        }
        
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
};
