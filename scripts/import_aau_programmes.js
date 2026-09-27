const fs = require('fs');
const db = require('../src/config/db');

async function importAAU() {
    console.log("Starting AAU Programme Import...");
    const data = JSON.parse(fs.readFileSync('data/aau/aau_2026_2027_programmes.json', 'utf8'));
    const programmes = data.programmes;
    console.log(`Found ${programmes.length} programmes in JSON.`);

    // Extract unique faculties
    const facultyNames = [...new Set(programmes.map(p => p.faculty))];
    const facultyMap = {};

    try {
        await db.query('BEGIN'); // Using postgres transaction wrapper if available, or just ignore if not supported in mock

        // 1. Insert Faculties
        let facImported = 0;
        for (const fName of facultyNames) {
            const slug = fName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            // Check if exists
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
        let progDuplicates = 0;
        for (const p of programmes) {
            let [pRows] = await db.query('SELECT id FROM programmes WHERE id = ?', [p.id]);
            if (!pRows || pRows.length === 0) {
                await db.query(`
                    INSERT INTO programmes (id, faculty_id, name, academic_session, programme_status, curriculum_status)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    p.id,
                    facultyMap[p.faculty],
                    p.name,
                    p.academic_session,
                    p.programme_status,
                    p.curriculum_status
                ]);
                progImported++;
            } else {
                progDuplicates++;
            }
        }
        console.log(`Imported ${progImported} programmes. Skipped ${progDuplicates} duplicates.`);

        await db.query('COMMIT');
        console.log("Import successfully committed.");

    } catch (err) {
        console.error("Error during import:", err);
        try { await db.query('ROLLBACK'); } catch(e){}
    }
}

importAAU();
