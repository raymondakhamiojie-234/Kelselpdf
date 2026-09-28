const pool = require('../config/db');

exports.getMocks = async (req, res) => {
    try {
        const [mocks] = await pool.query(`
            SELECT m.*, e.name as exam_name, e.code as exam_code 
            FROM cbt_mocks m
            JOIN cbt_exams e ON m.exam_id = e.id
            ORDER BY m.created_at DESC
        `);
        
        res.render('admin/cbt/mocks', { active: 'mocks', mocks });
    } catch(err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

exports.getCreateMock = async (req, res) => {
    try {
        const [exams] = await pool.query('SELECT * FROM cbt_exams WHERE status = ?', ['ACTIVE']);
        res.render('admin/cbt/mock_create', { active: 'mocks', exams });
    } catch(err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

exports.postCreateMock = async (req, res) => {
    try {
        const { exam_id, title, description, time_limit_minutes, is_premium, subject_ids, question_counts } = req.body;
        
        // Insert Mock
        const [result] = await pool.query(`
            INSERT INTO cbt_mocks (exam_id, title, description, time_limit_minutes, is_premium, status)
            VALUES (?, ?, ?, ?, ?, 'DRAFT')
            RETURNING id
        `, [exam_id, title, description, time_limit_minutes || 120, is_premium ? true : false]);

        const mockId = result[0] ? result[0].id : result.insertId;

        // Insert Subjects (Handle arrays)
        if (subject_ids && Array.isArray(subject_ids)) {
            for (let i = 0; i < subject_ids.length; i++) {
                if (subject_ids[i]) {
                    await pool.query(`
                        INSERT INTO cbt_mock_subjects (mock_id, subject_id, question_count)
                        VALUES (?, ?, ?)
                    `, [mockId, subject_ids[i], question_counts[i] || 40]);
                }
            }
        } else if (subject_ids) {
            // single subject
            await pool.query(`
                INSERT INTO cbt_mock_subjects (mock_id, subject_id, question_count)
                VALUES (?, ?, ?)
            `, [mockId, subject_ids, question_counts || 40]);
        }

        res.redirect('/admin/cbt/mocks');
    } catch(err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

exports.postToggleStatus = async (req, res) => {
    try {
        const { id, status } = req.body;
        await pool.query('UPDATE cbt_mocks SET status = ? WHERE id = ?', [status, id]);
        res.redirect('/admin/cbt/mocks');
    } catch(err) {
        console.error(err);
        res.status(500).send("Database Error");
    }
};

// API for fetching subjects when exam is selected
exports.getExamSubjectsAPI = async (req, res) => {
    try {
        const [subjects] = await pool.query('SELECT * FROM cbt_subjects WHERE exam_id = ? AND status = ?', [req.params.examId, 'ACTIVE']);
        res.json(subjects);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
};
