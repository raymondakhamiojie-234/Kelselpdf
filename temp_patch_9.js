const fs = require('fs');
const path = require('path');

const files = [
    'exam_bodies',
    'exams',
    'subjects',
    'topics',
    'questions',
    'mocks',
    'mock_create',
    'review',
    'import'
];

for (const name of files) {
    const filePath = path.join('views', 'admin', 'cbt', `${name}.ejs`);
    let code = fs.readFileSync(filePath, 'utf8');

    // Replace everything up to <div class="cbt-content">
    // Regex explanation:
    // <!DOCTYPE html> ... <div class="cbt-content">
    // We want to replace it with the new dashboard shell.
    const matchHead = code.match(/<!DOCTYPE html>[\s\S]*?<div class="cbt-content">/i);
    
    if (matchHead) {
        const replacementHead = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>CBT Admin - ${name}</title>
    <link rel="stylesheet" href="/style.css">
    <script src="/theme.js"></script>
</head>
<body class="dashboard-body">
    <%- include('./partials/sidebar', { active_page: 'cbt_${name}' }) %>
    <main class="main-content">`;
        code = code.replace(matchHead[0], replacementHead);
    }

    // Replace the closing tags
    const matchTail = code.match(/<\/div>\s*<\/div>\s*<\/body>\s*<\/html>/i);
    if (matchTail) {
        code = code.replace(matchTail[0], `    </main>\n</body>\n</html>`);
    }

    // Small fix for cbt_mock_create (make active_page cbt_mocks)
    if (name === 'mock_create') {
        code = code.replace(`active_page: 'cbt_mock_create'`, `active_page: 'cbt_mocks'`);
    }
    
    // Convert old tables to data-table
    code = code.replace(/<table style="width: 100%; border-collapse: collapse; margin-top: 2rem;">/g, '<table class="data-table">');
    // For exams.ejs
    code = code.replace(/<td><%= exam.exam_type %><\/td>/g, '<td><span class="badge badge-info"><%= exam.exam_type %></span></td>');
    code = code.replace(/<td><%= body.status %><\/td>/g, '<td><span class="badge badge-success"><%= body.status %></span></td>');

    fs.writeFileSync(filePath, code);
}
console.log("Refactoring complete");
