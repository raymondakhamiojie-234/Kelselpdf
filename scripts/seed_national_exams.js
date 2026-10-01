require('dotenv').config();
const pool = require('../src/config/db');

async function seedExams() {
    console.log("Starting Examination Registry Seed...");

    try {
        const examBodies = [
            { name: 'West African Examinations Council', code: 'WAEC' },
            { name: 'National Examinations Council', code: 'NECO' },
            { name: 'National Business and Technical Examinations Board', code: 'NABTEB' },
            { name: 'Basic Education Certificate Examination', code: 'BECE' }
        ];

        for (const body of examBodies) {
            const [existing] = await pool.query('SELECT id FROM cbt_exam_bodies WHERE code = ?', [body.code]);
            let bodyId;
            
            if (existing.length === 0) {
                const [result] = await pool.query(
                    'INSERT INTO cbt_exam_bodies (name, code, status) VALUES (?, ?, ?)',
                    [body.name, body.code, 'ACTIVE']
                );
                bodyId = result.insertId;
                console.log(`Created Body: ${body.code}`);
            } else {
                bodyId = existing[0].id;
                console.log(`Body exists: ${body.code}`);
            }

            // Create default exams for the body
            let exams = [];
            if (body.code === 'WAEC') exams = [{name: 'WASSCE', code: 'WASSCE'}];
            if (body.code === 'NECO') exams = [{name: 'SSCE', code: 'SSCE'}];
            if (body.code === 'NABTEB') exams = [{name: 'NBC', code: 'NBC'}, {name: 'NTC', code: 'NTC'}];
            if (body.code === 'BECE') exams = [{name: 'JSSCE', code: 'JSSCE'}];

            for (const exam of exams) {
                const [existingExam] = await pool.query('SELECT id FROM cbt_exams WHERE exam_body_id = ? AND code = ?', [bodyId, exam.code]);
                if (existingExam.length === 0) {
                    await pool.query(
                        'INSERT INTO cbt_exams (exam_body_id, name, code, status) VALUES (?, ?, ?, ?)',
                        [bodyId, exam.name, exam.code, 'ACTIVE']
                    );
                    console.log(` - Created Exam: ${exam.name}`);
                } else {
                    console.log(` - Exam exists: ${exam.name}`);
                }
            }
        }

        console.log("Seeding completed successfully!");
    } catch (err) {
        console.error("Error during seeding:", err);
    } finally {
        process.exit();
    }
}

seedExams();
