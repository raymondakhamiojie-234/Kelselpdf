const fs = require('fs');
let code = fs.readFileSync('src/controllers/cbtEngineController.js', 'utf8');

const target = `SELECT m.*, e.name as exam_name, b.name as body_name\r\n            FROM cbt_mocks m\r\n            JOIN cbt_exams e ON m.exam_id = e.id\r\n            JOIN cbt_exam_bodies b ON e.exam_body_id = b.id\r\n            WHERE m.status = ?\r\n            ORDER BY m.created_at DESC\r\n        \`, ['PUBLISHED']);`;

const replacement = `SELECT m.*, e.name as exam_name, b.name as body_name
            FROM cbt_mocks m
            JOIN cbt_exams e ON m.exam_id = e.id
            JOIN cbt_exam_bodies b ON e.exam_body_id = b.id
            WHERE m.status = ? \${req.query.body_id ? 'AND b.id = ?' : ''}
            ORDER BY m.created_at DESC
        \`, req.query.body_id ? ['PUBLISHED', req.query.body_id] : ['PUBLISHED']);`;

code = code.replace(target, replacement);

// LF fallback
if (!code.includes('req.query.body_id')) {
    const targetLF = `SELECT m.*, e.name as exam_name, b.name as body_name\n            FROM cbt_mocks m\n            JOIN cbt_exams e ON m.exam_id = e.id\n            JOIN cbt_exam_bodies b ON e.exam_body_id = b.id\n            WHERE m.status = ?\n            ORDER BY m.created_at DESC\n        \`, ['PUBLISHED']);`;
    code = code.replace(targetLF, replacement);
}

fs.writeFileSync('src/controllers/cbtEngineController.js', code);
console.log("Success");
