const fs = require('fs');
let code = fs.readFileSync('views/acct/partials/sidebar.ejs', 'utf8');

code = code.replace(`href="/cbt/setup"`, `href="/cbt"`);
code = code.replace(`<%= locals.active_page === 'cbt_mock' ? 'active' : '' %>`, `<%= (locals.active_page === 'cbt_mock' || locals.active_page === 'cbt_hub') ? 'active' : '' %>`);

fs.writeFileSync('views/acct/partials/sidebar.ejs', code);
console.log("Success");
