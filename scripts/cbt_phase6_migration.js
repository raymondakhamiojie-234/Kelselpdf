require('dotenv').config();
const pool = require('../src/config/db');

async function migrate() {
    console.log("Starting CBT Engine Phase 6 Database Migration...");

    try {
        console.log("Creating cbt_session_analytics table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_session_analytics (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(100) NOT NULL REFERENCES cbt_exam_sessions(id) ON DELETE CASCADE,
                subject_id INT NOT NULL REFERENCES cbt_subjects(id) ON DELETE CASCADE,
                score INT DEFAULT 0,
                total_questions INT DEFAULT 0,
                accuracy_percentage DECIMAL(5,2) DEFAULT 0.00,
                UNIQUE(session_id, subject_id)
            );
        `);

        console.log("Phase 6 Migration completed successfully!");
    } catch (err) {
        console.error("Error during migration:", err);
    } finally {
        process.exit();
    }
}

migrate();
