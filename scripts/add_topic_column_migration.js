require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  console.log("Running migration: ensuring 'topic' column exists in cbt_questions...");
  try {
    await client.connect();
    await client.query("ALTER TABLE cbt_questions ADD COLUMN IF NOT EXISTS topic VARCHAR(255);");
    console.log("Migration successful: 'topic' column verified in cbt_questions table.");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

run();
