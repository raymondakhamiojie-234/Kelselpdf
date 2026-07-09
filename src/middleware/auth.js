const pool = require('../config/db');

const checkAuth = async (req, res, next) => {
    if (!req.session.user_id) {
        return res.redirect('/login');
    }
    if (!req.session.user) {
        try {
            const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user_id]);
            if (rows.length > 0) {
                req.session.user = rows[0];
            } else {
                return res.redirect('/login');
            }
        } catch (error) {
            console.error("Session Auth Error:", error);
            return res.redirect('/login');
        }
    }
    next();
};

const requireAdmin = async (req, res, next) => {
    if (!req.session.user_id) {
        return res.redirect('/login');
    }
    try {
        const [rows] = await pool.query("SELECT role FROM users WHERE id = ?", [req.session.user_id]);
        if (rows.length === 0 || rows[0].role !== 'admin') {
            return res.status(403).send("Forbidden: Admins Only");
        }
        next();
    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};

module.exports = { checkAuth, requireAdmin };
