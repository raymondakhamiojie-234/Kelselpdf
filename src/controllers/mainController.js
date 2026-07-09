const pool = require('../config/db');

exports.getIndex = (req, res) => {
    res.render('index');
};

exports.getPrivacy = (req, res) => {
    res.render('privacy');
};

exports.getTerms = (req, res) => {
    res.render('terms');
};

exports.getDashboard = async (req, res) => {
    try {
        const [userRows] = await pool.query('SELECT full_name, department_id, level FROM users WHERE id = ?', [req.session.user_id]);
        const user = userRows[0];

        if (!user) {
            return res.redirect('/logout');
        }

        const firstName = user.full_name ? user.full_name.split(' ')[0] : 'Student';
        res.render('acct/dashboard', { user, firstName });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};
