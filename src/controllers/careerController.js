const pool = require('../config/db');

exports.getCareer = async (req, res) => {
    try {
        const [jobs] = await pool.query('SELECT * FROM career_jobs ORDER BY created_at DESC');
        res.render('career/hub', { jobs });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading Career Hub: " + err.message);
    }
};

exports.getPortfolio = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM student_portfolios WHERE user_id = ?', [req.session.user_id]);
        res.render('career/portfolio', { portfolio: rows[0] || null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading Portfolio: " + err.message);
    }
};

exports.postPortfolio = async (req, res) => {
    try {
        const { summary, github_url, linkedin_url, portfolio_url, skills } = req.body;
        const [rows] = await pool.query('SELECT id FROM student_portfolios WHERE user_id = ?', [req.session.user_id]);
        
        if (rows.length > 0) {
            await pool.query(
                'UPDATE student_portfolios SET summary=?, github_url=?, linkedin_url=?, portfolio_url=?, skills=? WHERE user_id=?',
                [summary, github_url, linkedin_url, portfolio_url, skills, req.session.user_id]
            );
        } else {
            await pool.query(
                'INSERT INTO student_portfolios (user_id, summary, github_url, linkedin_url, portfolio_url, skills) VALUES (?, ?, ?, ?, ?, ?)',
                [req.session.user_id, summary, github_url, linkedin_url, portfolio_url, skills]
            );
        }
        res.redirect('/career/portfolio');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error saving Portfolio: " + err.message);
    }
};
