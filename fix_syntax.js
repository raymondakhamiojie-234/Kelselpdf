const fs = require("fs");
const path = require("path");

function fixAll(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, "utf8");
    
    // Fix href single quote start and double quote end
    content = content.replace(/href='\/skills\//g, 'href="/skills/');
    content = content.replace(/href='\/skills"/g, 'href="/skills"');
    content = content.replace(/href='\/admin\/skills/g, 'href="/admin/skills');

    // Fix res.redirect and similar backtick issues in server.js
    content = content.replace(/'\/skills([^'"`]*?)`/g, "`\/skills$1`");
    content = content.replace(/'\/admin\/skills([^'"`]*?)`/g, "`\/admin\/skills$1`");

    // Action attributes
    content = content.replace(/action='\/skills/g, 'action="/skills');
    
    fs.writeFileSync(filePath, content, "utf8");
}

fixAll("server.js");
fixAll("views/acct/partials/sidebar.ejs");
fixAll("views/admin/manage_skills.ejs");
fixAll("views/skills/my_learning.ejs");
fixAll("views/skills/player.ejs");
fixAll("views/skills/certificate.ejs");
fixAll("views/career/hub.ejs");
