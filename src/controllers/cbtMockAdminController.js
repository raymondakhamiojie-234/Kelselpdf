const pool = require('../config/db');

exports.getMocks = async (req, res) => {
    try {
        const [mocks] = await pool.query(`
            SELECT m.*, e.name as exam_name 
            FROM cbt_mocks m
            JOIN cbt_exams e ON m.exam_id = e.id
            ORDER BY m.created_at DESC
        `);
        res.render('admin/cbt/mocks', { mocks, active_page: 'cbt_mocks' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

exports.getCreateMock = async (req, res) => {
    try {
        const [exams] = await pool.query('SELECT id, name FROM cbt_exams ORDER BY name');
        const [subjects] = await pool.query('SELECT id, name, exam_id FROM cbt_subjects ORDER BY name');
        res.render('admin/cbt/mock_create', { exams, subjects, active_page: 'cbt_mocks' });
    } catch (err) {
        console.error("Error loading mock create page:", err);
        res.status(500).send("Database Error");
    }
};

exports.postCreateMock = async (req, res) => {
    let connection;
    try {
        const { exam_id, title, description, time_limit_minutes, is_premium, status, candidate_subject_selection, required_elective_count } = req.body;
        
        if (!exam_id || !title) {
            return res.status(400).send("Target Exam and Mock Title are required.");
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [mockResult] = await connection.query(
            `INSERT INTO cbt_mocks (exam_id, title, description, time_limit_minutes, is_premium, status, candidate_subject_selection, required_elective_count) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                exam_id, 
                title.trim(), 
                description ? description.trim() : null, 
                parseInt(time_limit_minutes, 10) || 120, 
                is_premium === 'on' || is_premium === true || is_premium === 'true', 
                status || 'DRAFT',
                candidate_subject_selection === 'on' || candidate_subject_selection === true || candidate_subject_selection === 'true',
                parseInt(required_elective_count, 10) || 0
            ]
        );

        const mockId = mockResult.insertId;

        // Support both bracket and non-bracket field names, handling single vs array values
        let rawSubjects = req.body.subjects ?? req.body['subjects[]'] ?? [];
        let rawCounts = req.body.question_counts ?? req.body['question_counts[]'] ?? [];
        let rawCompulsory = req.body.is_compulsory ?? req.body['is_compulsory[]'] ?? [];

        const subjects = Array.isArray(rawSubjects) ? rawSubjects : (rawSubjects ? [rawSubjects] : []);
        const counts = Array.isArray(rawCounts) ? rawCounts : (rawCounts ? [rawCounts] : []);
        const compulsory = Array.isArray(rawCompulsory) ? rawCompulsory : (rawCompulsory ? [rawCompulsory] : []);
        const compulsorySet = new Set(compulsory.map(String));

        for (let i = 0; i < subjects.length; i++) {
            const subjId = parseInt(subjects[i], 10);
            const count = parseInt(counts[i], 10) || 0;
            const isCompulsory = compulsorySet.has(String(subjId));

            if (subjId && count > 0) {
                await connection.query(
                    'INSERT INTO cbt_mock_subjects (mock_id, subject_id, question_count, is_compulsory) VALUES (?, ?, ?, ?)',
                    [mockId, subjId, count, isCompulsory]
                );
            }
        }

        await connection.commit();
        res.redirect('/admin/cbt/mocks');
    } catch (err) {
        if (connection && connection.rollback) {
            await connection.rollback();
        }
        console.error("Error creating mock blueprint:", err);
        res.status(500).send("Error creating mock: " + err.message);
    } finally {
        if (connection && connection.release) {
            connection.release();
        }
    }
};

exports.postToggleStatus = async (req, res) => {
    try {
        const mock_id = req.body.mock_id || req.body.id;
        const status = req.body.status;
        await pool.query('UPDATE cbt_mocks SET status = ? WHERE id = ?', [status, mock_id]);
        res.redirect('/admin/cbt/mocks');
    } catch(err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

exports.getExamSubjectsAPI = async (req, res) => {
    try {
        const examId = req.params.examId;
        const [subjects] = await pool.query('SELECT id, name FROM cbt_subjects WHERE exam_id = ? ORDER BY name', [examId]);
        res.json(subjects);
    } catch(err) {
        console.error(err);
        res.status(500).json({error: "Database Error"});
    }
};
