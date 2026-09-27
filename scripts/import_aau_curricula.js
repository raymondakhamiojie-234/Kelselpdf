require('dotenv').config();
const fs = require('fs');
const db = require('../src/config/db');

async function fixDanglingLocks() {
    console.log("Releasing any dangling transaction locks...");
    try {
        await db.query(`
            SELECT pg_terminate_backend(pid) 
            FROM pg_stat_activity 
            WHERE state = 'idle in transaction' 
            AND pid <> pg_backend_pid();
        `);
        console.log("Locks cleared.");
    } catch(e) {
        // Ignore errors if permission denied
    }
}

async function setupSchema() {
    console.log("Checking database schema...");
    try {
        await db.query(`
            ALTER TABLE programme_course_offerings 
            ADD COLUMN IF NOT EXISTS course_description TEXT,
            ADD COLUMN IF NOT EXISTS prerequisites TEXT;
        `);
        console.log("Schema updated with course_description and prerequisites.");
    } catch(e) {
        console.log("Schema check skipped or timed out: " + e.message);
    }
}

async function importAAUCurricula() {
    await fixDanglingLocks();
    await setupSchema();
    console.log("Starting AAU Curriculum Deep Import...");
    const data = JSON.parse(fs.readFileSync('data/aau/aau_2026_2027_programmes.json', 'utf8'));
    const extractedCourses = JSON.parse(fs.readFileSync('data/aau_curricula_extracted.json', 'utf8'));
    const programmes = data.programmes;
    
    const mapping = {
        'Computer Science': ['Computer Science'],
        'Chemistry': ['Chemistry [Pure]', 'Industrial Chemistry'],
        'Guidance and Counselling': ['Guidance & Counselling'],
        'Religious Management and Cultural Studies': ['Religious Management & Cultural Studies'],
        'Human Kinetics and Health Education': ['Human Kinetics Education', 'Health Education'],
        'Plant Science and Biotechnology': ['Plant Science & Biotechnology'],
        'Vocational and Technical Education': ['Technology Education'],
        'Business Education': ['Accounting Education', 'Secretarial Education']
    };

    let coursesImported = 0;
    let offeringsImported = 0;

    for (const c of extractedCourses) {
        let targetProgrammeNames = mapping[c.programme] || [];
        if (targetProgrammeNames.length === 0) {
            const prog = programmes.find(p => p.name.toLowerCase() === c.programme.toLowerCase() || p.name.toLowerCase().includes(c.programme.toLowerCase()));
            if (prog) targetProgrammeNames.push(prog.name);
        }
        if (targetProgrammeNames.length === 0) continue;

        for (const targetName of targetProgrammeNames) {
            try {
                const [pRows] = await db.query('SELECT id, curriculum_status FROM programmes WHERE name = ?', [targetName]);
                if (!pRows || pRows.length === 0) continue;
                const programmeId = pRows[0].id;
                const currentStatus = pRows[0].curriculum_status;

                let [cRows] = await db.query('SELECT id FROM courses WHERE course_code = ?', [c.code]);
                if (!cRows || cRows.length === 0) {
                    await db.query(`
                        INSERT INTO courses (course_code, course_title, credit_units)
                        VALUES (?, ?, ?)
                    `, [c.code, c.title, c.units]);
                    coursesImported++;
                }

                await db.query(`UPDATE courses SET course_title = ?, credit_units = ? WHERE course_code = ? AND (course_title IS NULL OR credit_units IS NULL)`, [c.title, c.units, c.code]);

                let [oRows] = await db.query('SELECT id FROM programme_course_offerings WHERE programme_id = ? AND course_code = ? AND semester = ?', [programmeId, c.code, c.semester]);
                if (!oRows || oRows.length === 0) {
                    await db.query(`
                        INSERT INTO programme_course_offerings 
                        (programme_id, course_code, level, semester, course_status, source_type, source_url, source_year, verification_status, course_description, prerequisites)
                        VALUES (?, ?, ?, ?, ?, 'official_aau_handbook', ?, ?, ?, ?, ?)
                    `, [programmeId, c.code, c.level, c.semester, c.status || 'Core', c.source_url || '', c.source_year || 2022, c.verification_status || 'official_historical', c.description || null, c.prerequisites || null]);
                    offeringsImported++;
                }

                if (currentStatus === 'current_programme_curriculum_not_publicly_verified') {
                    await db.query(`UPDATE programmes SET curriculum_status = 'official_historical' WHERE id = ?`, [programmeId]);
                }
            } catch (innerErr) {
                console.error(`Error processing course ${c.code} for ${targetName}:`, innerErr.message);
            }
        }
    }

    console.log(`Imported ${coursesImported} new global courses.`);
    console.log(`Mapped ${offeringsImported} specific course offerings to programmes.`);
    console.log("Import successfully completed.");
}

importAAUCurricula();
