const fs = require('fs');
let code = fs.readFileSync('src/routes/cbtAdminRoutes.js', 'utf8');

const target = `module.exports = router;\r\n\r\n\r\n// Phase 5: Mock Configurations\r\nrouter.get('/cbt/mocks', cbtMockAdminController.getMocks);\r\nrouter.get('/cbt/mocks/create', cbtMockAdminController.getCreateMock);\r\nrouter.post('/cbt/mocks/create', cbtMockAdminController.postCreateMock);\r\nrouter.post('/cbt/mocks/status', cbtMockAdminController.postToggleStatus);\r\nrouter.get('/api/cbt/exams/:examId/subjects', cbtMockAdminController.getExamSubjectsAPI);`;

const replacement = `// Phase 5: Mock Configurations\r\nrouter.get('/admin/cbt/mocks', cbtMockAdminController.getMocks);\r\nrouter.get('/admin/cbt/mocks/create', cbtMockAdminController.getCreateMock);\r\nrouter.post('/admin/cbt/mocks/create', cbtMockAdminController.postCreateMock);\r\nrouter.post('/admin/cbt/mocks/status', cbtMockAdminController.postToggleStatus);\r\nrouter.get('/api/cbt/exams/:examId/subjects', cbtMockAdminController.getExamSubjectsAPI);\r\n\r\nmodule.exports = router;`;

code = code.replace(target, replacement);

if (code.includes('module.exports = router;\n\n\n// Phase 5: Mock Configurations')) {
    const targetLF = `module.exports = router;\n\n\n// Phase 5: Mock Configurations\nrouter.get('/cbt/mocks', cbtMockAdminController.getMocks);\nrouter.get('/cbt/mocks/create', cbtMockAdminController.getCreateMock);\nrouter.post('/cbt/mocks/create', cbtMockAdminController.postCreateMock);\nrouter.post('/cbt/mocks/status', cbtMockAdminController.postToggleStatus);\nrouter.get('/api/cbt/exams/:examId/subjects', cbtMockAdminController.getExamSubjectsAPI);`;
    const replacementLF = `// Phase 5: Mock Configurations\nrouter.get('/admin/cbt/mocks', cbtMockAdminController.getMocks);\nrouter.get('/admin/cbt/mocks/create', cbtMockAdminController.getCreateMock);\nrouter.post('/admin/cbt/mocks/create', cbtMockAdminController.postCreateMock);\nrouter.post('/admin/cbt/mocks/status', cbtMockAdminController.postToggleStatus);\nrouter.get('/api/cbt/exams/:examId/subjects', cbtMockAdminController.getExamSubjectsAPI);\n\nmodule.exports = router;`;
    code = code.replace(targetLF, replacementLF);
}

fs.writeFileSync('src/routes/cbtAdminRoutes.js', code);
console.log("Fixed exports order");
