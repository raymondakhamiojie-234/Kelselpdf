const pool = require('../config/db');

exports.getTrialSetup = async (req, res) => {
    try {
        // Only fetch GST courses for the free trial
        const [courses] = await pool.query(`
            SELECT DISTINCT c.course_code 
            FROM courses c
            JOIN questions q ON REPLACE(c.course_code, ' ', '') = REPLACE(q.course_code, ' ', '')
            WHERE c.shared_access_group = 'gst'
            ORDER BY c.course_code ASC
        `);
        
        res.render('trial/setup', { courses });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.getTrialStart = (req, res) => {
    const course = req.query.course;
    if (!course) return res.redirect('/');
    // Free trial defaults: 15 mins, 20 questions
    const time = 15;
    const questions = 20;
    res.redirect(`/trial/take/${encodeURIComponent(course)}?time=${time}&questions=${questions}`);
};

exports.getTakeTrial = async (req, res) => {
    try {
        const course = req.params.course;
        const time_limit = parseInt(req.query.time) || 15;
        const question_limit = parseInt(req.query.questions) || 20;

        const [questions] = await pool.query(
            "SELECT id, question_text, option_a, option_b, option_c, option_d FROM questions WHERE REPLACE(course_code, ' ', '') = ? ORDER BY RAND() LIMIT ?",
            [(course||'').replace(/\s+/g, ''), question_limit]
        );

        res.render('trial/take_exam', {
            course,
            time_limit,
            questions
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.postTrialSubmit = async (req, res) => {
    try {
        const course = req.body.course || 'Unknown';
        const total_questions = parseInt(req.body.total_questions) || 0;
        
        if (total_questions === 0) {
            return res.status(400).send("Invalid trial submission.");
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
            const [rows] = await pool.query(
                'SELECT id, correct_option FROM questions WHERE id IN (?)',
                [answered_ids]
            );

            for (const row of rows) {
                const correct_opt = (row.correct_option || '').trim().toLowerCase();
                const user_opt = (user_answers[row.id] || '').trim().toLowerCase();
                if (correct_opt === user_opt) {
                    score++;
                }
            }
        }

        res.render('trial/results', {
            course,
            score,
            total_questions,
            percentage: ((score / total_questions) * 100).toFixed(1)
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};
