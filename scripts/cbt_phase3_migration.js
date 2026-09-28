require('dotenv').config();
const pool = require('../src/config/db');

async function migrate() {
    console.log("Starting CBT Engine Phase 3 Database Migration...");

    try {
        console.log("Creating cbt_bookmarks table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_bookmarks (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                question_id INT NOT NULL REFERENCES cbt_questions(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, question_id)
            );
        `);

        console.log("Creating cbt_practice_history table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_practice_history (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                exam_body_id INT REFERENCES cbt_exam_bodies(id) ON DELETE CASCADE,
                exam_id INT REFERENCES cbt_exams(id) ON DELETE CASCADE,
                subject_id INT REFERENCES cbt_subjects(id) ON DELETE CASCADE,
                year INT,
                questions_attempted INT DEFAULT 0,
                correct_answers INT DEFAULT 0,
                last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, subject_id, year)
            );
        `);

        console.log("Phase 3 Migration completed successfully!");
    } catch (err) {
        console.error("Error during migration:", err);
    } finally {
        process.exit();
    }
}

migrate();
