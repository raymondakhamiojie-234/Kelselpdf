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
            SELECT 
                pco.id,
                pco.programme_id,
                pco.course_code,
                COALESCE(c.course_title, pco.course_code) AS course_title,
                COALESCE(c.credit_units, 2) AS credit_units,
                pco.level, 
                pco.semester, 
                pco.course_status, 
                pco.curriculum_session, 
                pco.source_type, 
                pco.source_title, 
                pco.source_url, 
                pco.source_year, 
                pco.verification_status, 
                pco.last_verified,
                c.course_description,
                c.prerequisites
            FROM programme_course_offerings pco
            LEFT JOIN courses c ON TRIM(LOWER(pco.course_code)) = TRIM(LOWER(c.course_code))
            WHERE pco.programme_id = ?
            ORDER BY pco.level, pco.semester, pco.course_code
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
            SELECT 
                p.name as programme, 
                f.name as faculty, 
                pco.level, 
                pco.semester, 
                pco.course_code, 
                p.id as programme_id, 
                COALESCE(c.course_title, pco.course_code) as course_title, 
                COALESCE(c.credit_units, 2) as credit_units, 
                pco.course_status, 
                pco.source_type, 
                pco.source_title, 
                pco.source_url, 
                pco.source_year, 
                pco.verification_status, 
                pco.last_verified
            FROM programme_course_offerings pco
            JOIN programmes p ON pco.programme_id = p.id
            LEFT JOIN faculties f ON p.faculty_id = f.id
            LEFT JOIN courses c ON TRIM(LOWER(pco.course_code)) = TRIM(LOWER(c.course_code))
            ORDER BY pco.verification_status, p.name, pco.level
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("Error fetching admin verification list:", err);
        res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    }
};

exports.adminUpdateStatus = async (req, res) => {
    const { course_code, programme_id, new_status, notes } = req.body;
    const admin_id = (req.user && req.user.id) || req.session.user_id || (req.session.user && req.session.user.id) || 1;

    if (!course_code || !programme_id) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    try {
        // Fetch old value
        const [oldRows] = await db.query('SELECT verification_status FROM programme_course_offerings WHERE course_code = ? AND programme_id = ?', [course_code, programme_id]);
        if (oldRows.length === 0) {
            return res.status(404).json({ success: false, error: 'Course offering not found' });
        }
        const old_status = oldRows[0].verification_status;
        const target_status = new_status || old_status;

        // Update value
        await db.query(`
            UPDATE programme_course_offerings 
            SET verification_status = ?, last_verified = CURRENT_TIMESTAMP
            WHERE course_code = ? AND programme_id = ?
        `, [target_status, course_code, programme_id]);

        // Audit log
        await db.query(`
            INSERT INTO curriculum_audit_logs 
            (admin_id, entity_type, entity_id, action, old_value, new_value, notes)
            VALUES (?, 'course_offering', ?, 'UPDATE_STATUS', ?, ?, ?)
        `, [admin_id, `${programme_id}_${course_code}`, old_status, target_status, notes || '']);

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (err) {
        console.error("Error updating verification status:", err);
        res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    }
};
