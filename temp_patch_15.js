const fs = require('fs');
const path = require('path');
const dir = 'src/controllers';

fs.readdirSync(dir).forEach(file => {
    if (file.endsWith('.js')) {
        const fullPath = path.join(dir, file);
        let code = fs.readFileSync(fullPath, 'utf8');
        if (code.includes('ORDER BY RAND()')) {
            code = code.replace(/ORDER BY RAND\(\)/g, 'ORDER BY RANDOM()');
            fs.writeFileSync(fullPath, code);
            console.log("Fixed RAND() in " + file);
        }
    }
});
