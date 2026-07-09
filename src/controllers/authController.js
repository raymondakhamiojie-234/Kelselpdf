const pool = require('../config/db');
const bcrypt = require('bcryptjs');

exports.getLogin = (req, res) => {
    res.render('acct/login', { error: null });
};

exports.postLogin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = rows[0];

        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user_id = user.id;
            res.redirect('/dashboard');
        } else {
            res.render('acct/login', { error: 'Invalid email or password' });
        }
    } catch (err) {
        console.error(err);
        res.render('acct/login', { error: 'DB Error: ' + err.message });
    }
};

exports.getRegister = (req, res) => {
    res.render('acct/register', { error: null });
};

exports.postRegister = async (req, res) => {
    const { full_name, lastname, email, password, department_id, level } = req.body;
    try {
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.render('acct/register', { error: 'Email is already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await pool.query(
            `INSERT INTO users (full_name, lastname, email, password, department_id, level, role, has_paid, subscription_plan) 
             VALUES (?, ?, ?, ?, ?, ?, 'student', 0, 'none')`,
            [full_name, lastname, email, hashedPassword, department_id, parseInt(level)]
        );
        
        req.session.user_id = result.insertId;
        res.redirect('/payment');
    } catch (err) {
        console.error(err);
        res.render('acct/register', { error: 'DB Error: ' + err.message });
    }
};

exports.getLogout = (req, res) => {
    req.session = null;
    res.redirect('/');
};

exports.getProfile = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
        res.render('acct/profile', { user: rows[0], success: '', error: '' });
    } catch (err) {
        res.render('acct/profile', { user: req.session.user, success: '', error: 'Database error' });
    }
};

exports.postProfile = async (req, res) => {
    const { full_name, lastname, department_id, level } = req.body;
    try {
        const [userCheck] = await pool.query('SELECT can_change_level, level as current_level FROM users WHERE id = ?', [req.session.user.id]);
        const can_change = userCheck[0].can_change_level;
        
        let final_level = userCheck[0].current_level;
        let final_can_change = can_change;
        
        if (can_change && level) {
            final_level = level;
            final_can_change = 0;
        }

        await pool.query(
            'UPDATE users SET full_name = ?, lastname = ?, department_id = ?, level = ?, can_change_level = ? WHERE id = ?',
            [full_name, lastname, department_id, final_level, final_can_change, req.session.user.id]
        );
        req.session.user.full_name = full_name;
        req.session.user.level = final_level;
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
        res.render('acct/profile', { user: rows[0], success: 'Profile updated successfully!', error: '' });
    } catch (err) {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
        res.render('acct/profile', { user: rows[0], success: '', error: 'Error updating profile: ' + err.message });
    }
};
