
exports.getDashboard = async (req, res) => {
    try {
        // Aggregate KPIs
        const [[{ total_questions }]] = await pool.query("SELECT COUNT(*) as total_questions FROM cbt_questions");
        const [[{ pending_review }]] = await pool.query("SELECT COUNT(*) as pending_review FROM cbt_questions WHERE status = 'DRAFT'");
        const [[{ total_mocks }]] = await pool.query("SELECT COUNT(*) as total_mocks FROM cbt_mocks");
        const [[{ total_candidates }]] = await pool.query("SELECT COUNT(DISTINCT user_id) as total_candidates FROM cbt_exam_sessions");
        
        // Recent Uploads / Review Queue snapshot
        const [recentDrafts] = await pool.query(`
            SELECT q.id, q.question_text, s.name as subject_name
            FROM cbt_questions q
            JOIN cbt_subjects s ON q.subject_id = s.id
            WHERE q.status = 'DRAFT'
            ORDER BY q.created_at DESC LIMIT 5
        `);

        // Exam Body Breakdown
        const [examStats] = await pool.query(`
            SELECT b.code, COUNT(DISTINCT q.id) as question_count
            FROM cbt_exam_bodies b
            LEFT JOIN cbt_exams e ON e.exam_body_id = b.id
            LEFT JOIN cbt_subjects s ON s.exam_id = e.id
            LEFT JOIN cbt_questions q ON q.subject_id = s.id
            GROUP BY b.code
        `);

        res.render('admin/cbt/dashboard', {
            active_page: 'cbt_dashboard',
            stats: {
                total_questions,
                pending_review,
                total_mocks,
                total_candidates
            },
            recentDrafts,
            examStats
        });
    } catch(err) {
        console.error(err);
        res.status(500).send("Error loading dashboard");
    }
};
const pool = require('../config/db');

// --- EXAM BODIES ---

exports.getExamBodies = async (req, res) => {
    try {
        const [bodies] = await pool.query('SELECT * FROM cbt_exam_bodies ORDER BY name ASC');
        res.render('admin/cbt/exam_bodies', { bodies, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading exam bodies: " + err.message);
    }
};

exports.postExamBody = async (req, res) => {
    const { name, code, description, website } = req.body;
    try {
        await pool.query(
            'INSERT INTO cbt_exam_bodies (name, code, description, website) VALUES (?, ?, ?, ?)',
            [name, code, description, website]
        );
        res.redirect('/admin/cbt/exam_bodies');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating exam body: " + err.message);
    }
};

// --- EXAMS ---

exports.getExams = async (req, res) => {
    try {
        const bodyId = req.query.body_id;
        let query = `
            SELECT e.*, b.name as body_name 
            FROM cbt_exams e
            JOIN cbt_exam_bodies b ON e.exam_body_id = b.id
        `;
        let params = [];
        
        if (bodyId) {
            query += ' WHERE e.exam_body_id = ?';
            params.push(bodyId);
        }
        query += ' ORDER BY e.name ASC';
        
        const [exams] = await pool.query(query, params);
        const [bodies] = await pool.query('SELECT * FROM cbt_exam_bodies ORDER BY name ASC');
        
        res.render('admin/cbt/exams', { exams, bodies, selected_body: bodyId, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading exams: " + err.message);
    }
};

exports.postExam = async (req, res) => {
    const { exam_body_id, name, code, description, duration } = req.body;
    try {
        await pool.query(
            'INSERT INTO cbt_exams (exam_body_id, name, code, description, duration) VALUES (?, ?, ?, ?, ?)',
            [exam_body_id, name, code, description, duration || null]
        );
        res.redirect('/admin/cbt/exams' + (exam_body_id ? '?body_id=' + exam_body_id : ''));
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating exam: " + err.message);
    }
};

// --- SUBJECTS ---

exports.getSubjects = async (req, res) => {
    try {
        const examId = req.query.exam_id;
        let query = `
            SELECT s.*, e.name as exam_name, b.name as body_name 
            FROM cbt_subjects s
            JOIN cbt_exams e ON s.exam_id = e.id
            JOIN cbt_exam_bodies b ON e.exam_body_id = b.id
        `;
        let params = [];
        
        if (examId) {
            query += ' WHERE s.exam_id = ?';
            params.push(examId);
        }
        query += ' ORDER BY s.name ASC';
        
        const [subjects] = await pool.query(query, params);
        const [exams] = await pool.query('SELECT id, name FROM cbt_exams ORDER BY name ASC');
        
        res.render('admin/cbt/subjects', { subjects, exams, selected_exam: examId, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading subjects: " + err.message);
    }
};

exports.postSubject = async (req, res) => {
    const { exam_id, name, code, description } = req.body;
    try {
        await pool.query(
            'INSERT INTO cbt_subjects (exam_id, name, code, description) VALUES (?, ?, ?, ?)',
            [exam_id, name, code, description]
        );
        res.redirect('/admin/cbt/subjects' + (exam_id ? '?exam_id=' + exam_id : ''));
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating subject: " + err.message);
    }
};

// --- TOPICS ---

exports.getTopics = async (req, res) => {
    try {
        const subjectId = req.query.subject_id;
        let query = `
            SELECT t.*, s.name as subject_name 
            FROM cbt_topics t
            JOIN cbt_subjects s ON t.subject_id = s.id
        `;
        let params = [];
        
        if (subjectId) {
            query += ' WHERE t.subject_id = ?';
            params.push(subjectId);
        }
        query += ' ORDER BY t.name ASC';
        
        const [topics] = await pool.query(query, params);
        const [subjects] = await pool.query('SELECT id, name FROM cbt_subjects ORDER BY name ASC');
        
        res.render('admin/cbt/topics', { topics, subjects, selected_subject: subjectId, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading topics: " + err.message);
    }
};

exports.postTopic = async (req, res) => {
    const { subject_id, name, description } = req.body;
    try {
        await pool.query(
            'INSERT INTO cbt_topics (subject_id, name, description) VALUES (?, ?, ?)',
            [subject_id, name, description]
        );
        res.redirect('/admin/cbt/topics' + (subject_id ? '?subject_id=' + subject_id : ''));
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating topic: " + err.message);
    }
};

// --- QUESTIONS ---

exports.getQuestions = async (req, res) => {
    try {
        const [questions] = await pool.query(`
            SELECT q.*, s.name as subject_name, e.name as exam_name
            FROM cbt_questions q
            LEFT JOIN cbt_subjects s ON q.subject_id = s.id
            LEFT JOIN cbt_exams e ON q.exam_id = e.id
            ORDER BY q.created_at DESC
            LIMIT 100
        `);
        const [subjects] = await pool.query('SELECT id, name FROM cbt_subjects ORDER BY name ASC');
        
        res.render('admin/cbt/questions', { questions, subjects, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading questions: " + err.message);
    }
};

exports.postQuestion = async (req, res) => {
    const { subject_id, question_text, option_a, option_b, option_c, option_d, option_e, correct_answer, explanation } = req.body;
    try {
        // Find the exam_id and exam_body_id from the subject
        const [subjects] = await pool.query(`
            SELECT s.exam_id, e.exam_body_id 
            FROM cbt_subjects s 
            JOIN cbt_exams e ON s.exam_id = e.id 
            WHERE s.id = ?
        `, [subject_id]);
        
        if (!subjects || subjects.length === 0) {
            return res.status(400).send("Invalid subject ID");
        }
        
        const exam_id = subjects[0].exam_id;
        const exam_body_id = subjects[0].exam_body_id;
        
        await pool.query(`
            INSERT INTO cbt_questions 
            (exam_body_id, exam_id, subject_id, question_text, option_a, option_b, option_c, option_d, option_e, correct_answer, explanation, license_status, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'KELSEL_ORIGINAL', 'PUBLISHED')
        `, [
            exam_body_id, exam_id, subject_id, question_text, 
            option_a || null, option_b || null, option_c || null, option_d || null, option_e || null, 
            correct_answer || null, explanation || null
        ]);
        
        res.redirect('/admin/cbt/questions');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating question: " + err.message);
    }
};

