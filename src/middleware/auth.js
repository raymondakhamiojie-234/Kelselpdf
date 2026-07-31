const pool = require('../config/db');

const isApiRequest = (req) => {
    return req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1) || req.path.startsWith('/api/');
};

const checkAuth = async (req, res, next) => {
    if (!req.session.user_id) {
        if (isApiRequest(req)) {
            return res.status(401).json({ error: 'Unauthorized. Session expired.' });
        }
        const redirectUrl = encodeURIComponent(req.originalUrl);
        return res.redirect(`/login?redirectUrl=${redirectUrl}`);
    }
    
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user_id]);
        if (rows.length > 0) {
            const user = rows[0];
            req.session.user = user;
            
            // Check if account is locked by admin
            if (user.account_locked) {
                // Prevent infinite redirect loop if they are already going to payment
                const isPaymentRoute = req.originalUrl.startsWith('/payment') || req.originalUrl.startsWith('/api/verify_payment') || req.originalUrl.startsWith('/logout');
                if (!isPaymentRoute) {
                    return res.redirect('/payment?locked=true');
                }
            }

            // Check if user has paid
            if (!user.has_paid && user.role !== 'admin') {
                const isPaymentRoute = req.originalUrl.startsWith('/payment') || req.originalUrl.startsWith('/api/verify_payment') || req.originalUrl.startsWith('/logout');
                if (!isPaymentRoute) {
                    return res.redirect('/payment');
                }
            }
        } else {
            if (isApiRequest(req)) {
                return res.status(401).json({ error: 'Unauthorized. Session expired.' });
            }
            return res.redirect('/login');
        }
    } catch (error) {
        console.error("Session Auth Error:", error);
        if (isApiRequest(req)) {
            return res.status(401).json({ error: 'Unauthorized. Session expired.' });
        }
        return res.redirect('/login');
    }
    
    next();
};

const requireAdmin = async (req, res, next) => {
    if (!req.session.user_id) {
        if (isApiRequest(req)) {
            return res.status(401).json({ error: 'Unauthorized. Session expired.' });
        }
        return res.redirect('/admin/login');
    }
    try {
        const [rows] = await pool.query("SELECT role FROM users WHERE id = ?", [req.session.user_id]);
        if (rows.length === 0 || rows[0].role !== 'admin') {
            if (isApiRequest(req)) {
                return res.status(403).json({ error: 'Forbidden: Admins Only' });
            }
            return res.status(403).send("Forbidden: Admins Only");
        }
        next();
    } catch (error) {
        console.error(error);
        if (isApiRequest(req)) {
            return res.status(500).json({ error: 'Server Error' });
        }
        res.status(500).send("Server Error");
    }
};

module.exports = { checkAuth, requireAdmin };

