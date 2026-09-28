require('dotenv').config();
const pool = require('../src/config/db');

async function migrate() {
    console.log("Starting CBT Engine Phase 4 Database Migration...");

    try {
        console.log("Creating cbt_exam_sessions table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_exam_sessions (
                id VARCHAR(100) PRIMARY KEY,
                user_id INT NOT NULL,
                exam_body_id INT NOT NULL REFERENCES cbt_exam_bodies(id) ON DELETE CASCADE,
                exam_id INT NOT NULL REFERENCES cbt_exams(id) ON DELETE CASCADE,
                status VARCHAR(50) DEFAULT 'IN_PROGRESS',
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                duration_minutes INT DEFAULT 60,
                tab_switches INT DEFAULT 0,
                score DECIMAL(5,2) DEFAULT 0.00,
                total_questions INT DEFAULT 0
            );
        `);

        console.log("Creating cbt_session_questions table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_session_questions (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(100) NOT NULL REFERENCES cbt_exam_sessions(id) ON DELETE CASCADE,
                question_id INT NOT NULL REFERENCES cbt_questions(id) ON DELETE CASCADE,
                question_number INT NOT NULL,
                selected_option VARCHAR(10),
                is_correct BOOLEAN DEFAULT FALSE,
                UNIQUE(session_id, question_id)
            );
        `);

        console.log("Phase 4 Migration completed successfully!");
    } catch (err) {
        console.error("Error during migration:", err);
    } finally {
        process.exit();
    }
}

migrate();
