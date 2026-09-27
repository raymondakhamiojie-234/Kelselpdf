const fs = require('fs');
let c = fs.readFileSync('src/controllers/examController.js', 'utf8');

c = c.replace(/WHERE \(\(JSON_VALID[\s\S]*?AND c\.level_access <= \?/, 
  "WHERE (c.department_id = ? OR c.department_id LIKE ? OR c.shared_access_group = 'gst') \n             AND c.level_access <= ?"
);

c = c.replace(/\[dept_id, "'%\"\" \+ dept_id \+ \"\"%'\", level\]/, 
  "[dept_id, '%\"' + dept_id + '\"%', level]"
);

fs.writeFileSync('src/controllers/examController.js', c);
console.log("Done");
