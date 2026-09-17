const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { Client } = require('pg');

const tables = [
  'users',
  'academy_categories', 'academy_courses', 'academy_modules', 'academy_lessons',
  'academy_progress', 'ai_usage_tracking', 'career_jobs', 'career_applications',
  'courses', 'certificates', 'discussion_forums', 'discussion_topics', 'discussion_replies',
  'exam_attempts', 'questions', 'past_questions', 'referral_links', 'student_portfolios',
  'transactions', 'user_materials', 'whitelist_requests', 'notifications', 'material_downloads'
];

router.get('/', async (req, res) => {
  let mPool, pClient;
  try {
    // Connect to Aiven MySQL
    mPool = mysql.createPool(process.env.AIVEN_URL);
    
    // Connect to Supabase Postgres
    // Vercel environment will use the connection pooler URL or direct URL
    pClient = new Client({ connectionString: process.env.DATABASE_URL });
    await pClient.connect();

    let logs = [];
    
    for (const table of tables) {
      try {
        const [rows] = await mPool.query(`SELECT * FROM ${table}`);
        if (rows.length === 0) {
          logs.push(`Table ${table} is empty. Skipped.`);
          continue;
        }

        const keys = Object.keys(rows[0]);
        const columns = keys.map(k => `"${k}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        
        let inserted = 0;
        for (const row of rows) {
          const values = keys.map(k => {
             // Handle boolean tinyint conversions (MySQL tinyint(1) -> Postgres BOOLEAN)
             if (table === 'users' && (k === 'has_paid' || k === 'can_change_level' || k === 'account_locked')) {
                return row[k] === 1;
             }
             if (table === 'academy_progress' && k === 'completed') return row[k] === 1;
             if (table === 'academy_courses' && k === 'is_premium') return row[k] === 1;
             if (table === 'notifications' && k === 'is_read') return row[k] === 1;
             return row[k];
          });
          await pClient.query(`INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
          inserted++;
        }
        logs.push(`Successfully migrated ${inserted} rows into ${table}.`);
      } catch (err) {
        logs.push(`Error migrating ${table}: ${err.message}`);
      }
    }

    res.json({ success: true, logs });

  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (mPool) await mPool.end();
    if (pClient) await pClient.end();
  }
});

module.exports = router;
