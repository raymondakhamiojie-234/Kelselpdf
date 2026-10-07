require('dotenv').config();
const pool = require('./src/config/db');

async function checkTable() {
    try {
        const [rows] = await pool.query("SELECT * FROM cbt_practice_history LIMIT 1");
        console.log("Table exists! Rows:", rows);
    } catch(err) {
        console.error("Error:", err.message);
    } finally {
        process.exit();
    }
}
checkTable();
