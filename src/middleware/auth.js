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

    // Global Payment Enforcement
    const user = req.session.user;
    const allowedWithoutPayment = ['/payment', '/payment_history', '/api/verify_payment', '/profile', '/logout', '/dashboard'];
    
    if (user.role !== 'admin' && !allowedWithoutPayment.includes(req.path)) {
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        
        const hasPaid = user.has_paid === 1;
        const isExpired = !user.expiry_date || new Date(user.expiry_date) <= currentDate;
        
        if (!hasPaid || isExpired) {
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ error: 'Subscription required or expired. Please renew your plan.' });
            }
            return res.redirect('/payment');
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
