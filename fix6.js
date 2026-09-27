const fs = require('fs');
let c = fs.readFileSync('src/controllers/examController.js', 'utf8');

const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('dept_id + ""%"\'')) {
        lines[i] = "            [dept_id, '%\"' + dept_id + '\"%', level]";
    }
}

fs.writeFileSync('src/controllers/examController.js', lines.join('\n'));
console.log("Done");
