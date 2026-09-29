require('dotenv').config();
const pool = require('../src/config/db');

async function migrate() {
    console.log("Starting CBT Engine Phase 8 Database Migration...");

    try {
        console.log("Altering cbt_mocks table...");
        await pool.query(`
            ALTER TABLE cbt_mocks
            ADD COLUMN IF NOT EXISTS candidate_subject_selection BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS required_elective_count INT DEFAULT 0;
        `);

        console.log("Altering cbt_mock_subjects table...");
        await pool.query(`
            ALTER TABLE cbt_mock_subjects
            ADD COLUMN IF NOT EXISTS is_compulsory BOOLEAN DEFAULT TRUE;
        `);

        console.log("Phase 8 Migration completed successfully!");
    } catch (err) {
        console.error("Error during migration:", err);
    } finally {
        process.exit();
    }
}

migrate();
