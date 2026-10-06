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

    // Remove lingering old sidebar closures
    code = code.replace(/<\/div>\s*<\/div>\s*<script>/g, '<script>');
    // If the file ends with </main></body></html> multiple times due to script error, fix it
    code = code.replace(/(<\/main>\s*<\/body>\s*<\/html>\s*)+/g, '</main>\n</body>\n</html>\n');

    fs.writeFileSync(filePath, code);
}
console.log("Cleanup complete");
