require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// Database Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kelselpdf',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make session data available to all templates
app.use((req, res, next) => {
    res.locals.user_id = req.session.user_id;
    next();
});

// Authentication Middleware
const checkAuth = (req, res, next) => {
    if (!req.session.user_id) {
        return res.redirect('/login');
    }
    next();
};

// --- Routes ---

app.get('/', (req, res) => {
    res.render('index');
});

// Auth Routes
app.get('/login', (req, res) => {
    res.render('acct/login', { error: null });
});

app.post('/login', async (req, res) => {
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
        res.render('acct/login', { error: 'An error occurred' });
    }
});

app.get('/register', (req, res) => {
    res.render('acct/register', { error: null });
});

app.post('/register', async (req, res) => {
    const { full_name, lastname, email, password, department_id, level } = req.body;
    try {
        // Check if user exists
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.render('acct/register', { error: 'Email is already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert new user
        const [result] = await pool.query(
            `INSERT INTO users (full_name, lastname, email, password, department_id, level, role, has_paid, subscription_plan) 
             VALUES (?, ?, ?, ?, ?, ?, 'student', 0, 'none')`,
            [full_name, lastname, email, hashedPassword, parseInt(department_id), parseInt(level)]
        );
        
        req.session.user_id = result.insertId;
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.render('acct/register', { error: 'An error occurred during registration' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Protected Dashboard Route
app.get('/dashboard', checkAuth, async (req, res) => {
    try {
        const [userRows] = await pool.query('SELECT department_id, level FROM users WHERE id = ?', [req.session.user_id]);
        const user = userRows[0];

        if (!user) {
            return res.redirect('/logout');
        }

        // Fetch courses for the dropdown based on department (replicating PHP logic)
        const [courses] = await pool.query(
            `SELECT * FROM courses 
             WHERE (department_id = ? OR shared_access_group = 'gst') 
             AND level_access <= ?`,
            [user.department_id, user.level]
        );
        
        res.render('acct/dashboard', { courses });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Profile Route (GET)
app.get('/profile', requireAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
        res.render('acct/profile', { user: rows[0], success: '', error: '' });
    } catch (err) {
        res.render('acct/profile', { user: req.session.user, success: '', error: 'Database error' });
    }
});

// Profile Route (POST)
app.post('/profile', requireAuth, async (req, res) => {
    const { full_name, lastname, department_id, level } = req.body;
    try {
        await pool.query(
            'UPDATE users SET full_name = ?, lastname = ?, department_id = ?, level = ? WHERE id = ?',
            [full_name, lastname, department_id, level, req.session.user.id]
        );
        req.session.user.full_name = full_name; // update session
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
        res.render('acct/profile', { user: rows[0], success: 'Profile updated successfully!', error: '' });
    } catch (err) {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
        res.render('acct/profile', { user: rows[0], success: '', error: 'Error updating profile: ' + err.message });
    }
});

// Exam Materials Route (GET)
app.get('/exam_materials', requireAuth, async (req, res) => {
    try {
        const dept_id = req.session.user.department_id;
        const level = req.session.user.level;

        const query = `
            SELECT pq.*, c.course_code FROM past_questions pq 
            JOIN courses c ON pq.course_id = c.id 
            WHERE (c.department_id = ? OR c.shared_access_group = 'gst') 
            AND c.level_access <= ?
            ORDER BY c.course_code ASC, pq.year DESC
        `;
        const [materials] = await pool.query(query, [dept_id, level]);
        res.render('acct/exam_materials', { user: req.session.user, materials });
    } catch (err) {
        console.error(err);
        res.render('acct/exam_materials', { user: req.session.user, materials: [] });
    }
});

// Exam Take Route (GET)
app.get('/exam/take/:course', requireAuth, async (req, res) => {
    try {
        const course = req.params.course;
        const time_limit = parseInt(req.query.time) || 30;
        const question_limit = parseInt(req.query.questions) || 20;

        const [questions] = await pool.query(
            'SELECT id, question_text, option_a, option_b, option_c, option_d FROM questions WHERE course_code = ? ORDER BY RAND() LIMIT ?',
            [course, question_limit]
        );

        res.render('acct/take_exam', {
            user: req.session.user,
            course,
            time_limit,
            questions
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Exam Submit Route (POST)
app.post('/exam/submit', requireAuth, async (req, res) => {
    try {
        const course = req.body.course || 'Unknown';
        const total_questions = parseInt(req.body.total_questions) || 0;
        
        if (total_questions === 0) {
            return res.status(400).send("Invalid exam submission.");
        }

        let score = 0;
        const answered_ids = [];
        const user_answers = {};

        // Extract submitted answers from req.body
        for (const [key, val] of Object.entries(req.body)) {
            if (key.startsWith('q_')) {
                const q_id = parseInt(key.substring(2));
                answered_ids.push(q_id);
                user_answers[q_id] = val;
            }
        }

        if (answered_ids.length > 0) {
            const placeholders = answered_ids.map(() => '?').join(',');
            const [rows] = await pool.query(`SELECT id, correct_option FROM questions WHERE id IN (${placeholders})`, answered_ids);
            
            rows.forEach(row => {
                if (user_answers[row.id] && user_answers[row.id].toUpperCase() === row.correct_option.toUpperCase()) {
                    score++;
                }
            });
        }

        // Log attempt
        await pool.query(
            'INSERT INTO exam_attempts (user_id, course_code, score, total_questions) VALUES (?, ?, ?, ?)',
            [req.session.user.id, course, score, total_questions]
        );

        const percentage = Math.round((score / total_questions) * 100 * 10) / 10;
        let feedback = "";
        if (percentage >= 70) {
            feedback = "Excellent work! You have a solid grasp of this material.";
        } else if (percentage >= 50) {
            feedback = "Good job. With a bit more practice, you'll be perfect.";
        } else {
            feedback = "Keep practicing! Use the AI Tutor to review the areas you missed.";
        }

        res.render('acct/exam_result', {
            course,
            score,
            total_questions,
            percentage,
            feedback
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Exam Analytics Route (GET)
app.get('/exam/analytics', requireAuth, async (req, res) => {
    try {
        const user_id = req.session.user.id;
        const dept_id = req.session.user.department_id;
        const level = req.session.user.level;

        const [attempts] = await pool.query(
            'SELECT * FROM exam_attempts WHERE user_id = ? ORDER BY created_at DESC',
            [user_id]
        );

        // Group scores by course for Chart
        const chart_data = {};
        attempts.forEach(a => {
            const c = a.course_code;
            if (!chart_data[c]) {
                chart_data[c] = { total: 0, count: 0 };
            }
            const pct = (a.score / a.total_questions) * 100;
            chart_data[c].total += pct;
            chart_data[c].count++;
        });

        const labels = [];
        const data = [];
        for (const [course, stats] of Object.entries(chart_data)) {
            labels.push(course);
            data.push(Math.round((stats.total / stats.count) * 100) / 100);
        }

        // Fetch past questions
        const [past_questions] = await pool.query(
            `SELECT pq.*, c.course_code FROM past_questions pq 
             JOIN courses c ON pq.course_id = c.id 
             WHERE (c.department_id = ? OR c.shared_access_group = 'gst') 
             AND c.level_access <= ?`,
            [dept_id, level]
        );

        res.render('acct/exam_analytics', {
            user: req.session.user,
            attempts,
            labels: JSON.stringify(labels),
            data: JSON.stringify(data),
            past_questions
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Server Start
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
