const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { checkAuth } = require('../middleware/auth');

// Temporary Database Setup Route
router.get('/setup-db', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                link VARCHAR(255) DEFAULT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_materials (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                filename VARCHAR(255) NOT NULL,
                content TEXT,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        try {
            await pool.query('ALTER TABLE user_materials ADD COLUMN content TEXT');
        } catch (err) {
            // ignore if column already exists
        }
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ai_usage_tracking (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                usage_date DATE NOT NULL,
                exams_generated INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE (user_id, usage_date)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS whitelist_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                course_id INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS referral_links (
                id SERIAL PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                description VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS material_downloads (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                material_id INTEGER NOT NULL,
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                reference VARCHAR(255) NOT NULL,
                plan VARCHAR(50),
                amount NUMERIC(10, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        try {
            await pool.query('ALTER TABLE users ADD COLUMN referred_by_code VARCHAR(50) DEFAULT NULL');
        } catch (err) { }

        try {
            await pool.query('ALTER TABLE users ADD COLUMN expiry_date DATE DEFAULT NULL');
        } catch (err) { }

        try {
            await pool.query('ALTER TABLE users ADD COLUMN subscription_plan VARCHAR(50) DEFAULT \'none\'');
        } catch (err) { }

        try {
            await pool.query('ALTER TABLE users ADD COLUMN can_change_level BOOLEAN DEFAULT true');
        } catch (err) { }

        try {
            await pool.query('ALTER TABLE users ADD COLUMN account_locked BOOLEAN DEFAULT false');
        } catch (err) { }

        try {
            await pool.query('ALTER TABLE users ALTER COLUMN password TYPE VARCHAR(255)');
        } catch (err) { }

        res.send("Tables checked/setup. All columns and tables are ready!");
    } catch (err) {
        console.error(err);
        res.status(500).send("Setup Failed: " + err.message);
    }
});

router.get('/migrate-db', async (req, res) => {
    try {
        await pool.query('ALTER TABLE users ALTER COLUMN department_id TYPE VARCHAR(255)');
        await pool.query('ALTER TABLE courses ALTER COLUMN department_id TYPE VARCHAR(255)');
        res.send("Migration completed: department_id is now VARCHAR.");
    } catch (err) {
        res.send("Migration error: " + err.message);
    }
});

router.get('/debug-users', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check a specific user's status by email
router.get('/debug-user', async (req, res) => {
    try {
        const email = req.query.email;
        if (!email) return res.send("Please provide an email. Example: /debug-user?email=test@gmail.com");
        
        const [rows] = await pool.query("SELECT id, full_name, email, has_paid, subscription_plan, account_locked, expiry_date FROM users WHERE email = ?", [email]);
        
        if (rows.length === 0) {
            return res.send(`No account found for email: ${email}`);
        }
        
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Force fix a broken user (resets password to 12345678 and upgrades them)
router.get('/fix-user', async (req, res) => {
    try {
        const email = req.query.email;
        if (!email) return res.send("Please provide an email. Example: /fix-user?email=test@gmail.com");
        
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('12345678', 10);
        
        const date = new Date();
        date.setMonth(date.getMonth() + 6);
        const expiry_date = date.toISOString().split('T')[0];

        const [result] = await pool.query(
            "UPDATE users SET password = ?, has_paid = 1, subscription_plan = 'Full Premium', expiry_date = ?, can_change_level = 1, account_locked = 0 WHERE email = ?", 
            [hashedPassword, expiry_date, email]
        );
        
        if (result.affectedRows === 0) {
            return res.send(`No account found for email: ${email}`);
        }
        
        res.send(`Successfully fixed account for ${email}. They can now login with password: 12345678`);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/upgrade-admin', checkAuth, async (req, res) => {
    try {
        await pool.query("UPDATE users SET role = 'admin', has_paid = 1 WHERE id = ?", [req.session.user_id]);
        req.session.user.role = 'admin';
        res.send("You are now an admin. Go to <a href='/admin'>Admin Dashboard</a>");
    } catch (err) {
        res.send("Error: " + err.message);
    }
});

module.exports = router;
