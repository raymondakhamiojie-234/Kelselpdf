require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    await client.connect();
    const res = await client.query('SELECT * FROM cbt_practice_history LIMIT 1');
    console.log(res.rows);
  } catch (err) {
    console.error("CONNECTION ERROR:", err);
  } finally {
    await client.end();
  }
}
run();
