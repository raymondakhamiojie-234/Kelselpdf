const fs = require("fs");
let content = fs.readFileSync("server.js", "utf8");

// We know the first dashboard is around line 440
// And the second one was wrongly inserted at line 1420
// Let's just find and replace the whole first dashboard block
const firstDashStart = content.indexOf("app.get('/dashboard', checkAuth");
const firstDashEnd = content.indexOf("});", firstDashStart) + 3;

// Remove the wrongly inserted one at 1420
const secondDashStart = content.indexOf("app.get('/dashboard', checkAuth", firstDashEnd);
if (secondDashStart > -1) {
    const secondDashEnd = content.indexOf("app.get('/community/forum/:id'", secondDashStart);
    content = content.slice(0, secondDashStart) + content.slice(secondDashEnd);
}

// Now replace the first dashboard block with the correct code
const correctCode = `app.get('/dashboard', checkAuth, async (req, res) => {
    try {
        const [userRows] = await pool.query('SELECT full_name, department_id, level FROM users WHERE id = ?', [req.session.user_id]);
        const user = userRows[0];

        if (!user) {
            return res.redirect('/logout');
        }

        const firstName = user.full_name ? user.full_name.split(' ')[0] : 'Student';
        res.render('acct/dashboard', { user, firstName });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Exam Setup Route
app.get('/exam/setup', checkAuth, async (req, res) => {
    try {
        const [userRows] = await pool.query('SELECT department_id, level FROM users WHERE id = ?', [req.session.user_id]);
        const user = userRows[0];

        if (!user) {
            return res.redirect('/logout');
        }

        const [courses] = await pool.query(
            "SELECT * FROM courses WHERE (department_id = ? OR shared_access_group = 'gst') AND level_access <= ?",
            [user.department_id, user.level]
        );
        
        res.render('acct/exam_setup', { courses });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});
`;

content = content.slice(0, firstDashStart) + correctCode + content.slice(firstDashEnd);
fs.writeFileSync("server.js", content, "utf8");
console.log("Fixed server.js");

// Move dashboard to exam_setup
if (fs.existsSync("views/acct/dashboard.ejs")) {
    fs.renameSync("views/acct/dashboard.ejs", "views/acct/exam_setup.ejs");
    console.log("Renamed dashboard.ejs to exam_setup.ejs");
}
