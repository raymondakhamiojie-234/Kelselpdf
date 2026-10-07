require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    await client.connect();
    const res = await client.query(`
            SELECT h.*, s.name as subject_name, b.code as body_code
            FROM cbt_practice_history h
            JOIN cbt_subjects s ON h.subject_id = s.id
            JOIN cbt_exam_bodies b ON h.exam_body_id = b.id
            WHERE h.user_id = $1
            ORDER BY h.last_accessed DESC LIMIT 5
        `, [1]);
    console.log(res.rows);
  } catch (err) {
    console.error("QUERY ERROR:", err);
  } finally {
    await client.end();
  }
}
run();
