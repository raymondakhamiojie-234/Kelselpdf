const pool = require('../config/db');

exports.getExamSetup = async (req, res) => {
    try {
        const userId = req.session.user_id || (req.session.user && req.session.user.id);
        if (!userId) {
            return res.redirect('/login');
        }

        const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        const user = userRows[0] || req.session.user || { id: userId, department_id: '', level: 100, full_name: 'AAU Student' };

        // 1. Fetch all distinct AAU courses that actually have questions in the questions bank
        const [availableCourses] = await pool.query(`
            SELECT 
                TRIM(course_code) AS course_code, 
                COUNT(id) AS question_count
            FROM questions
            GROUP BY TRIM(course_code)
            HAVING COUNT(id) > 0
            ORDER BY TRIM(course_code) ASC
        `);

        // 2. Identify user's department courses vs general GST courses
        const userDept = (user.department_id || '').toString().toLowerCase();
        const userLevel = parseInt(user.level) || 100;

        // Enhance course objects with category info
        const courses = availableCourses.map(c => {
            const code = c.course_code.toUpperCase();
            let category = 'Faculty & Departmental';
            let isRecommended = false;

            if (code.startsWith('GST') || code.startsWith('ENT') || code.startsWith('FAC')) {
                category = 'General Studies (GST / General)';
                isRecommended = true;
            } else if (code.startsWith('BIO') || code.startsWith('CHM') || code.startsWith('PHY') || code.startsWith('MTH')) {
                category = 'Basic Sciences';
                if (userDept.includes('science') || userDept.includes('physics') || userDept.includes('chemistry') || userDept.includes('biology') || userDept.includes('math') || userDept.includes('eng')) {
                    isRecommended = true;
                }
            } else if (code.startsWith('CSC')) {
                category = 'Computer Science & ICT';
                if (userDept.includes('computer') || userDept.includes('csc') || userDept.includes('1')) {
                    isRecommended = true;
                }
            }

            return {
                course_code: c.course_code,
                question_count: parseInt(c.question_count) || 0,
                category,
                isRecommended
            };
        });

        res.render('acct/exam_setup', { 
            courses, 
            user,
            active_page: 'aau_exam' 
        });
    } catch (err) {
        console.error("getExamSetup Error:", err);
        res.status(500).send("Error loading examination setup: " + err.message);
    }
};

exports.getExamMaterials = async (req, res) => {
    try {
        const userId = req.session.user_id || (req.session.user && req.session.user.id);
        const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        const user = userRows[0] || req.session.user || {};

        const dept_id = user.department_id || '';
        const level = user.level || 100;

        const query = `
            SELECT pq.*, c.course_code FROM past_questions pq 
            JOIN courses c ON pq.course_id = c.id 
            WHERE (c.department_id = ? OR c.department_id LIKE ? OR c.shared_access_group = 'gst') 
             AND c.level_access <= ?
            ORDER BY c.course_code ASC, pq.year DESC
        `;
        const [materials] = await pool.query(query, [dept_id, '%"' + dept_id + '"%', level]);
        res.render('acct/exam_materials', { user, materials, active_page: 'exam_materials' });
    } catch (err) {
        console.error("getExamMaterials Error:", err);
        res.render('acct/exam_materials', { user: req.session.user || {}, materials: [], active_page: 'exam_materials' });
    }
};

exports.getExamStart = (req, res) => {
    const course = req.query.course;
    if (!course) return res.redirect('/exam/setup');
    const time = parseInt(req.query.time) || 30;
    const questions = parseInt(req.query.questions) || 20;
    res.redirect(`/exam/take/${encodeURIComponent(course)}?time=${time}&questions=${questions}`);
};

exports.getTakeExam = async (req, res) => {
    try {
        const course = req.params.course;
        if (!course) return res.redirect('/exam/setup');

        const userId = req.session.user_id || (req.session.user && req.session.user.id);
        const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        const user = userRows[0] || req.session.user || { 
            id: userId, 
            full_name: 'AAU', 
            lastname: 'Student' 
        };

        const time_limit = parseInt(req.query.time) || 30;
        const question_limit = parseInt(req.query.questions) || 20;

        const normalizedCourse = (course || '').replace(/\s+/g, '');
        const [questions] = await pool.query(
            "SELECT id, question_text, option_a, option_b, option_c, option_d FROM questions WHERE LOWER(REPLACE(course_code, ' ', '')) = LOWER(?) ORDER BY RANDOM() LIMIT ?",
            [normalizedCourse, question_limit]
        );

        res.render('acct/take_exam', {
            user,
            course,
            time_limit,
            questions,
            active_page: 'aau_exam'
        });
    } catch (err) {
        console.error("getTakeExam Error:", err);
        res.status(500).send("Error loading examination: " + err.message);
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
                if (!isNaN(q_id)) {
                    answered_ids.push(q_id);
                    user_answers[q_id] = val;
                }
            }
        }

        if (answered_ids.length > 0) {
            const placeholders = answered_ids.map(() => '?').join(',');
            const [rows] = await pool.query(`SELECT id, correct_option FROM questions WHERE id IN (${placeholders})`, answered_ids);
            
            rows.forEach(row => {
                const userOpt = (user_answers[row.id] || '').toString().trim().toUpperCase();
                const correctOpt = (row.correct_option || '').toString().trim().toUpperCase();
                if (userOpt && correctOpt && userOpt === correctOpt) {
                    score++;
                }
            });
        }

        const userId = req.session.user_id || (req.session.user && req.session.user.id);

        // Safe attempt logging with table creation safeguard
        if (userId) {
            try {
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS exam_attempts (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        course_code VARCHAR(100) NOT NULL,
                        score INTEGER NOT NULL,
                        total_questions INTEGER NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await pool.query(
                    'INSERT INTO exam_attempts (user_id, course_code, score, total_questions) VALUES (?, ?, ?, ?)',
                    [userId, course, score, total_questions]
                );
            } catch (dbErr) {
                console.error("Non-fatal error logging exam attempt:", dbErr.message);
            }
        }

        const percentage = total_questions > 0 ? Math.round((score / total_questions) * 100 * 10) / 10 : 0;
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
        console.error("postExamSubmit Error:", err);
        res.status(500).send("Error submitting examination: " + err.message);
    }
};

exports.getExamAnalytics = async (req, res) => {
    try {
        const user_id = req.session.user_id || (req.session.user && req.session.user.id);
        const dept_id = (req.session.user && req.session.user.department_id) || '';
        const level = (req.session.user && req.session.user.level) || 100;

        let attempts = [];
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS exam_attempts (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    course_code VARCHAR(100) NOT NULL,
                    score INTEGER NOT NULL,
                    total_questions INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            const [rows] = await pool.query(
                'SELECT * FROM exam_attempts WHERE user_id = ? ORDER BY created_at DESC',
                [user_id]
            );
            attempts = rows;
        } catch (attErr) {
            console.error("Analytics attempts query error:", attErr.message);
        }

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
             WHERE (c.department_id = ? OR c.department_id LIKE ? OR c.shared_access_group = 'gst') 
             AND c.level_access <= ?`,
            [dept_id, '%"' + dept_id + '"%', level]
        );

        res.render('acct/exam_analytics', {
            user: req.session.user,
            attempts,
            labels: JSON.stringify(labels),
            data: JSON.stringify(data),
            past_questions
        });
    } catch (err) {
        console.error("getExamAnalytics Error:", err);
        res.status(500).send("Error loading analytics: " + err.message);
    }
};

exports.trackMaterialDownload = async (req, res) => {
    try {
        const material_id = req.params.id;
        const [material] = await require('../config/db').query('SELECT file_link FROM past_questions WHERE id = ?', [material_id]);
        if (material.length === 0) return res.status(404).send('Material not found');

        await require('../config/db').query('INSERT INTO material_downloads (user_id, material_id) VALUES (?, ?)', [req.session.user_id, material_id]);

        const file_link = material[0].file_link;
        const filePath = (file_link.startsWith('http') || file_link.startsWith('data:')) ? file_link : '/' + file_link;
        res.redirect(filePath);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};


