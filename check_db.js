require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkDB() {
    const pool = mysql.createPool(process.env.DATABASE_URL);
    const [rows] = await pool.query('SELECT course_code, COUNT(*) as count FROM questions GROUP BY course_code');
    console.log(rows);
    
    // Also check first few rows
    const [q] = await pool.query('SELECT * FROM questions LIMIT 2');
    console.log(q);
    
    pool.end();
}

checkDB();
