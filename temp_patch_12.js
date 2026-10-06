const fs = require('fs');
let code = fs.readFileSync('views/admin/cbt/review.ejs', 'utf8');
code = code.replace(/<span class="badge-draft">/g, '<span class="badge badge-warning">');
fs.writeFileSync('views/admin/cbt/review.ejs', code);
console.log("Success");
