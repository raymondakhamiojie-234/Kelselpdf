const fs = require("fs");
const path = require("path");

function fixQuotes(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, "utf8");
    
    // Fix '/skills" to "/skills"
    content = content.replace(/'\/skills"/g, '"/skills"');
    content = content.replace(/'\/admin\/skills"/g, '"/admin/skills"');
    content = content.replace(/'\/api\/skills"/g, '"/api/skills"');
    
    // Also fix '/skills' inside res.render if it was messed up
    // Wait, res.render('skills/ is fine.

    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Fixed ${filePath}`);
}

fixQuotes("server.js");
fixQuotes("views/acct/partials/sidebar.ejs");
fixQuotes("views/admin/manage_skills.ejs");
fixQuotes("views/skills/my_learning.ejs");
fixQuotes("views/skills/player.ejs");
fixQuotes("views/skills/certificate.ejs");
fixQuotes("views/career/hub.ejs");
