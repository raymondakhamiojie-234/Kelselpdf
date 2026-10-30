const pool = require('../config/db');
const bcrypt = require('bcryptjs');

exports.getLogin = (req, res) => {
    const redirectUrl = req.query.redirectUrl || '';
    res.render('acct/login', { error: null, redirectUrl });
};

exports.postLogin = async (req, res) => {
    const { email, password, redirectUrl } = req.body;
    
    if (!email || !password) {
        return res.render('acct/login', { error: 'Invalid credentials. Please enter both email and password.', redirectUrl });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = rows[0];

        if (user && await bcrypt.compare(password, user.password)) {
            if (user.role === 'admin') {
                return res.render('acct/login', { error: 'Administrators must log in via the Admin Portal.', redirectUrl });
            }
            req.session.user_id = user.id;
            
            // Redirect to original URL if safe, else dashboard
            if (redirectUrl && redirectUrl.startsWith('/')) {
                res.redirect(redirectUrl);
            } else {
                res.redirect('/dashboard');
            }
        } else {
            res.render('acct/login', { error: 'Invalid email or password', redirectUrl });
        }
    } catch (err) {
        console.error(err);
        res.render('acct/login', { error: 'DB Error: ' + err.message, redirectUrl });
    }
};

exports.getRegister = (req, res) => {
    const ref = req.query.ref || '';
    res.render('acct/register', { error: null, ref });
};

exports.postRegister = async (req, res) => {
    const { full_name, lastname, email, password, department_id, level, referral_code } = req.body;
    
    if (!password || password.length < 8) {
        return res.render('acct/register', { error: 'Password must be at least 8 characters long.', ref: referral_code || '' });
    }

    try {
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.render('acct/register', { error: 'Email is already registered', ref: referral_code || '' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        let query = `INSERT INTO users (full_name, lastname, email, password, department_id, level, role, has_paid, subscription_plan) VALUES (?, ?, ?, ?, ?, ?, 'student', false, 'none')`;
        let params = [full_name, lastname, email, hashedPassword, department_id, parseInt(level)];

        if (referral_code && referral_code.trim() !== '') {
            query = `INSERT INTO users (full_name, lastname, email, password, department_id, level, role, has_paid, subscription_plan, referred_by_code) VALUES (?, ?, ?, ?, ?, ?, 'student', false, 'none', ?)`;
            params.push(referral_code.trim().toUpperCase());
        }

        const [result] = await pool.query(query, params);
        
        req.session.user_id = result.insertId;
        res.redirect('/payment');
    } catch (err) {
        console.error(err);
        res.render('acct/register', { error: 'DB Error: ' + err.message, ref: referral_code || '' });
    }
};

exports.getLogout = (req, res) => {
    req.session = null;
    res.redirect('/');
};

exports.getProfile = async (req, res) => {
    const userId = req.session.user_id || (req.session.user && req.session.user.id);
    if (!userId) return res.redirect('/login');
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        res.render('acct/profile', { user: rows[0] || req.session.user || {}, success: '', error: '' });
    } catch (err) {
        res.render('acct/profile', { user: req.session.user || {}, success: '', error: 'Database error' });
    }
};

exports.postProfile = async (req, res) => {
    const { full_name, lastname, department_id, level } = req.body;
    const userId = req.session.user_id || (req.session.user && req.session.user.id);
    if (!userId) return res.redirect('/login');
    try {
        const [userCheck] = await pool.query('SELECT can_change_level, level as current_level FROM users WHERE id = ?', [userId]);
        const can_change = userCheck[0] ? userCheck[0].can_change_level : false;
        
        let final_level = userCheck[0] ? userCheck[0].current_level : level;
        let final_can_change = can_change;
        
        if (can_change && level) {
            final_level = level;
            final_can_change = false;
        }

        await pool.query(
            'UPDATE users SET full_name = ?, lastname = ?, department_id = ?, level = ?, can_change_level = ? WHERE id = ?',
            [full_name, lastname, department_id, final_level, final_can_change, userId]
        );
        if (req.session.user) {
            req.session.user.full_name = full_name;
            req.session.user.level = final_level;
        }
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        res.render('acct/profile', { user: rows[0] || req.session.user || {}, success: 'Profile updated successfully!', error: '' });
    } catch (err) {
        console.error(err);
        let user = req.session.user || {};
        try {
            const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
            if (rows && rows.length > 0) user = rows[0];
        } catch (e) {}
        res.render('acct/profile', { user, success: '', error: 'Error updating profile: ' + err.message });
    }
};
