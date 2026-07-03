require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });
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

// Admin Middleware
const requireAdmin = async (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/dashboard');
    }
    next();
};

// Admin Dashboard Route (GET)
app.get('/admin', requireAdmin, async (req, res) => {
    try {
        const [[{ count: users_count }]] = await pool.query('SELECT COUNT(id) AS count FROM users');
        const [[{ total: revenue }]] = await pool.query("SELECT SUM(amount) AS total FROM transactions WHERE status='success'");
        const [[{ count: active_subs }]] = await pool.query('SELECT COUNT(id) AS count FROM users WHERE has_paid = 1 AND expiry_date >= CURDATE()');
        const [[{ count: q_count }]] = await pool.query('SELECT COUNT(id) AS count FROM questions');
        const [[{ count: pq_count }]] = await pool.query('SELECT COUNT(id) AS count FROM past_questions');

        res.render('admin/index', {
            users_count,
            revenue: revenue || 0,
            active_subs,
            q_count,
            pq_count
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Admin Questions Route (GET)
app.get('/admin/questions', requireAdmin, (req, res) => {
    res.render('admin/questions', { success: '', error: '' });
});

// Admin Questions Route (POST)
app.post('/admin/questions', requireAdmin, upload.single('csv_file'), (req, res) => {
    if (!req.file) {
        return res.render('admin/questions', { success: '', error: 'Please upload a CSV file.' });
    }

    const results = [];
    let count = 0;
    
    fs.createReadStream(req.file.path)
        .pipe(csv(['course_code', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option'])) // Provide headers since first row is skipped
        .on('data', (data) => {
            // Skip header if it exists
            if (data.course_code && data.course_code.toLowerCase() !== 'course_code') {
                results.push(data);
            }
        })
        .on('end', async () => {
            try {
                for (const row of results) {
                    if (row.course_code && row.question_text) {
                        await pool.query(
                            'INSERT INTO questions (course_code, question_text, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [row.course_code.trim(), row.question_text.trim(), row.option_a.trim(), row.option_b.trim(), row.option_c.trim(), row.option_d.trim(), row.correct_option.trim()]
                        );
                        count++;
                    }
                }
                fs.unlinkSync(req.file.path); // Clean up uploaded file
                res.render('admin/questions', { success: `Successfully imported ${count} questions!`, error: '' });
            } catch (err) {
                console.error(err);
                fs.unlinkSync(req.file.path);
                res.render('admin/questions', { success: '', error: 'Database error during import.' });
            }
        })
        .on('error', (err) => {
            console.error(err);
            res.render('admin/questions', { success: '', error: 'Error reading CSV file.' });
        });
});

// Admin Past Questions Route (GET)
app.get('/admin/past_questions', requireAdmin, async (req, res) => {
    try {
        const [courses] = await pool.query('SELECT id, course_code FROM courses ORDER BY course_code ASC');
        res.render('admin/past_questions', { courses, success: '', error: '' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Admin Past Questions Route (POST)
app.post('/admin/past_questions', requireAdmin, upload.single('pq_file'), async (req, res) => {
    try {
        const [courses] = await pool.query('SELECT id, course_code FROM courses ORDER BY course_code ASC');
        const course_id = parseInt(req.body.course_id);
        const year = req.body.year;
        const type = req.body.type;
        let file_link = req.body.file_link || '';
        let error = '';
        let success = '';

        if (req.file) {
            const uploadDir = path.join(__dirname, 'public', 'uploads', 'past_questions');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const filename = Date.now() + '_' + req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
            const targetPath = path.join(uploadDir, filename);
            fs.renameSync(req.file.path, targetPath);
            file_link = 'uploads/past_questions/' + filename;
        }

        if (!file_link) {
            error = "You must either upload a file or provide a URL link.";
        } else {
            await pool.query(
                'INSERT INTO past_questions (course_id, year, type, file_link) VALUES (?, ?, ?, ?)',
                [course_id, year, type, file_link]
            );
            success = "Past question added successfully!";
        }

        res.render('admin/past_questions', { courses, success, error });
    } catch (err) {
        console.error(err);
        const [courses] = await pool.query('SELECT id, course_code FROM courses ORDER BY course_code ASC');
        res.render('admin/past_questions', { courses, success: '', error: 'Server error processing upload.' });
    }
});

// Admin Subscriptions Route (GET)
app.get('/admin/subscriptions', requireAdmin, async (req, res) => {
    try {
        const [subs] = await pool.query(`
            SELECT id, full_name, email, department_id, level, subscription_plan, expiry_date, has_paid 
            FROM users 
            ORDER BY expiry_date ASC
        `);
        res.render('admin/subscriptions', { subs });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Admin Payments Route (GET)
app.get('/admin/payments', requireAdmin, async (req, res) => {
    try {
        const [payments] = await pool.query(`
            SELECT t.*, u.full_name, u.email 
            FROM transactions t 
            JOIN users u ON t.user_id = u.id 
            ORDER BY t.created_at DESC
        `);
        res.render('admin/payments', { payments });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Student Payment History Route (GET)
app.get('/payment_history', requireAuth, async (req, res) => {
    try {
        const [transactions] = await pool.query(
            'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC',
            [req.session.user.id]
        );
        res.render('acct/payment_history', { transactions });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Student Payment Route (GET)
app.get('/payment', requireAuth, (req, res) => {
    res.render('acct/payment', { user: req.session.user });
});

// Verify Payment API Route (POST)
app.post('/api/verify_payment', requireAuth, async (req, res) => {
    try {
        const reference = req.body.reference;
        const plan = req.body.plan || 'premium';
        
        if (!reference) {
            return res.json({ status: 'error', message: 'No reference supplied' });
        }

        // We will use native fetch (available in Node 18+)
        const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            method: 'GET',
            headers: {
                "Authorization": "Bearer sk_test_cf6c6d149cc80889c10fd94552cc29e8e500b2c3",
                "Cache-Control": "no-cache"
            }
        });

        const tranx = await response.json();
        
        if (!tranx.status || tranx.data.status !== 'success') {
            return res.json({ status: 'error', message: 'Payment verification failed on Paystack.' });
        }

        const user_id = req.session.user.id;
        let expiry_date;
        let plan_name;

        if (plan === 'full_premium') {
            const date = new Date();
            date.setMonth(date.getMonth() + 6);
            expiry_date = date.toISOString().split('T')[0];
            plan_name = 'Full Premium';
        } else {
            const date = new Date();
            date.setMonth(date.getMonth() + 3);
            expiry_date = date.toISOString().split('T')[0];
            plan_name = 'Premium';
        }

        await pool.query(
            'UPDATE users SET has_paid = 1, expiry_date = ?, subscription_plan = ? WHERE id = ?',
            [expiry_date, plan_name, user_id]
        );

        const amount_paid = tranx.data.amount ? (tranx.data.amount / 100) : 0;
        await pool.query(
            'INSERT INTO transactions (user_id, reference, plan, amount) VALUES (?, ?, ?, ?)',
            [user_id, reference, plan_name, amount_paid]
        );

        // Update session
        req.session.user.has_paid = 1;
        req.session.user.expiry_date = expiry_date;
        req.session.user.subscription_plan = plan_name;

        res.json({ status: 'success' });
    } catch (err) {
        console.error(err);
        res.json({ status: 'error', message: 'Server error during verification' });
    }
});

// Server Start
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
