const pool = require('../config/db');

exports.getNotifications = async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const [notifications] = await pool.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', 
            [req.session.user_id]
        );
        res.json(notifications);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        if (!req.session.user_id) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE', 
            [req.session.user_id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
};
