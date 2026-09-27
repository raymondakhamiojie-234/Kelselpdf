const fs = require('fs');
const db = require('../src/config/db');

async function importAAU() {
    console.log("Starting AAU Programme & Curriculum Import...");
    const data = JSON.parse(fs.readFileSync('data/aau/aau_2026_2027_programmes.json', 'utf8'));
    const extractedCourses = JSON.parse(fs.readFileSync('data/aau_curricula_extracted.json', 'utf8'));
    
    const programmes = data.programmes;
    console.log(`Found ${programmes.length} programmes and ${extractedCourses.length} course offerings.`);

    const facultyNames = [...new Set(programmes.map(p => p.faculty))];
    const facultyMap = {};

    try {
        await db.query('BEGIN');

        // 1. Insert Faculties
        let facImported = 0;
        for (const fName of facultyNames) {
            const slug = fName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            let [facRows] = await db.query('SELECT id FROM faculties WHERE name = ?', [fName]);
            if (!facRows || facRows.length === 0) {
                const [res] = await db.query('INSERT INTO faculties (name, slug) VALUES (?, ?)', [fName, slug]);
                facultyMap[fName] = res.insertId;
                facImported++;
            } else {
                facultyMap[fName] = facRows[0].id;
            }
        }
        console.log(`Imported ${facImported} new faculties.`);

        // 2. Insert Programmes
        let progImported = 0;
        for (const p of programmes) {
            let [pRows] = await db.query('SELECT id FROM programmes WHERE id = ?', [p.id]);
            if (!pRows || pRows.length === 0) {
                await db.query(`
                    INSERT INTO programmes (id, faculty_id, name, academic_session, programme_status, curriculum_status)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [p.id, facultyMap[p.faculty], p.name, p.academic_session, p.programme_status, p.curriculum_status]);
                progImported++;
            }
        }
        console.log(`Imported ${progImported} programmes.`);

        // 3. Map Courses & Offerings
        let coursesImported = 0;
        let offeringsImported = 0;

        for (const c of extractedCourses) {
            // Find Programme ID by Name
            const prog = programmes.find(p => p.name.toLowerCase() === c.programme.toLowerCase() || p.name.toLowerCase().includes(c.programme.toLowerCase()));
            const programmeId = prog ? prog.id : null;
            if (!programmeId) continue;

            // Ensure Course exists in KelselPDF global course table
            let [cRows] = await db.query('SELECT id FROM courses WHERE course_code = ?', [c.code]);
            if (!cRows || cRows.length === 0) {
                await db.query(`
                    INSERT INTO courses (course_code, course_title, credit_units)
                    VALUES (?, ?, ?)
                `, [c.code, c.title, c.units]);
                coursesImported++;
            }

            // Insert Offering
            let [oRows] = await db.query('SELECT id FROM programme_course_offerings WHERE programme_id = ? AND course_code = ? AND semester = ?', [programmeId, c.code, c.semester]);
            if (!oRows || oRows.length === 0) {
                await db.query(`
                    INSERT INTO programme_course_offerings 
                    (programme_id, course_code, level, semester, course_status, source_type, source_url, source_year, verification_status)
                    VALUES (?, ?, ?, ?, ?, 'official_aau_handbook', ?, ?, ?)
                `, [programmeId, c.code, c.level, c.semester, c.status, c.source_url, c.source_year, c.verification_status]);
                offeringsImported++;
            }
        }

        console.log(`Imported ${coursesImported} unique global courses.`);
        console.log(`Mapped ${offeringsImported} specific course offerings to programmes.`);

        await db.query('COMMIT');
        console.log("Import successfully committed.");

    } catch (err) {
        console.error("Error during import:", err);
        try { await db.query('ROLLBACK'); } catch(e){}
    }
}

importAAU();
