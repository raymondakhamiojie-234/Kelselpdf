const fs = require('fs');
const code = `
exports.getActivityLogs = async (req, res) => {
    try {
        const [exams] = await require('../config/db').query(\`
            SELECT u.full_name, u.email, e.course_code, e.score, e.created_at 
            FROM exam_attempts e 
            JOIN users u ON e.user_id = u.id 
            ORDER BY e.created_at DESC 
            LIMIT 100
        \`);
        
        const [ai_usage] = await require('../config/db').query(\`
            SELECT u.full_name, u.email, a.usage_date, a.exams_generated 
            FROM ai_usage_tracking a 
            JOIN users u ON a.user_id = u.id 
            ORDER BY a.usage_date DESC 
            LIMIT 100
        \`);
        
        const [downloads] = await require('../config/db').query(\`
            SELECT u.full_name, u.email, c.course_code, p.year, p.type, m.downloaded_at 
            FROM material_downloads m 
            JOIN users u ON m.user_id = u.id 
            JOIN past_questions p ON m.material_id = p.id 
            JOIN courses c ON p.course_id = c.id
            ORDER BY m.downloaded_at DESC 
            LIMIT 100
        \`);
        
        res.render('admin/activity', { user: req.session.user, exams, ai_usage, downloads, active_page: 'activity' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};
`;
fs.appendFileSync('src/controllers/adminController.js', code);
