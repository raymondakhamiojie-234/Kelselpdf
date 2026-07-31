const pool = require('./src/config/db');
pool.query('SELECT * FROM questions LIMIT 5').then(res => {
    console.log(res[0]);
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
