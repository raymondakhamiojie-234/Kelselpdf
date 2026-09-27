require('dotenv').config();
const fs = require('fs');
const db = require('../src/config/db');

async function importAAUCurricula() {
    console.log("Starting AAU Curriculum Deep Import...");
    const data = JSON.parse(fs.readFileSync('data/aau/aau_2026_2027_programmes.json', 'utf8'));
    const extractedCourses = JSON.parse(fs.readFileSync('data/aau_curricula_extracted.json', 'utf8'));
    const programmes = data.programmes;
    
    // Explicit Programme Mapping (Extracted -> Official)
    const mapping = {
        'Computer Science': ['Computer Science'],
        'Chemistry': ['Chemistry [Pure]', 'Industrial Chemistry'],
        'Guidance and Counselling': ['Guidance & Counselling'],
        'Religious Management and Cultural Studies': ['Religious Management & Cultural Studies'],
        'Human Kinetics and Health Education': ['Human Kinetics Education', 'Health Education'],
        'Plant Science and Biotechnology': ['Plant Science & Biotechnology'],
        // 'Business Education', 'Curriculum and Instruction', 'Vocational and Technical Education' are Faculty departments not explicit 2026 programmes, but we can map them to related if needed.
        // For now, let's map Vocational and Technical Education to Technology Education
        'Vocational and Technical Education': ['Technology Education'],
        // Business Education could map to Accounting Education, Secretarial Education
        'Business Education': ['Accounting Education', 'Secretarial Education']
    };

    try {
        await db.query('BEGIN');
        let coursesImported = 0;
        let offeringsImported = 0;
        let errors = 0;

        for (const c of extractedCourses) {
            // Find target programmes based on explicit mapping
            let targetProgrammeNames = mapping[c.programme] || [];
            
            // If no explicit mapping, try exact or includes match
            if (targetProgrammeNames.length === 0) {
                const prog = programmes.find(p => p.name.toLowerCase() === c.programme.toLowerCase() || p.name.toLowerCase().includes(c.programme.toLowerCase()));
                if (prog) targetProgrammeNames.push(prog.name);
            }

            if (targetProgrammeNames.length === 0) {
                continue; // Cannot safely map this course to an official programme
            }

            for (const targetName of targetProgrammeNames) {
                // Find Programme ID
                const [pRows] = await db.query('SELECT id, curriculum_status FROM programmes WHERE name = ?', [targetName]);
                if (!pRows || pRows.length === 0) continue;
                const programmeId = pRows[0].id;
                const currentStatus = pRows[0].curriculum_status;

                // Ensure Course exists in KelselPDF global course table
                let [cRows] = await db.query('SELECT id FROM courses WHERE course_code = ?', [c.code]);
                if (!cRows || cRows.length === 0) {
                    await db.query(`
                        INSERT INTO courses (course_code, course_title, credit_units)
                        VALUES (?, ?, ?)
                        ON CONFLICT (course_code) DO NOTHING
                    `, [c.code, c.title, c.units]);
                    coursesImported++;
                }

                // Update Course if missing title
                await db.query(`UPDATE courses SET course_title = ?, credit_units = ? WHERE course_code = ? AND (course_title IS NULL OR credit_units IS NULL)`, [c.title, c.units, c.code]);

                // Insert Offering
                let [oRows] = await db.query('SELECT id FROM programme_course_offerings WHERE programme_id = ? AND course_code = ? AND semester = ?', [programmeId, c.code, c.semester]);
                if (!oRows || oRows.length === 0) {
                    await db.query(`
                        INSERT INTO programme_course_offerings 
                        (programme_id, course_code, level, semester, course_status, source_type, source_url, source_year, verification_status, course_description, prerequisites)
                        VALUES (?, ?, ?, ?, ?, 'official_aau_handbook', ?, ?, ?, ?, ?)
                    `, [programmeId, c.code, c.level, c.semester, c.status || 'Core', c.source_url || '', c.source_year || 2022, c.verification_status || 'official_historical', c.description || null, c.prerequisites || null]);
                    offeringsImported++;
                }

                // If programme curriculum status is still pending, update it to reflect we found historical data
                if (currentStatus === 'current_programme_curriculum_not_publicly_verified') {
                    await db.query(`UPDATE programmes SET curriculum_status = 'official_historical' WHERE id = ?`, [programmeId]);
                }
            }
        }

        console.log(`Imported ${coursesImported} new global courses.`);
        console.log(`Mapped ${offeringsImported} specific course offerings to programmes.`);

        await db.query('COMMIT');
        console.log("Import successfully committed.");

    } catch (err) {
        console.error("Error during import:", err);
        try { await db.query('ROLLBACK'); } catch(e){}
    }
}

importAAUCurricula();
