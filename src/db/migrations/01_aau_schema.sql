CREATE TABLE IF NOT EXISTS faculties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS programmes (
    id VARCHAR(50) PRIMARY KEY,
    faculty_id INTEGER REFERENCES faculties(id),
    name VARCHAR(255) NOT NULL,
    academic_session VARCHAR(50),
    programme_status VARCHAR(100),
    curriculum_status VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS course_title VARCHAR(255);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS credit_units INTEGER;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS course_description TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS prerequisites TEXT;

CREATE TABLE IF NOT EXISTS programme_course_offerings (
    id SERIAL PRIMARY KEY,
    programme_id VARCHAR(50) REFERENCES programmes(id),
    course_code VARCHAR(50) NOT NULL,
    level INTEGER NOT NULL,
    semester VARCHAR(50) NOT NULL,
    course_status VARCHAR(50) DEFAULT 'Unknown',
    curriculum_session VARCHAR(50),
    source_type VARCHAR(100),
    source_title VARCHAR(255),
    source_url TEXT,
    source_year INTEGER,
    verification_status VARCHAR(100),
    last_verified DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (programme_id, course_code, semester)
);
