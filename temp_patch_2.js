const fs = require('fs');
let code = fs.readFileSync('src/controllers/cbtEngineController.js', 'utf8');

const target = `res.render('cbt/setup', { 
            active_page: 'cbt_mock',
            mocks
        });`;

const replacement = `const user = req.session.user;
        const isSubscribed = user && user.has_paid && (!user.expiry_date || new Date(user.expiry_date) > new Date());
        
        res.render('cbt/setup', { 
            active_page: 'cbt_mock',
            mocks,
            isSubscribed
        });`;

code = code.replace(target, replacement);

if (!code.includes('isSubscribed')) {
    const targetLF = `res.render('cbt/setup', {\n            active_page: 'cbt_mock',\n            mocks\n        });`;
    const replacementLF = `const user = req.session.user;\n        const isSubscribed = user && user.has_paid && (!user.expiry_date || new Date(user.expiry_date) > new Date());\n        \n        res.render('cbt/setup', { \n            active_page: 'cbt_mock',\n            mocks,\n            isSubscribed\n        });`;
    code = code.replace(targetLF, replacementLF);
}

fs.writeFileSync('src/controllers/cbtEngineController.js', code);
console.log(code.includes('isSubscribed') ? "Success 2!" : "Failed 2!");
