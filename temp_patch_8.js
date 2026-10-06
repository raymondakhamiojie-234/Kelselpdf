const fs = require('fs');
let code = fs.readFileSync('src/routes/cbtEngineRoutes.js', 'utf8');

const target = `router.get('/cbt/setup', cbtEngineController.getMockSetup);`;
const replacement = `// Phase 10: Unified Student Hub
router.get('/cbt', cbtEngineController.getStudentHub);
router.get('/cbt/hub/:code', cbtEngineController.getExamHub);

// UI Routes
router.get('/cbt/setup', cbtEngineController.getMockSetup);`;

code = code.replace(target, replacement);

fs.writeFileSync('src/routes/cbtEngineRoutes.js', code);
console.log("Success");
