const fs = require('fs');
let code = fs.readFileSync('views/cbt/exam_hub.ejs', 'utf8');
code = code.replace(`href="/practice?body=<%= body.id %>"`, `href="/practice/setup?body=<%= body.id %>"`);
fs.writeFileSync('views/cbt/exam_hub.ejs', code);
console.log("Success");
