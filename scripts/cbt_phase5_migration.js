require('dotenv').config();
const pool = require('../src/config/db');

async function migrate() {
    console.log("Starting CBT Engine Phase 5 Database Migration...");

    try {
        console.log("Creating cbt_mocks table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_mocks (
                id SERIAL PRIMARY KEY,
                exam_id INT NOT NULL REFERENCES cbt_exams(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                time_limit_minutes INT DEFAULT 120,
                attempt_limit INT DEFAULT NULL,
                is_premium BOOLEAN DEFAULT FALSE,
                status VARCHAR(50) DEFAULT 'DRAFT',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Creating cbt_mock_subjects table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_mock_subjects (
                id SERIAL PRIMARY KEY,
                mock_id INT NOT NULL REFERENCES cbt_mocks(id) ON DELETE CASCADE,
                subject_id INT NOT NULL REFERENCES cbt_subjects(id) ON DELETE CASCADE,
                question_count INT DEFAULT 40,
                UNIQUE(mock_id, subject_id)
            );
        `);

        console.log("Altering cbt_exam_sessions table to link to mocks...");
        await pool.query(`
            ALTER TABLE cbt_exam_sessions
            ADD COLUMN IF NOT EXISTS mock_id INT REFERENCES cbt_mocks(id) ON DELETE SET NULL;
        `);

        console.log("Phase 5 Migration completed successfully!");
    } catch (err) {
        console.error("Error during migration:", err);
    } finally {
        process.exit();
    }
}

migrate();
