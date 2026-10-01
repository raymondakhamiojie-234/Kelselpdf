const fs = require('fs');
let code = fs.readFileSync('src/routes/cbtAdminRoutes.js', 'utf8');

const target = `router.get('/admin/cbt', (req, res) => res.redirect('/admin/cbt/exam_bodies'));`;
const replacement = `router.get('/admin/cbt', cbtAdminController.getDashboard);`;

code = code.replace(target, replacement);

fs.writeFileSync('src/routes/cbtAdminRoutes.js', code);
console.log("Success");
