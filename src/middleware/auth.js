const pool = require('../config/db');

const checkAuth = async (req, res, next) => {
    if (!req.session.user_id) {
        return res.redirect('/login');
    }
    
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user_id]);
        if (rows.length > 0) {
            const user = rows[0];
            req.session.user = user;
            
            // Check if account is locked by admin
            if (user.account_locked) {
                // Prevent infinite redirect loop if they are already going to payment
                const isPaymentRoute = req.originalUrl.startsWith('/payment') || req.originalUrl.startsWith('/api/verify_payment');
                if (!isPaymentRoute) {
                    return res.redirect('/payment?locked=true');
                }
            }
        } else {
            return res.redirect('/login');
        }
    } catch (error) {
        console.error("Session Auth Error:", error);
        return res.redirect('/login');
    }
    
    next();
};

const requireAdmin = async (req, res, next) => {
    if (!req.session.user_id) {
        return res.redirect('/admin/login');
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
