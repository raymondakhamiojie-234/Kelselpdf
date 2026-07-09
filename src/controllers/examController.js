const pool = require('../config/db');

exports.getExamSetup = async (req, res) => {
    try {
        const [userRows] = await pool.query('SELECT department_id, level FROM users WHERE id = ?', [req.session.user_id]);
        const user = userRows[0];

        if (!user) {
            return res.redirect('/logout');
        }

        const [courses] = await pool.query(`
            SELECT DISTINCT c.course_code 
            FROM courses c
            JOIN questions q ON REPLACE(c.course_code, ' ', '') = REPLACE(q.course_code, ' ', '')
            WHERE (c.department_id = ? OR c.shared_access_group = 'gst') 
            AND c.level_access <= ?
            ORDER BY c.course_code ASC
        `, [user.department_id, user.level]);
        
        res.render('acct/exam_setup', { courses });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.getExamMaterials = async (req, res) => {
    try {
        const dept_id = req.session.user.department_id;
        const level = req.session.user.level;

        const query = `
            SELECT pq.*, c.course_code FROM past_questions pq 
            JOIN courses c ON pq.course_id = c.id 
            WHERE (c.department_id = ? OR c.shared_access_group = 'gst') 
            AND c.level_access <= ?
            ORDER BY c.course_code ASC, pq.year DESC
        `;
        const [materials] = await pool.query(query, [dept_id, level]);
        res.render('acct/exam_materials', { user: req.session.user, materials });
    } catch (err) {
        console.error(err);
        res.render('acct/exam_materials', { user: req.session.user, materials: [] });
    }
};

exports.getExamStart = (req, res) => {
    const course = req.query.course;
    if (!course) return res.redirect('/dashboard');
    const time = req.query.time || 30;
    const questions = req.query.questions || 20;
    res.redirect(`/exam/take/${encodeURIComponent(course)}?time=${time}&questions=${questions}`);
};

exports.getTakeExam = async (req, res) => {
    try {
        const course = req.params.course;
        const time_limit = parseInt(req.query.time) || 30;
        const question_limit = parseInt(req.query.questions) || 20;

        const [questions] = await pool.query(
            "SELECT id, question_text, option_a, option_b, option_c, option_d FROM questions WHERE REPLACE(course_code, ' ', '') = ? ORDER BY RAND() LIMIT ?",
            [(course||'').replace(/\\s+/g, ''), question_limit]
        );

        res.render('acct/take_exam', {
            user: req.session.user,
            course,
            time_limit,
            questions
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.postExamSubmit = async (req, res) => {
    try {
        const course = req.body.course || 'Unknown';
        const total_questions = parseInt(req.body.total_questions) || 0;
        
        if (total_questions === 0) {
            return res.status(400).send("Invalid exam submission.");
        }

        let score = 0;
        const answered_ids = [];
        const user_answers = {};

        // Extract submitted answers from req.body
        for (const [key, val] of Object.entries(req.body)) {
            if (key.startsWith('q_')) {
                const q_id = parseInt(key.substring(2));
                answered_ids.push(q_id);
                user_answers[q_id] = val;
            }
        }

        if (answered_ids.length > 0) {
            const placeholders = answered_ids.map(() => '?').join(',');
            const [rows] = await pool.query(`SELECT id, correct_option FROM questions WHERE id IN (${placeholders})`, answered_ids);
            
            rows.forEach(row => {
                if (user_answers[row.id] && user_answers[row.id].toUpperCase() === row.correct_option.toUpperCase()) {
                    score++;
                }
            });
        }

        // Log attempt
        await pool.query(
            'INSERT INTO exam_attempts (user_id, course_code, score, total_questions) VALUES (?, ?, ?, ?)',
            [req.session.user.id, course, score, total_questions]
        );

        const percentage = Math.round((score / total_questions) * 100 * 10) / 10;
        let feedback = "";
        if (percentage >= 70) {
            feedback = "Excellent work! You have a solid grasp of this material.";
        } else if (percentage >= 50) {
            feedback = "Good job. With a bit more practice, you'll be perfect.";
        } else {
            feedback = "Keep practicing! Use the AI Tutor to review the areas you missed.";
        }

        res.render('acct/exam_result', {
            course,
            score,
            total_questions,
            percentage,
            feedback
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.getExamAnalytics = async (req, res) => {
    try {
        const user_id = req.session.user.id;
        const dept_id = req.session.user.department_id;
        const level = req.session.user.level;

        const [attempts] = await pool.query(
            'SELECT * FROM exam_attempts WHERE user_id = ? ORDER BY created_at DESC',
            [user_id]
        );

        // Group scores by course for Chart
        const chart_data = {};
        attempts.forEach(a => {
            const c = a.course_code;
            if (!chart_data[c]) {
                chart_data[c] = { total: 0, count: 0 };
            }
            const pct = (a.score / a.total_questions) * 100;
            chart_data[c].total += pct;
            chart_data[c].count++;
        });

        const labels = [];
        const data = [];
        for (const [course, stats] of Object.entries(chart_data)) {
            labels.push(course);
            data.push(Math.round((stats.total / stats.count) * 100) / 100);
        }

        // Fetch past questions
        const [past_questions] = await pool.query(
            `SELECT pq.*, c.course_code FROM past_questions pq 
             JOIN courses c ON pq.course_id = c.id 
             WHERE (c.department_id = ? OR c.shared_access_group = 'gst') 
             AND c.level_access <= ?`,
            [dept_id, level]
        );

        res.render('acct/exam_analytics', {
            user: req.session.user,
            attempts,
            labels: JSON.stringify(labels),
            data: JSON.stringify(data),
            past_questions
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};
