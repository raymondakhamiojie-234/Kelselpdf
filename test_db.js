require('dotenv').config();
const mysql = require('mysql2/promise');

async function test() {
    const pool = mysql.createPool(process.env.DATABASE_URL);
    const [rows] = await pool.query('SELECT id, course_code, question_text FROM questions ORDER BY id DESC LIMIT 5');
    console.log(rows);
    pool.end();
}
test();
