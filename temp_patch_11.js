const fs = require('fs');

const cssPath = 'public/style.css';
let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('.badge-published')) {
    css += "\n.badge-published { background: rgba(16, 185, 129, 0.1); color: #10b981; } /* alias for success */\n";
    fs.writeFileSync(cssPath, css);
}

// Clean up questions.ejs status badge
const qPath = 'views/admin/cbt/questions.ejs';
let qCode = fs.readFileSync(qPath, 'utf8');
qCode = qCode.replace(/<span class="badge badge-published"><%= q\.status %><\/span>/g, '<span class="badge <%= q.status === \'PUBLISHED\' ? \'badge-success\' : (q.status === \'DRAFT\' ? \'badge-warning\' : \'badge-gray\') %>"><%= q.status %></span>');
fs.writeFileSync(qPath, qCode);

console.log("Fixed status badges");
