require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');
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

// Server Start
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
