const pool = require('../config/db');
const fs = require('fs');
const csv = require('csv-parser');

exports.getAdmin = async (req, res) => {
    try {
        const [[{ count: users_count }]] = await pool.query('SELECT COUNT(id) AS count FROM users');
        const [[{ total: revenue }]] = await pool.query("SELECT SUM(amount) AS total FROM transactions WHERE status='success'");
        const [[{ count: active_subs }]] = await pool.query('SELECT COUNT(id) AS count FROM users WHERE has_paid = 1 AND expiry_date >= CURDATE()');
        const [[{ count: q_count }]] = await pool.query('SELECT COUNT(id) AS count FROM questions');
        const [[{ count: pq_count }]] = await pool.query('SELECT COUNT(id) AS count FROM past_questions');

        res.render('admin/index', {
            users_count,
            revenue: revenue || 0,
            active_subs,
            q_count,
            pq_count
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.getQuestions = (req, res) => {
    res.render('admin/questions', { success: '', error: '' });
};

exports.postQuestions = (req, res) => {
    if (!req.file) {
        return res.render('admin/questions', { success: '', error: 'Please upload a CSV file.' });
    }

    const results = [];
    let count = 0;
    
    fs.createReadStream(req.file.path)
        .pipe(csv(['course_code', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option'])) 
        .on('data', (data) => {
            if (data.course_code && data.course_code.toLowerCase() !== 'course_code') {
                results.push(data);
            }
        })
        .on('end', async () => {
            try {
                for (const row of results) {
                    if (row.course_code && row.question_text) {
                        await pool.query(
                            'INSERT INTO questions (course_code, question_text, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [(row.course_code||'').replace(/^\\uFEFF/, '').trim(), (row.question_text||'').replace(/^\\uFEFF/, '').trim(), (row.option_a||'').trim(), (row.option_b||'').trim(), (row.option_c||'').trim(), (row.option_d||'').trim(), (row.correct_option||'').trim()]
                        );
                        count++;
                    }
                }
                fs.unlinkSync(req.file.path); 
                res.render('admin/questions', { success: `Successfully imported ${count} questions!`, error: '' });
            } catch (err) {
                console.error(err);
                fs.unlinkSync(req.file.path);
                res.render('admin/questions', { success: '', error: 'Database error during import.' });
            }
        })
        .on('error', (err) => {
            console.error(err);
            res.render('admin/questions', { success: '', error: 'Error reading CSV file.' });
        });
};

exports.getPastQuestions = async (req, res) => {
    try {
        const [courses] = await pool.query('SELECT id, course_code FROM courses ORDER BY course_code ASC');
        res.render('admin/past_questions', { courses, success: '', error: '' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.postPastQuestions = async (req, res) => {
    try {
        const [courses] = await pool.query('SELECT id, course_code FROM courses ORDER BY course_code ASC');
        
        let course_code_input = req.body.course_code || '';
        course_code_input = course_code_input.toUpperCase().trim();
        const course_dept = req.body.department_id === 'gst' ? null : parseInt(req.body.department_id) || null;
        const shared_group = req.body.department_id === 'gst' ? 'gst' : 'general';
        const course_level = parseInt(req.body.level) || 100;
        
        let course_id;
        const [existingCourse] = await pool.query('SELECT id FROM courses WHERE course_code = ?', [course_code_input]);
        if (existingCourse.length > 0) {
            course_id = existingCourse[0].id;
            await pool.query('UPDATE courses SET department_id = COALESCE(department_id, ?), level_access = COALESCE(level_access, ?), shared_access_group = COALESCE(shared_access_group, ?) WHERE id = ?', [course_dept, course_level, shared_group, course_id]);
        } else {
            const [result] = await pool.query('INSERT INTO courses (course_code, department_id, level_access, shared_access_group) VALUES (?, ?, ?, ?)', [course_code_input, course_dept, course_level, shared_group]);
            course_id = result.insertId;
        }
        const year = req.body.year || '';
        const type = req.body.type || '';
        let file_link = req.body.file_link || '';
        let error = '';
        let success = '';

        if (req.file) {
            const fileBuffer = fs.readFileSync(req.file.path);
            file_link = 'data:' + req.file.mimetype + ';base64,' + fileBuffer.toString('base64');
            try { fs.unlinkSync(req.file.path); } catch(e) {}
        }

        if (!file_link) {
            error = "You must either upload a file or provide a URL link.";
        } else {
            await pool.query('ALTER TABLE past_questions MODIFY file_link LONGTEXT');
            await pool.query(
                'INSERT INTO past_questions (course_id, year, type, file_link) VALUES (?, ?, ?, ?)',
                [course_id, year, type, file_link]
            );
            success = "Past question added successfully!";
        }

        res.render('admin/past_questions', { courses, success, error });
    } catch (err) {
        console.error(err);
        const [courses] = await pool.query('SELECT id, course_code FROM courses ORDER BY course_code ASC').catch(()=>[[]]);
        res.render('admin/past_questions', { courses, success: '', error: 'Error: ' + err.message + ' | Stack: ' + String(err.stack).substring(0,200) });
    }
};

exports.getSubscriptions = async (req, res) => {
    try {
        const [subs] = await pool.query(`
            SELECT id, full_name, email, department_id, level, subscription_plan, expiry_date, has_paid 
            FROM users 
            ORDER BY expiry_date ASC
        `);
        res.render('admin/subscriptions', { subs });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.getPayments = async (req, res) => {
    try {
        const [payments] = await pool.query(`
            SELECT t.*, u.full_name, u.email 
            FROM transactions t 
            JOIN users u ON t.user_id = u.id 
            ORDER BY t.created_at DESC
        `);
        res.render('admin/payments', { payments });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.getSkills = async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT * FROM academy_categories ORDER BY name ASC');
        const [courses] = await pool.query('SELECT * FROM academy_courses ORDER BY created_at DESC');
        res.render('admin/manage_skills', { categories, courses });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading admin academy");
    }
};

exports.postSkillsCategory = async (req, res) => {
    try {
        const { name, slug } = req.body;
        await pool.query('INSERT INTO academy_categories (name, slug) VALUES (?, ?)', [name, slug]);
        res.redirect('/admin/skills');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating category");
    }
};

exports.postSkillsCourse = async (req, res) => {
    try {
        const { category_id, title, slug, description, instructor, duration_hours } = req.body;
        await pool.query(`
            INSERT INTO academy_courses (category_id, title, slug, description, instructor, duration_hours)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [category_id, title, slug, description, instructor, duration_hours || 0]);
        res.redirect('/admin/skills');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating course");
    }
};

exports.postSkillsCategoryDelete = async (req, res) => {
    try {
        await pool.query('DELETE FROM academy_categories WHERE id = ?', [req.body.id]);
        res.redirect('/admin/skills');
    } catch (err) {
        res.status(500).send("Error deleting category");
    }
};

exports.postSkillsCourseDelete = async (req, res) => {
    try {
        await pool.query('DELETE FROM academy_courses WHERE id = ?', [req.body.id]);
        res.redirect('/admin/skills');
    } catch (err) {
        res.status(500).send("Error deleting course");
    }
};
