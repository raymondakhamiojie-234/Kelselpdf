const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { checkAuth } = require('../middleware/auth');

// Temporary Database Setup Route
router.get('/setup-db', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT UNSIGNED NOT NULL,
                message TEXT NOT NULL,
                link VARCHAR(255) DEFAULT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_materials (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT UNSIGNED NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                filename VARCHAR(255) NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        res.send("Tables checked/setup. The user_materials and notifications tables are now ready!");
    } catch (err) {
        console.error(err);
        res.status(500).send("Setup Failed: " + err.message);
    }
});

router.get('/migrate-db', async (req, res) => {
    try {
        await pool.query('ALTER TABLE users MODIFY COLUMN department_id VARCHAR(255)');
        await pool.query('ALTER TABLE courses MODIFY COLUMN department_id VARCHAR(255)');
        res.send("Migration completed: department_id is now VARCHAR.");
    } catch (err) {
        res.send("Migration error: " + err.message);
    }
});

router.get('/debug-users', async (req, res) => {
    try {
        const [columns] = await pool.query("SHOW COLUMNS FROM users");
        res.json(columns);
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
