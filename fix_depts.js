const fs = require('fs');

const registerHTML = fs.readFileSync('views/acct/register.ejs', 'utf-8');
const startTag = '<select name="department_id" required>';
const endTag = '</select>';

const startIdx = registerHTML.indexOf(startTag);
const endIdx = registerHTML.indexOf(endTag, startIdx) + endTag.length;
const fullSelect = registerHTML.substring(startIdx, endIdx);

const filesToUpdate = [
    'views/admin/questions.ejs',
    'views/admin/past_questions.ejs'
];

filesToUpdate.forEach(file => {
    let content = fs.readFileSync(file, 'utf-8');
    const fStartIdx = content.indexOf(startTag);
    const fEndIdx = content.indexOf(endTag, fStartIdx) + endTag.length;
    
    if (fStartIdx !== -1 && fEndIdx !== -1) {
        const newContent = content.substring(0, fStartIdx) + fullSelect + content.substring(fEndIdx);
        fs.writeFileSync(file, newContent);
        console.log(`Updated ${file}`);
    } else {
        console.log(`Could not find select block in ${file}`);
    }
});
