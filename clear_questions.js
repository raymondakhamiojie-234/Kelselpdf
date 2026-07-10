const pool = require('./src/config/db');
pool.query('DELETE FROM questions')
    .then(() => {
        console.log('Cleared all questions');
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
