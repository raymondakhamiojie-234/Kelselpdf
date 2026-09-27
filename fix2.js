const fs = require('fs');
let c = fs.readFileSync('src/controllers/examController.js', 'utf8');

c = c.replace(
  "((JSON_VALID(c.department_id) AND JSON_CONTAINS(c.department_id, JSON_QUOTE(?), '$')) OR \r\nc.department_id = ? OR c.shared_access_group = 'gst') \r\n               AND c.level_access <= ?", 
  "(c.department_id = ? OR c.department_id LIKE ? OR c.shared_access_group = 'gst') AND c.level_access <= ?"
);

c = c.replace(
  "((JSON_VALID(c.department_id) AND JSON_CONTAINS(c.department_id, JSON_QUOTE(?), '$')) OR \nc.department_id = ? OR c.shared_access_group = 'gst') \n               AND c.level_access <= ?", 
  "(c.department_id = ? OR c.department_id LIKE ? OR c.shared_access_group = 'gst') AND c.level_access <= ?"
);

c = c.replace(
  "[dept_id, \"'%\"\" + dept_id + \"\"%'\", level]", 
  "[dept_id, '%\"' + dept_id + '\"%', level]"
);

fs.writeFileSync('src/controllers/examController.js', c);
console.log("Done");
