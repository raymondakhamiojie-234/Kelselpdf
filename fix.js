const fs = require('fs');
let c = fs.readFileSync('src/controllers/examController.js', 'utf8');

c = c.replace(/WHERE \(\(JSON_VALID\(c\.department_id\) AND JSON_CONTAINS\(c\.department_id, JSON_QUOTE\(\?\), '\$'\)\) OR \s*c\.department_id = \? OR c\.shared_access_group = 'gst'\) \s*AND c\.level_access <= \?/, 
  "WHERE (c.department_id = ? OR c.department_id LIKE ? OR c.shared_access_group = 'gst') AND c.level_access <= ?"
);

c = c.replace(/\[dept_id, "'%\"\" \+ dept_id \+ \"\"%'\", level\]/g, 
  "[dept_id, '%\"' + dept_id + '\"%', level]"
);

fs.writeFileSync('src/controllers/examController.js', c);
console.log("Done");
