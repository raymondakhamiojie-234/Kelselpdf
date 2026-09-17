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

router.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: sans-serif; padding: 2rem;">
        <h2>Database Migration</h2>
        <div id="log" style="background: #eee; padding: 1rem; height: 300px; overflow-y: scroll; font-family: monospace;"></div>
        <script>
          const tables = ${JSON.stringify(tables)};
          const logEl = document.getElementById('log');
          function log(msg) { logEl.innerHTML += msg + '<br>'; logEl.scrollTop = logEl.scrollHeight; }
          
          async function migrate() {
            for (let t of tables) {
              log('Migrating ' + t + '...');
              try {
                const res = await fetch('/api/migrate-data/run?table=' + t);
                const data = await res.json();
                if (data.error) log('<span style="color:red">Error on ' + t + ': ' + data.error + '</span>');
                else log('<span style="color:green">' + data.message + '</span>');
              } catch(e) {
                log('<span style="color:red">Network error on ' + t + ': ' + e.message + '</span>');
              }
            }
            log('<b>All done!</b>');
          }
          migrate();
        </script>
      </body>
    </html>
  `);
});

router.get('/run', async (req, res) => {
  const table = req.query.table;
  if (!table || !tables.includes(table)) return res.json({ error: 'Invalid table' });

  let mPool, pClient;
  try {
    mPool = mysql.createPool(process.env.AIVEN_URL);
    pClient = new Client({ connectionString: process.env.DATABASE_URL });
    await pClient.connect();

    const [rows] = await mPool.query(`SELECT * FROM ${table}`);
    if (rows.length === 0) return res.json({ message: `Table ${table} is empty. Skipped.` });

    const keys = Object.keys(rows[0]);
    const columns = keys.map(k => `"${k}"`).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    
    let inserted = 0;
    for (const row of rows) {
      const values = keys.map(k => {
         if (table === 'users' && (k === 'has_paid' || k === 'can_change_level' || k === 'account_locked')) return row[k] === 1;
         if (table === 'academy_progress' && k === 'completed') return row[k] === 1;
         if (table === 'academy_courses' && k === 'is_premium') return row[k] === 1;
         if (table === 'notifications' && k === 'is_read') return row[k] === 1;
         return row[k];
      });
      await pClient.query(`INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
      inserted++;
    }

    res.json({ message: `Successfully migrated ${inserted} rows into ${table}.` });
  } catch (error) {
    res.json({ error: error.message });
  } finally {
    if (mPool) await mPool.end();
    if (pClient) await pClient.end();
  }
});

module.exports = router;
