const fs = require("fs");
const path = require("path");

function replaceInFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, "utf8");
    
    // Replace routes and view paths
    content = content.replace(/['"`]\/academy/g, "'/skills");
    content = content.replace(/['"`]\/admin\/academy/g, "'/admin/skills");
    content = content.replace(/['"`]\/api\/academy/g, "'/api/skills");
    
    // Replace render paths
    content = content.replace(/res\.render\(['"`]academy\//g, "res.render('skills/");
    content = content.replace(/res\.render\(['"`]admin\/manage_academy['"`]/g, "res.render('admin/manage_skills'");

    // Replace hrefs
    content = content.replace(/href=["']\/academy/g, 'href="/skills');
    content = content.replace(/href=["']\/admin\/academy/g, 'href="/admin/skills');

    // Make sure we keep db tables intact (do not replace academy_courses, etc)
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Updated ${filePath}`);
}

replaceInFile("server.js");
replaceInFile("views/acct/partials/sidebar.ejs");
replaceInFile("views/admin/dashboard.ejs"); // if links exist
replaceInFile("views/admin/manage_skills.ejs");
replaceInFile("views/skills/hub.ejs");
replaceInFile("views/skills/my_learning.ejs");
replaceInFile("views/skills/player.ejs");
replaceInFile("views/skills/certificate.ejs");
