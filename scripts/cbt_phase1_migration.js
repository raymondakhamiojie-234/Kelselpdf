require('dotenv').config();
const pool = require('../src/config/db');

async function migrate() {
    console.log("Starting CBT Engine Phase 1 Database Migration...");

    try {
        // We will create tables in order to respect foreign key constraints.

        console.log("Creating cbt_exam_bodies table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_exam_bodies (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(50) UNIQUE NOT NULL,
                description TEXT,
                logo VARCHAR(255),
                status VARCHAR(50) DEFAULT 'ACTIVE',
                website VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Creating cbt_exams table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_exams (
                id SERIAL PRIMARY KEY,
                exam_body_id INT NOT NULL REFERENCES cbt_exam_bodies(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(50) NOT NULL,
                description TEXT,
                duration INT, -- in minutes, optional default duration
                status VARCHAR(50) DEFAULT 'ACTIVE',
                instructions TEXT,
                scoring_model VARCHAR(50) DEFAULT 'STANDARD',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Creating cbt_subjects table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_subjects (
                id SERIAL PRIMARY KEY,
                exam_id INT NOT NULL REFERENCES cbt_exams(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(50),
                description TEXT,
                status VARCHAR(50) DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Creating cbt_papers table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_papers (
                id SERIAL PRIMARY KEY,
                subject_id INT NOT NULL REFERENCES cbt_subjects(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                paper_type VARCHAR(50) DEFAULT 'OBJECTIVE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Creating cbt_topics table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_topics (
                id SERIAL PRIMARY KEY,
                subject_id INT NOT NULL REFERENCES cbt_subjects(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        console.log("Creating cbt_subtopics table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_subtopics (
                id SERIAL PRIMARY KEY,
                topic_id INT NOT NULL REFERENCES cbt_topics(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Creating cbt_questions table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cbt_questions (
                id SERIAL PRIMARY KEY,
                exam_body_id INT REFERENCES cbt_exam_bodies(id) ON DELETE SET NULL,
                exam_id INT REFERENCES cbt_exams(id) ON DELETE SET NULL,
                subject_id INT NOT NULL REFERENCES cbt_subjects(id) ON DELETE CASCADE,
                paper_id INT REFERENCES cbt_papers(id) ON DELETE SET NULL,
                topic_id INT REFERENCES cbt_topics(id) ON DELETE SET NULL,
                subtopic_id INT REFERENCES cbt_subtopics(id) ON DELETE SET NULL,
                year INT,
                exam_series VARCHAR(100),
                question_number INT,
                question_text TEXT NOT NULL,
                option_a TEXT,
                option_b TEXT,
                option_c TEXT,
                option_d TEXT,
                option_e TEXT,
                correct_answer VARCHAR(10),
                explanation TEXT,
                difficulty VARCHAR(20) DEFAULT 'MEDIUM',
                question_type VARCHAR(50) DEFAULT 'MULTIPLE_CHOICE',
                marks DECIMAL(5,2) DEFAULT 1.0,
                source TEXT,
                source_url TEXT,
                source_type VARCHAR(50) DEFAULT 'UNKNOWN',
                license_status VARCHAR(50) DEFAULT 'PENDING_REVIEW',
                status VARCHAR(50) DEFAULT 'DRAFT',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Migration completed successfully!");
    } catch (err) {
        console.error("Error during migration:", err);
    } finally {
        process.exit();
    }
}

migrate();
