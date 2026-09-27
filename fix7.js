const fs = require('fs');
let c = fs.readFileSync('src/controllers/examController.js', 'utf8');

c = c.replace(
    /            \[dept_id, '%\"' \+ dept_id \+ '\"%', level\]\r?\n        res.render/g,
    "        const [materials] = await pool.query(query, [dept_id, '%\"' + dept_id + '\"%', level]);\n        res.render"
);

fs.writeFileSync('src/controllers/examController.js', c);
console.log("Done");
