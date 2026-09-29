const fs = require('fs');
let code = fs.readFileSync('src/controllers/cbtEngineController.js', 'utf8');

const target = `if (mockInfo.length === 0) return res.status(404).send("Mock not found.");\r\n        const mock = mockInfo[0];`;

const replacement = `if (mockInfo.length === 0) return res.status(404).send("Mock not found.");\r\n        const mock = mockInfo[0];\r\n\r\n        // Enforce Premium Access\r\n        if (mock.is_premium) {\r\n            const user = req.session.user;\r\n            const isSubscribed = user && user.has_paid && (!user.expiry_date || new Date(user.expiry_date) > new Date());\r\n            if (!isSubscribed) {\r\n                return res.redirect('/payment?locked=true');\r\n            }\r\n        }`;

code = code.replace(target, replacement);

// Fallback for LF
if (!code.includes('Enforce Premium')) {
    const targetLF = `if (mockInfo.length === 0) return res.status(404).send("Mock not found.");\n        const mock = mockInfo[0];`;
    const replacementLF = targetLF + `\n\n        // Enforce Premium Access\n        if (mock.is_premium) {\n            const user = req.session.user;\n            const isSubscribed = user && user.has_paid && (!user.expiry_date || new Date(user.expiry_date) > new Date());\n            if (!isSubscribed) {\n                return res.redirect('/payment?locked=true');\n            }\n        }`;
    code = code.replace(targetLF, replacementLF);
}

fs.writeFileSync('src/controllers/cbtEngineController.js', code);
console.log(code.includes('Enforce Premium') ? "Success!" : "Failed!");
