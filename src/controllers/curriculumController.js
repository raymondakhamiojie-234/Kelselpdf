const db = require('../config/db');

exports.getProgrammes = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT p.id, p.name, p.academic_session, p.programme_status, p.curriculum_status, f.name as faculty_name 
            FROM programmes p
            LEFT JOIN faculties f ON p.faculty_id = f.id
            ORDER BY f.name, p.name
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("Error fetching programmes:", err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
};

exports.getCurriculum = async (req, res) => {
    const { programme_id } = req.params;
    try {
        const [rows] = await db.query(`
            SELECT c.*, pco.level, pco.semester, pco.course_status, pco.curriculum_session, pco.source_type, pco.source_title, pco.source_url, pco.source_year, pco.verification_status, pco.last_verified
            FROM programme_course_offerings pco
            JOIN courses c ON pco.course_code = c.course_code
            WHERE pco.programme_id = ?
            ORDER BY pco.level, pco.semester, c.course_code
        `, [programme_id]);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("Error fetching curriculum:", err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
};

exports.adminVerificationList = async (req, res) => {
    try {
        // Query to get all curriculum mappings with their verification status
        const [rows] = await db.query(`
            SELECT p.name as programme, f.name as faculty, pco.level, pco.semester, pco.course_code, c.course_title, c.credit_units, pco.source_type, pco.source_title, pco.source_url, pco.source_year, pco.verification_status, pco.last_verified
            FROM programme_course_offerings pco
            JOIN programmes p ON pco.programme_id = p.id
            LEFT JOIN faculties f ON p.faculty_id = f.id
            LEFT JOIN courses c ON pco.course_code = c.course_code
            ORDER BY pco.verification_status, p.name, pco.level
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("Error fetching admin verification list:", err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
};
