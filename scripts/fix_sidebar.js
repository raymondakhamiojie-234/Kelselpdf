const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'views', 'admin', 'cbt');
const files = ['exam_bodies.ejs', 'exams.ejs', 'subjects.ejs', 'topics.ejs', 'questions.ejs', 'import.ejs', 'review.ejs'];

files.forEach(f => {
    let p = path.join(dir, f);
    if (!fs.existsSync(p)) return;
    let text = fs.readFileSync(p, 'utf8');
    
    // Extract everything before <div class="cbt-sidebar">
    let before = text.split('<div class="cbt-sidebar">')[0];
    
    // Extract everything after </div> that ends the sidebar.
    // The sidebar ends with </div> right before <div class="cbt-content">
    let after = text.substring(text.indexOf('<div class="cbt-content">'));
    
    let active = 'bodies';
    if(f === 'exams.ejs') active = 'exams';
    if(f === 'subjects.ejs') active = 'subjects';
    if(f === 'topics.ejs') active = 'topics';
    if(f === 'questions.ejs') active = 'questions';
    if(f === 'import.ejs') active = 'import';
    if(f === 'review.ejs') active = 'review';
    
    let newText = before + `        <%- include('partials/sidebar', { active: '${active}' }) %>\n        ` + after;
    fs.writeFileSync(p, newText, 'utf8');
});
console.log("Replaced sidebars");
