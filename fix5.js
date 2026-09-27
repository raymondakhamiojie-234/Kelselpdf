const fs = require('fs');
let c = fs.readFileSync('src/controllers/examController.js', 'utf8');

c = c.replace(
    /\[dept_id, "'%\"\" \+ dept_id \+ \"\"%'\", level\]/g,
    "[dept_id, '%\"' + dept_id + '\"%', level]"
);

fs.writeFileSync('src/controllers/examController.js', c);
console.log("Done");
