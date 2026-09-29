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
        const [subjects] = await pool.query('SELECT id, name FROM cbt_subjects ORDER BY name');
        res.render('admin/cbt/mock_create', { exams, subjects, active_page: 'cbt_mocks' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

exports.postCreateMock = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { exam_id, title, description, time_limit_minutes, is_premium, status, candidate_subject_selection, required_elective_count } = req.body;
        
        const [mockResult] = await connection.query(
            `INSERT INTO cbt_mocks (exam_id, title, description, time_limit_minutes, is_premium, status, candidate_subject_selection, required_elective_count) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                exam_id, 
                title, 
                description, 
                time_limit_minutes || 120, 
                is_premium === 'on', 
                status || 'DRAFT',
                candidate_subject_selection === 'on',
                required_elective_count || 0
            ]
        );

        const mockId = mockResult.insertId;

        if (req.body.subjects && Array.isArray(req.body.subjects)) {
            for (let i = 0; i < req.body.subjects.length; i++) {
                const subjId = req.body.subjects[i];
                const count = req.body.question_counts[i];
                const isCompulsory = Array.isArray(req.body.is_compulsory) ? (req.body.is_compulsory.includes(subjId) || req.body.is_compulsory[i] === 'on') : req.body.is_compulsory === 'on';

                if (subjId && count > 0) {
                    await connection.query(
                        'INSERT INTO cbt_mock_subjects (mock_id, subject_id, question_count, is_compulsory) VALUES (?, ?, ?, ?)',
                        [mockId, subjId, count, isCompulsory]
                    );
                }
            }
        }

        await connection.commit();
        res.redirect('/admin/cbt/mocks');
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send("Error creating mock: " + err.message);
    } finally {
        connection.release();
    }
};

exports.postToggleStatus = async (req, res) => {
    try {
        const { mock_id, status } = req.body;
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
