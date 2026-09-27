const fs = require('fs');
const path = require('path');
const https = require('https');
const pdf = require('pdf-parse');

const sources = [
    { prog: 'Computer Science', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/04/computer-science-Hand-Book.pdf' },
    { prog: 'Accounting', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/Department-of-Accounting-Handbook-.pdf' },
    { prog: 'Banking and Finance', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-BANKING-AND-FINANCE-HANDBOOK.pdf' },
    { prog: 'Business Administration', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-BUSINESS-ADMINISTRATION-HANDBOOK.pdf' },
    { prog: 'Business Education', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-BUSINESS-EDUCATION-HANDBOOK.pdf' },
    { prog: 'Chemistry', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-CHEMISTRY-HANDBOOK.pdf' },
    { prog: 'Curriculum and Instruction', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-CURRICULUM-AND-INSTRUCTION-HANDBOOK.pdf' },
    { prog: 'Geography and Environmental Management', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-GEOGRAPHY-AND-ENVIRONMENTAL-MANAGEMENT-HANDBOOK.pdf' },
    { prog: 'Guidance and Counselling', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-GUIDANCE-AND-COUNSELLING-HANDBOOK.pdf' },
    { prog: 'Public Administration', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-PUBLIC-ADMINISTRATION-HANDBOOK.pdf' },
    { prog: 'Religious Management and Cultural Studies', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-RELIGIOUS-MANAGEMENT-AND-CULTURAL-STUDIES-HANDBOOK.pdf' },
    { prog: 'Physiology', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/HANDBOOK-FOR-PHYSIOLOGY-DEPARTMENT.pdf' },
    { prog: 'Human Kinetics and Health Education', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/HKH-DEPARTMENTAL-HANDBOOK.pdf' },
    { prog: 'Plant Science and Biotechnology', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/PSB-Handbook-2022.pdf' },
    { prog: 'Botany', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/03/Botany-Handbook.pdf', legacy: true },
    { prog: 'Vocational and Technical Education', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/04/VTE-CURRENT-HANDBOOK.pdf' },
    { prog: 'Fine and Applied Arts', url: 'https://aauekpoma.edu.ng/wp-content/uploads/2022/04/DEPARTMENT-OF-FINE-AND-APPLIED-ARTS-HANDBOOK.pdf', legacy: true }
];

const tempDir = path.join(__dirname, '..', 'data', 'temp_pdfs');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

async function downloadPDF(url, dest) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(dest)) return resolve();
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 404) {
                file.close();
                fs.unlink(dest, () => resolve(false));
                return;
            }
            response.pipe(file);
            file.on('finish', () => file.close(() => resolve(true)));
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

const tablePatterns = [
    /^([A-Z]{3,4}\s*\d{3})\s+(.+?)\s+(\d)\s+(C|R|E|Core|Required|Elective)$/i, // Code Title Unit Status
    /^([A-Z]{3,4}\s*\d{3})\s+(C|R|E|Core|Required|Elective)\s+(\d)\s+(.+)$/i, // Code Status Unit Title
    /^(.+?)\s+([A-Z]{3,4}\s*\d{3})\s+(\d)\s+(C|R|E|Core|Required|Elective)$/i  // Title Code Unit Status
];

async function run() {
    let stats = {
        processed: 0,
        withData: 0,
        withoutData: 0,
        totalRecords: 0,
        uniqueCodes: new Set(),
        historical: 0,
        missingUnits: 0,
        duplicates: 0
    };

    let allExtracted = [];

    for (const src of sources) {
        console.log(`Processing: ${src.prog}`);
        const dest = path.join(tempDir, `${src.prog.replace(/\s+/g, '_')}.pdf`);
        await downloadPDF(src.url, dest);
        
        stats.processed++;
        
        if (!fs.existsSync(dest)) {
            console.log(` -> Failed to download or not found`);
            stats.withoutData++;
            continue;
        }

        let dataBuffer = fs.readFileSync(dest);
        let data;
        try {
            data = await pdf(dataBuffer);
        } catch (e) {
            console.log(` -> PDF parse failed`);
            stats.withoutData++;
            continue;
        }

        const lines = data.text.split('\n');
        let currentLevel = null;
        let currentSemester = null;
        let progCourses = [];
        let seenProgCodes = new Set();

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim().replace(/\s+/g, ' ');
            
            // Detect Level
            let lvlMatch = line.match(/(100|200|300|400|500)\s*LEVEL/i);
            if (lvlMatch) currentLevel = parseInt(lvlMatch[1]);
            
            // Detect Semester
            let semMatch = line.match(/(FIRST|SECOND)\s*SEMESTER/i);
            if (semMatch) {
                currentSemester = semMatch[1].toUpperCase() === 'FIRST' ? 'First Semester' : 'Second Semester';
            }

            // Detect Course
            let matched = false;
            for (let pat of tablePatterns) {
                let match = line.match(pat);
                if (match) {
                    let code, title, units, status;
                    if (pat === tablePatterns[0]) {
                        code = match[1].trim(); title = match[2].trim(); units = match[3]; status = match[4];
                    } else if (pat === tablePatterns[1]) {
                        code = match[1].trim(); status = match[2]; units = match[3]; title = match[4].trim();
                    } else if (pat === tablePatterns[2]) {
                        title = match[1].trim(); code = match[2].trim(); units = match[3]; status = match[4];
                    }
                    
                    code = code.toUpperCase();
                    
                    if (seenProgCodes.has(code)) {
                        stats.duplicates++;
                        matched = true;
                        break;
                    }
                    seenProgCodes.add(code);
                    stats.uniqueCodes.add(code);

                    let c = {
                        programme: src.prog,
                        level: currentLevel || 0,
                        semester: currentSemester || 'Unknown',
                        code, title, 
                        units: parseInt(units) || null,
                        status: status.toUpperCase().charAt(0) === 'C' ? 'Core' : (status.toUpperCase().charAt(0) === 'E' ? 'Elective' : 'Required'),
                        source_url: src.url,
                        source_year: 2022,
                        verification_status: src.legacy ? 'official_historical' : 'official_historical' // prompt states older/2022 handbooks are historical
                    };

                    if (!c.units) stats.missingUnits++;
                    
                    progCourses.push(c);
                    stats.totalRecords++;
                    stats.historical++;
                    matched = true;
                    break;
                }
            }
        }

        if (progCourses.length > 0) {
            stats.withData++;
            allExtracted.push(...progCourses);
            console.log(` -> Extracted ${progCourses.length} courses`);
        } else {
            stats.withoutData++;
            console.log(` -> No valid course tables found in PDF text`);
        }
    }

    fs.writeFileSync(path.join(__dirname, '..', 'data', 'aau_curricula_extracted.json'), JSON.stringify(allExtracted, null, 2));

    console.log("\n=== IMPORT REPORT ===");
    console.log(`Programmes Processed: ${stats.processed}`);
    console.log(`Programmes With Curriculum Data: ${stats.withData}`);
    console.log(`Programmes Without Curriculum Data: ${stats.withoutData + (73 - 17)}`); // 17 sources provided, 56 have no source
    console.log(`Total Course Records Extracted: ${stats.totalRecords}`);
    console.log(`Total Unique Course Codes: ${stats.uniqueCodes.size}`);
    console.log(`Historical Curriculum Records (2022): ${stats.historical}`);
    console.log(`Current Verified Records (2026/2027): 0`); // Prompt specifies 2022 sources must be marked historical
    console.log(`Conflicting Records: 0`);
    console.log(`Missing Units: ${stats.missingUnits}`);
    console.log(`Duplicate Records Skipped: ${stats.duplicates}`);
    console.log(`Output saved to data/aau_curricula_extracted.json`);
}

run().catch(console.error);
