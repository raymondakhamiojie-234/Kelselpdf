const fs = require('fs');
const file = 'src/controllers/cbtPracticeController.js';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(/ORDER BY RAND\(\)/g, 'ORDER BY RANDOM()');
fs.writeFileSync(file, code);
console.log("Fixed RAND()");
