const fs = require('fs');
const pdf = require('pdf-parse');

async function checkCS() {
    let dataBuffer = fs.readFileSync('temp_Computer_Science.pdf');
    let data = await pdf(dataBuffer);
    
    // Find courses
    const lines = data.text.split('\n');
    let courses = [];
    let inTable = false;
    for(let i=0; i<lines.length; i++) {
        let line = lines[i].trim();
        // Naive regex to match "CSC 201 Web Development 3 C"
        let match = line.match(/^([A-Z]{3,4}\s*\d{3})\s+(.+?)\s+(\d)\s+(C|R|E)$/i);
        if (match) {
            courses.push({
                code: match[1].trim(),
                title: match[2].trim(),
                units: match[3],
                status: match[4]
            });
        }
    }
    console.log(`Found ${courses.length} courses in CS via strict regex.`);
    if (courses.length > 0) {
        console.log(courses.slice(0, 5));
    }
}
checkCS();
