require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const os = require('os');
const app = express();
app.set('trust proxy', 1);

// Security and Logging Middleware
app.use(helmet({ contentSecurityPolicy: false })); // Disabled CSP temporarily to prevent breaking inline scripts/styles
app.use(morgan('dev'));

// Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(globalLimiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many authentication attempts, please try again later."
});

const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: "You have exceeded the AI request limit for now. Please wait a few minutes." }
});
const upload = multer({ dest: os.tmpdir() + '/uploads/' });
const PORT = process.env.PORT || 3000;

// Database Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kelselpdf',
    ssl: process.env.DB_HOST && process.env.DB_HOST.includes('aivencloud') ? { rejectUnauthorized: false } : null,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'fallback_secret_key'],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
}));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make session data available to all templates
app.use((req, res, next) => {
    res.locals.user_id = req.session.user_id;
    res.locals.user = req.session.user || null;
    next();
});

// Authentication Middleware
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
                req.session = null;
                return res.redirect('/login');
            }
        } catch (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }
    }
    
    // Enforce Premium (Payment Wall) globally for authenticated routes
    const path = req.path;
    const excludedPaths = ['/payment', '/api/verify_payment', '/logout', '/upgrade-admin'];
    
    if (!excludedPaths.includes(path) && req.session.user && req.session.user.role !== 'admin') {
        const currentDate = new Date();
        const expiryDate = new Date(req.session.user.expiry_date);
        
        if (req.session.user.has_paid === 0 || !req.session.user.expiry_date || expiryDate <= currentDate) {
            return res.redirect('/payment');
        }
    }
    
    next();
};

// Premium Enforcement Middleware
const requirePremium = (req, res, next) => {
    const user = req.session.user;
    if (user.role === 'admin') return next();
    
    const currentDate = new Date();
    const expiryDate = new Date(user.expiry_date);
    
    if (user.has_paid === 0 || !user.expiry_date || expiryDate <= currentDate) {
        // You can render a beautiful "Premium Required" page here or redirect
        return res.redirect('/payment');
    }
    next();
};

// --- Routes ---

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/privacy', (req, res) => {
    res.render('privacy');
});

app.get('/terms', (req, res) => {
    res.render('terms');
});

// Temporary Database Setup Route
app.get('/setup-db', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                lastname VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'student',
                platform VARCHAR(50),
                department_id INT(6),
                level INT(4),
                expiry_date DATE,
                has_paid BOOLEAN DEFAULT 0,
                subscription_plan VARCHAR(50) DEFAULT 'none',
                can_change_level BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Safely add column if it doesn't exist
        await pool.query(`
            SELECT can_change_level FROM users LIMIT 1
        `).catch(async () => {
            await pool.query(`ALTER TABLE users ADD COLUMN can_change_level BOOLEAN DEFAULT 0`);
        });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS questions (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                course_code VARCHAR(20) NOT NULL,
                question_text TEXT NOT NULL,
                option_a TEXT,
                option_b TEXT,
                option_c TEXT,
                option_d TEXT,
                correct_option VARCHAR(10),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id INT(6) UNSIGNED,
                reference VARCHAR(100) NOT NULL,
                plan VARCHAR(50),
                amount DECIMAL(10,2),
                status VARCHAR(20) DEFAULT 'success',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS courses (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                course_code VARCHAR(20) NOT NULL,
                department_id INT(6) UNSIGNED,
                shared_access_group VARCHAR(50),
                level_access INT(4)
            )
        `);

        // Check if courses are already seeded
        const [rows] = await pool.query('SELECT id FROM courses LIMIT 1');
        if (rows.length === 0) {
            await pool.query(`
                INSERT INTO courses (course_code, department_id, level_access, shared_access_group) VALUES 
                ('CSC101', 1, 100, 'general'), ('CSC201', 1, 200, 'general'), ('CSC301', 1, 300, 'general'), ('CSC401', 1, 400, 'general'),
                ('EEE101', 2, 100, 'general'), ('EEE201', 2, 200, 'general'), ('EEE301', 2, 300, 'general'), ('EEE401', 2, 400, 'general'),
                ('BUS101', 3, 100, 'general'), ('BUS201', 3, 200, 'general'), ('BUS301', 3, 300, 'general'), ('BUS401', 3, 400, 'general'),
                ('LAW101', 4, 100, 'general'), ('LAW201', 4, 200, 'general'), ('LAW301', 4, 300, 'general'), ('LAW401', 4, 400, 'general'),
                ('MED101', 5, 100, 'general'), ('MED201', 5, 200, 'general'), ('MED301', 5, 300, 'general'), ('MED401', 5, 400, 'general'),
                ('PHY101', 6, 100, 'general'), ('PHY201', 6, 200, 'general'), ('PHY301', 6, 300, 'general'), ('PHY401', 6, 400, 'general'),
                ('CHM101', 7, 100, 'general'), ('CHM201', 7, 200, 'general'), ('CHM301', 7, 300, 'general'), ('CHM401', 7, 400, 'general'),
                ('MEC101', 8, 100, 'general'), ('MEC201', 8, 200, 'general'), ('MEC301', 8, 300, 'general'), ('MEC401', 8, 400, 'general'),
                ('MAC101', 9, 100, 'general'), ('MAC201', 9, 200, 'general'), ('MAC301', 9, 300, 'general'), ('MAC401', 9, 400, 'general'),
                ('NUR101', 10, 100, 'general'), ('NUR201', 10, 200, 'general'), ('NUR301', 10, 300, 'general'), ('NUR401', 10, 400, 'general'),
                ('PSY101', 11, 100, 'general'), ('PSY201', 11, 200, 'general'), ('PSY301', 11, 300, 'general'), ('PSY401', 11, 400, 'general'),
                ('SOC101', 12, 100, 'general'), ('SOC201', 12, 200, 'general'), ('SOC301', 12, 300, 'general'), ('SOC401', 12, 400, 'general'),
                ('ACC101', 13, 100, 'general'), ('ACC201', 13, 200, 'general'), ('ACC301', 13, 300, 'general'), ('ACC401', 13, 400, 'general'),
                ('ECO101', 14, 100, 'general'), ('ECO201', 14, 200, 'general'), ('ECO301', 14, 300, 'general'), ('ECO401', 14, 400, 'general'),
                ('GST101', 0, 100, 'gst'), ('GST102', 0, 100, 'gst'), ('GST201', 0, 200, 'gst'), ('GST202', 0, 200, 'gst')
            `);
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS past_questions (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                course_id INT(6) UNSIGNED NOT NULL,
                year VARCHAR(10),
                type VARCHAR(20),
                file_link LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
            )
        `);
        // Alter table moved to upload route to avoid race conditions

        await pool.query(`
            CREATE TABLE IF NOT EXISTS exam_attempts (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id INT(6) UNSIGNED,
                course_code VARCHAR(20),
                score INT(3),
                total_questions INT(3),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS academy_categories (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                slug VARCHAR(100) NOT NULL UNIQUE,
                icon VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS academy_courses (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                category_id INT(6) UNSIGNED,
                title VARCHAR(200) NOT NULL,
                slug VARCHAR(200) NOT NULL UNIQUE,
                description TEXT,
                instructor VARCHAR(100),
                duration_hours DECIMAL(5,2),
                skill_level VARCHAR(20),
                thumbnail VARCHAR(255),
                is_premium BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES academy_categories(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS academy_modules (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                course_id INT(6) UNSIGNED,
                title VARCHAR(200) NOT NULL,
                order_index INT(3),
                FOREIGN KEY (course_id) REFERENCES academy_courses(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS academy_lessons (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                module_id INT(6) UNSIGNED,
                title VARCHAR(200) NOT NULL,
                type ENUM('video', 'reading', 'assignment', 'quiz') NOT NULL,
                content TEXT,
                video_url VARCHAR(255),
                duration_minutes INT(3),
                order_index INT(3),
                FOREIGN KEY (module_id) REFERENCES academy_modules(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS academy_progress (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id INT(6) UNSIGNED,
                lesson_id INT(6) UNSIGNED,
                completed BOOLEAN DEFAULT FALSE,
                completed_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (lesson_id) REFERENCES academy_lessons(id) ON DELETE CASCADE,
                UNIQUE KEY user_lesson (user_id, lesson_id)
            )
        `);

        // Phase 5: Career Center
        await pool.query(`
            CREATE TABLE IF NOT EXISTS career_jobs (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                company VARCHAR(150) NOT NULL,
                location VARCHAR(100),
                type ENUM('Remote', 'On-site', 'Hybrid', 'Internship', 'Contract') DEFAULT 'Remote',
                description TEXT,
                apply_link VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS career_applications (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                job_id INT(6) UNSIGNED,
                user_id INT(6) UNSIGNED,
                status ENUM('pending', 'reviewing', 'accepted', 'rejected') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES career_jobs(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS student_portfolios (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id INT(6) UNSIGNED UNIQUE,
                summary TEXT,
                github_url VARCHAR(255),
                linkedin_url VARCHAR(255),
                portfolio_url VARCHAR(255),
                skills TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Phase 5: Community Forums
        await pool.query(`
            CREATE TABLE IF NOT EXISTS discussion_forums (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(150) NOT NULL,
                description TEXT,
                category ENUM('General', 'Web Development', 'Data Science', 'Design', 'Career') DEFAULT 'General',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS discussion_topics (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                forum_id INT(6) UNSIGNED,
                user_id INT(6) UNSIGNED,
                title VARCHAR(200) NOT NULL,
                content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (forum_id) REFERENCES discussion_forums(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS discussion_replies (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                topic_id INT(6) UNSIGNED,
                user_id INT(6) UNSIGNED,
                content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (topic_id) REFERENCES discussion_topics(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Phase 5: Certificates
        await pool.query(`
            CREATE TABLE IF NOT EXISTS certificates (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id INT(6) UNSIGNED,
                course_id INT(6) UNSIGNED,
                unique_hash VARCHAR(100) NOT NULL UNIQUE,
                issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES academy_courses(id) ON DELETE CASCADE
            )
        `);


        res.send("<h1>Database successfully setup!</h1><p>You can now go to <a href='/login'>Login</a> and register your first account.</p>");
    } catch (err) {
        console.error(err);
        res.status(500).send("<h1>Error setting up database:</h1><p>" + err.message + "</p>");
    }
});

// Temporary Route to make the logged-in user an Admin
app.get('/upgrade-admin', checkAuth, async (req, res) => {
    try {
        await pool.query("UPDATE users SET role = 'admin', has_paid = 1 WHERE id = ?", [req.session.user_id]);
        
        // Update session to reflect admin changes instantly
        req.session.user = req.session.user || {};
        req.session.user.role = 'admin';
        req.session.user.has_paid = 1;
        
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error upgrading account.");
    }
});

// Auth Routes
app.get('/login', (req, res) => {
    res.render('acct/login', { error: null });
});

app.post('/login', authLimiter, async (req, res) => {
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
});

app.get('/register', (req, res) => {
    res.render('acct/register', { error: null });
});

app.post('/register', authLimiter, async (req, res) => {
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
        res.render('acct/register', { error: 'DB Error: ' + err.message });
    }
});

app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/');
});

app.get('/debug-users', async (req, res) => {
    try {
        const [columns] = await pool.query("SHOW COLUMNS FROM users");
        res.json(columns);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Protected Dashboard Route
app.get('/dashboard', checkAuth, async (req, res) => {
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
});

// Exam Setup Route
app.get('/exam/setup', checkAuth, async (req, res) => {
    try {
        const [userRows] = await pool.query('SELECT department_id, level FROM users WHERE id = ?', [req.session.user_id]);
        const user = userRows[0];

        if (!user) {
            return res.redirect('/logout');
        }

        const [courses] = await pool.query(`
            SELECT DISTINCT c.course_code 
            FROM courses c
            JOIN questions q ON REPLACE(c.course_code, ' ', '') = REPLACE(q.course_code, ' ', '')
            WHERE (c.department_id = ? OR c.shared_access_group = 'gst') 
            AND c.level_access <= ?
            ORDER BY c.course_code ASC
        `, [user.department_id, user.level]);
        
        res.render('acct/exam_setup', { courses });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// Profile Route (GET)
app.get('/profile', checkAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
        res.render('acct/profile', { user: rows[0], success: '', error: '' });
    } catch (err) {
        res.render('acct/profile', { user: req.session.user, success: '', error: 'Database error' });
    }
});

// Profile Route (POST)
app.post('/profile', checkAuth, async (req, res) => {
    const { full_name, lastname, department_id, level } = req.body;
    try {
        const [userCheck] = await pool.query('SELECT can_change_level, level as current_level FROM users WHERE id = ?', [req.session.user.id]);
        const can_change = userCheck[0].can_change_level;
        
        let final_level = userCheck[0].current_level;
        let final_can_change = can_change;
        
        if (can_change && level) {
            final_level = level;
            final_can_change = 0; // Revoke permission after they submit a new level
        }

        await pool.query(
            'UPDATE users SET full_name = ?, lastname = ?, department_id = ?, level = ?, can_change_level = ? WHERE id = ?',
            [full_name, lastname, department_id, final_level, final_can_change, req.session.user.id]
        );
        req.session.user.full_name = full_name; // update session
        req.session.user.level = final_level;
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
        res.render('acct/profile', { user: rows[0], success: 'Profile updated successfully!', error: '' });
    } catch (err) {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
        res.render('acct/profile', { user: rows[0], success: '', error: 'Error updating profile: ' + err.message });
    }
});

// Exam Materials Route (GET)
app.get('/exam_materials', checkAuth, async (req, res) => {
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
// Exam Redirect Helpers (from Dashboard form)
app.get('/exam/start', (req, res) => {
    const course = req.query.course;
    if (!course) return res.redirect('/dashboard');
    const time = req.query.time || 30;
    const questions = req.query.questions || 20;
    res.redirect(`/exam/take/${encodeURIComponent(course)}?time=${time}&questions=${questions}`);
});

app.get('/exam/ai', (req, res) => {
    const course = req.query.course;
    if (!course) return res.redirect('/dashboard');
    res.redirect(`/exam/ai/take/${encodeURIComponent(course)}`);
});

// ==========================================
// SKILLS ACADEMY ROUTES
// ==========================================

// Browse Courses
app.get('/skills', checkAuth, async (req, res) => {
    try {
        const categorySlug = req.query.category;
        const [categories] = await pool.query('SELECT * FROM academy_categories ORDER BY name ASC');
        
        let coursesQuery = `
            SELECT ac.*, cat.name as category_name 
            FROM academy_courses ac 
            JOIN academy_categories cat ON ac.category_id = cat.id
        `;
        let queryParams = [];
        
        if (categorySlug) {
            coursesQuery += ' WHERE cat.slug = ?';
            queryParams.push(categorySlug);
        }
        coursesQuery += ' ORDER BY ac.created_at DESC';
        
        const [courses] = await pool.query(coursesQuery, queryParams);
        
        res.render('skills/browse', { 
            user: req.session.user, 
            categories, 
            courses,
            current_category: categorySlug 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading academy courses");
    }
});

// Course Details
app.get('/skills/course/:slug', checkAuth, async (req, res) => {
    try {
        const slug = req.params.slug;
        const [courseRows] = await pool.query('SELECT * FROM academy_courses WHERE slug = ?', [slug]);
        
        if (courseRows.length === 0) return res.status(404).send("Course not found");
        const course = courseRows[0];
        
        // Fetch Modules & Lessons
        const [modules] = await pool.query('SELECT * FROM academy_modules WHERE course_id = ? ORDER BY order_index ASC', [course.id]);
        
        for (let mod of modules) {
            const [lessons] = await pool.query('SELECT * FROM academy_lessons WHERE module_id = ? ORDER BY order_index ASC', [mod.id]);
            mod.lessons = lessons;
        }

        // Check if enrolled (if progress exists)
        const [progressRows] = await pool.query(`
            SELECT p.* FROM academy_progress p 
            JOIN academy_lessons l ON p.lesson_id = l.id
            JOIN academy_modules m ON l.module_id = m.id
            WHERE p.user_id = ? AND m.course_id = ? LIMIT 1
        `, [req.session.user.id, course.id]);

        res.render('skills/course_details', {
            user: req.session.user,
            course,
            modules,
            is_enrolled: progressRows.length > 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading course details");
    }
});

// Enroll (Create progress for first lesson)
app.post('/skills/enroll', checkAuth, async (req, res) => {
    try {
        const { course_id } = req.body;
        // Verify course exists
        const [courseRows] = await pool.query('SELECT slug, is_premium FROM academy_courses WHERE id = ?', [course_id]);
        if(courseRows.length === 0) return res.status(404).send("Course not found");
        
        // Premium Check
        if (courseRows[0].is_premium && req.session.user.has_paid === 0) {
            return res.redirect('/payment');
        }

        // Get first lesson
        const [lessonRows] = await pool.query(`
            SELECT l.id FROM academy_lessons l
            JOIN academy_modules m ON l.module_id = m.id
            WHERE m.course_id = ? ORDER BY m.order_index ASC, l.order_index ASC LIMIT 1
        `, [course_id]);

        if (lessonRows.length > 0) {
            await pool.query('INSERT IGNORE INTO academy_progress (user_id, lesson_id) VALUES (?, ?)', [req.session.user.id, lessonRows[0].id]);
        }
        
        res.redirect(`/skills/player/${courseRows[0].slug}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error enrolling");
    }
});

// Player Interface
app.get('/skills/player/:slug', checkAuth, async (req, res) => {
    try {
        const slug = req.params.slug;
        const [courseRows] = await pool.query('SELECT * FROM academy_courses WHERE slug = ?', [slug]);
        if (courseRows.length === 0) return res.status(404).send("Course not found");
        const course = courseRows[0];
        
        // Premium Check
        if (course.is_premium && req.session.user.has_paid === 0) {
            return res.redirect('/payment');
        }

        // Fetch Modules & Lessons
        const [modules] = await pool.query('SELECT * FROM academy_modules WHERE course_id = ? ORDER BY order_index ASC', [course.id]);
        let allLessons = [];
        for (let mod of modules) {
            const [lessons] = await pool.query('SELECT * FROM academy_lessons WHERE module_id = ? ORDER BY order_index ASC', [mod.id]);
            mod.lessons = lessons;
            allLessons = allLessons.concat(lessons);
        }

        // Fetch User Progress
        const [progressRows] = await pool.query(`
            SELECT lesson_id, completed FROM academy_progress 
            WHERE user_id = ? AND lesson_id IN (
                SELECT l.id FROM academy_lessons l
                JOIN academy_modules m ON l.module_id = m.id
                WHERE m.course_id = ?
            )
        `, [req.session.user.id, course.id]);

        const completed_lessons = progressRows.filter(p => p.completed).map(p => p.lesson_id);
        const progress_percent = allLessons.length > 0 ? (completed_lessons.length / allLessons.length) * 100 : 0;

        // Current Lesson Logic
        let current_lesson = null;
        let next_lesson_id = null;
        let prev_lesson_id = null;

        if (req.query.lesson) {
            const lId = parseInt(req.query.lesson);
            const index = allLessons.findIndex(l => l.id === lId);
            if (index !== -1) {
                current_lesson = allLessons[index];
                if (index > 0) prev_lesson_id = allLessons[index - 1].id;
                if (index < allLessons.length - 1) next_lesson_id = allLessons[index + 1].id;
            }
        }

        res.render('skills/player', {
            user: req.session.user,
            course,
            modules,
            current_lesson,
            prev_lesson_id,
            next_lesson_id,
            completed_lessons,
            progress_percent
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading player");
    }
});

app.post('/skills/complete_lesson', checkAuth, async (req, res) => {
    try {
        const { lesson_id, course_slug } = req.body;
        
        await pool.query(`
            INSERT INTO academy_progress (user_id, lesson_id, completed, completed_at)
            VALUES (?, ?, TRUE, NOW())
            ON DUPLICATE KEY UPDATE completed = TRUE, completed_at = NOW()
        `, [req.session.user.id, lesson_id]);

        // Find next lesson to redirect to
        const [courseRows] = await pool.query('SELECT id FROM academy_courses WHERE slug = ?', [course_slug]);
        if (courseRows.length > 0) {
            const [lessons] = await pool.query(`
                SELECT l.id FROM academy_lessons l
                JOIN academy_modules m ON l.module_id = m.id
                WHERE m.course_id = ? ORDER BY m.order_index ASC, l.order_index ASC
            `, [courseRows[0].id]);
            
            const index = lessons.findIndex(l => l.id == lesson_id);
            if (index !== -1 && index < lessons.length - 1) {
                return res.redirect(`/skills/player/${course_slug}?lesson=${lessons[index+1].id}`);
            }
        }

        res.redirect(`/skills/player/${course_slug}?lesson=${lesson_id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error completing lesson");
    }
});

// Standard Exam Route
app.get('/exam/take/:course', checkAuth, async (req, res) => {
    try {
        const course = req.params.course;
        const time_limit = parseInt(req.query.time) || 30;
        const question_limit = parseInt(req.query.questions) || 20;

        const [questions] = await pool.query(
            "SELECT id, question_text, option_a, option_b, option_c, option_d FROM questions WHERE REPLACE(course_code, ' ', '') = ? ORDER BY RAND() LIMIT ?",
            [(course||'').replace(/\s+/g, ''), question_limit]
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
app.post('/exam/submit', checkAuth, async (req, res) => {
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
app.get('/exam/analytics', checkAuth, async (req, res) => {
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
                            [(row.course_code||'').replace(/^\uFEFF/, '').trim(), (row.question_text||'').replace(/^\uFEFF/, '').trim(), (row.option_a||'').trim(), (row.option_b||'').trim(), (row.option_c||'').trim(), (row.option_d||'').trim(), (row.correct_option||'').trim()]
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
        
        let course_code_input = req.body.course_code || '';
        course_code_input = course_code_input.toUpperCase().trim();
        const course_dept = req.body.department_id === 'gst' ? null : parseInt(req.body.department_id) || null;
        const shared_group = req.body.department_id === 'gst' ? 'gst' : 'general';
        const course_level = parseInt(req.body.level) || 100;
        
        let course_id;
        const [existingCourse] = await pool.query('SELECT id FROM courses WHERE course_code = ?', [course_code_input]);
        if (existingCourse.length > 0) {
            course_id = existingCourse[0].id;
            // Update existing course with access info if missing
            await pool.query('UPDATE courses SET department_id = COALESCE(department_id, ?), level_access = COALESCE(level_access, ?), shared_access_group = COALESCE(shared_access_group, ?) WHERE id = ?', [course_dept, course_level, shared_group, course_id]);
        } else {
            const [result] = await pool.query('INSERT INTO courses (course_code, department_id, level_access, shared_access_group) VALUES (?, ?, ?, ?)', [course_code_input, course_dept, course_level, shared_group]);
            course_id = result.insertId;
        }
        const year = req.body.year || '';
        const type = req.body.type || '';
        let file_link = req.body.file_link || '';
        let error = '';
        let success = '';

        if (req.file) {
            const fileBuffer = fs.readFileSync(req.file.path);
            file_link = 'data:' + req.file.mimetype + ';base64,' + fileBuffer.toString('base64');
            try { fs.unlinkSync(req.file.path); } catch(e) {}
        }

        if (!file_link) {
            error = "You must either upload a file or provide a URL link.";
        } else {
            await pool.query('ALTER TABLE past_questions MODIFY file_link LONGTEXT');
            await pool.query(
                'INSERT INTO past_questions (course_id, year, type, file_link) VALUES (?, ?, ?, ?)',
                [course_id, year, type, file_link]
            );
            success = "Past question added successfully!";
        }

        res.render('admin/past_questions', { courses, success, error });
    } catch (err) {
        console.error(err);
        const [courses] = await pool.query('SELECT id, course_code FROM courses ORDER BY course_code ASC').catch(()=>[[]]);
        res.render('admin/past_questions', { courses, success: '', error: 'Error: ' + err.message + ' | Stack: ' + String(err.stack).substring(0,200) });
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
app.get('/payment_history', checkAuth, async (req, res) => {
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
app.get('/payment', checkAuth, (req, res) => {
    res.render('acct/payment', { 
        user: req.session.user,
        paystack_public_key: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_4ede74cd265890e05a92b2962578636590b18913' 
    });
});

// Verify Payment API Route (POST)
app.post('/api/verify_payment', checkAuth, async (req, res) => {
    try {
        const reference = req.body.reference;
        const plan = req.body.plan || 'premium';
        
        if (!reference) {
            return res.json({ status: 'error', message: 'No reference supplied' });
        }

        const paystack_secret = process.env.PAYSTACK_SECRET_KEY || 'sk_test_cf6c6d149cc80889c10fd94552cc29e8e500b2c3';

        // We will use native fetch (available in Node 18+)
        const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            method: 'GET',
            headers: {
                "Authorization": `Bearer ${paystack_secret}`,
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
            'UPDATE users SET has_paid = 1, expiry_date = ?, subscription_plan = ?, can_change_level = 1 WHERE id = ?',
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
        res.json({ status: 'error', message: err.message });
    }
});

// Temporary Migration Route
app.get('/migrate-db', async (req, res) => {
    try {
        await pool.query('ALTER TABLE users ADD COLUMN can_change_level BOOLEAN DEFAULT 0');
        res.send('Migration successful: can_change_level added.');
    } catch (err) {
        res.send('Migration error: ' + err.message);
    }
});

// AI Tutor Setup
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIza-placeholder');

async function getBestGeminiModel() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        if (!data.models) return "gemini-1.5-flash";
        
        const supported = data.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'));
        const flashModel = supported.find(m => m.name.includes('flash') && !m.name.includes('vision'));
        const proModel = supported.find(m => m.name.includes('pro') && !m.name.includes('vision'));
        
        if (flashModel) return flashModel.name.replace('models/', '');
        if (proModel) return proModel.name.replace('models/', '');
        return "gemini-1.5-flash";
    } catch (err) {
        return "gemini-1.5-flash";
    }
}

// AI Exam Take Route (GET)
app.get('/exam/ai/take/:course', checkAuth, (req, res) => {
    res.render('acct/ai_exam', { course: req.params.course });
});

// AI Generate Mock Exam (API GET)
app.get('/api/ai/generate', checkAuth, aiLimiter, async (req, res) => {
    try {
        const course = req.query.course || 'General Knowledge';
        let count = parseInt(req.query.count) || 4;
        if (count > 20) count = 20; // safety limit

        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'AIza-placeholder') {
            // Return mock JSON if no API key
            const mock_exam = {
                mcqs: [
                    { question: `What is the foundational principle of ${course}?`, options: ["A. Data Processing", "B. Theoretical Analysis", "C. Core Fundamentals", "D. Practical Application"], answer_index: 2 },
                    { question: `Which of the following is most commonly associated with ${course}?`, options: ["A. Historical Context", "B. Advanced Methodologies", "C. Basic Syntax", "D. All of the above"], answer_index: 3 },
                    { question: `In the context of ${course}, what is the most important factor?`, options: ["A. Accuracy", "B. Speed", "C. Creativity", "D. Documentation"], answer_index: 0 },
                    { question: `How does ${course} impact modern applications?`, options: ["A. It doesn't", "B. It provides structural integrity", "C. It is purely theoretical", "D. It replaces older systems"], answer_index: 1 }
                ],
                theory: `Explain the core fundamentals and methodologies of ${course} and how they apply to real-world scenarios.`
            };
            return res.json(mock_exam);
        }

        const prompt = `Generate exactly ${count} multiple-choice questions and 1 open-ended theory question for a university-level course named '${course}'. 
Return ONLY a raw JSON object with this exact structure:
{
  "mcqs": [
    { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "answer_index": 0 }
  ],
  "theory": "..."
}`;

        const modelName = await getBestGeminiModel();
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: "application/json" },
            systemInstruction: "You are a university professor creating an exam. Output strict JSON."
        });

        const completion = await model.generateContent(prompt);
        const result = JSON.parse(completion.response.text());
        res.json(result);
    } catch (err) {
        console.error("AI Generation Error:", err);
        res.json({ error: 'Failed to generate exam from AI provider: ' + (err.message || 'Unknown error') });
    }
});

// AI Grade Theory (API POST)
app.post('/api/ai/grade', checkAuth, aiLimiter, async (req, res) => {
    try {
        const question = req.body.question || '';
        const answer = req.body.answer || '';

        if (!question || !answer) {
            return res.json({ error: 'Missing data' });
        }

        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'AIza-placeholder') {
            const mock_grade = {
                score: 8,
                feedback: "Excellent start, but your answer lacks depth on the architectural trade-offs. You demonstrated a solid understanding of the fundamental concepts."
            };
            return res.json(mock_grade);
        }

        const prompt = `Question: ${question}\nStudent's Answer: ${answer}\n\nGrade this answer out of 10 and provide 2 sentences of constructive feedback. Return ONLY JSON like this: {"score": 8, "feedback": "..."}`;

        const modelName = await getBestGeminiModel();
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: "application/json" },
            systemInstruction: "You are a fair but rigorous university professor. Output strict JSON."
        });

        const completion = await model.generateContent(prompt);
        const result = JSON.parse(completion.response.text());
        res.json(result);
    } catch (err) {
        console.error("AI Grading Error:", err);
        res.json({ error: 'Failed to grade theory answer: ' + (err.message || 'Unknown error') });
    }
});

// PDF AI Viewer Route (GET)
app.get('/exam/ai/pdf', checkAuth, (req, res) => {
    const pdf_url = req.query.url;
    if (!pdf_url) {
        return res.status(400).send("No PDF URL provided.");
    }
    res.render('acct/pdf_viewer', { pdf_url });
});

// PDF Chat API (POST)
app.post('/api/ai/pdf_chat', checkAuth, async (req, res) => {
    try {
        const action = req.body.action;
        const apiKey = process.env.CHATPDF_API_KEY || 'sec_placeholder';

        if (action === 'upload') {
            const pdf_url = req.body.pdf_url;
            
            // To ensure compatibility with external domains handling absolute vs relative urls
            const absolute_url = pdf_url.startsWith('http') ? pdf_url : `http://${req.headers.host}/${pdf_url}`;

            if (apiKey === 'sec_placeholder') {
                return res.json({ sourceId: 'mock_source_id_12345' });
            }

            const response = await fetch('https://api.chatpdf.com/v1/sources/add-url', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: absolute_url })
            });
            const data = await response.json();
            res.json(data);
        } else if (action === 'chat') {
            const sourceId = req.body.sourceId;
            const message = req.body.message;

            if (apiKey === 'sec_placeholder') {
                return res.json({ content: "I am a mock AI response since the ChatPDF API key isn't configured yet. I read the PDF and it's fascinating!" });
            }

            const response = await fetch('https://api.chatpdf.com/v1/chats/message', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sourceId: sourceId,
                    messages: [{ role: 'user', content: message }]
                })
            });
            const data = await response.json();
            res.json(data);
        } else {
            res.json({ error: 'Invalid action' });
        }
    } catch (err) {
        console.error(err);
        res.json({ error: 'Server error communicating with PDF AI.' });
    }
});

// ==========================================
// ADMIN ACADEMY ROUTES
// ==========================================

app.get('/admin/skills', requireAdmin, async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT * FROM academy_categories ORDER BY name ASC');
        const [courses] = await pool.query('SELECT * FROM academy_courses ORDER BY created_at DESC');
        res.render('admin/manage_skills', { categories, courses });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading admin academy");
    }
});

app.post('/admin/skills/category', requireAdmin, async (req, res) => {
    try {
        const { name, slug } = req.body;
        await pool.query('INSERT INTO academy_categories (name, slug) VALUES (?, ?)', [name, slug]);
        res.redirect('/admin/skills');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating category");
    }
});

app.post('/admin/skills/course', requireAdmin, async (req, res) => {
    try {
        const { category_id, title, slug, description, instructor, duration_hours } = req.body;
        await pool.query(`
            INSERT INTO academy_courses (category_id, title, slug, description, instructor, duration_hours)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [category_id, title, slug, description, instructor, duration_hours || 0]);
        res.redirect('/admin/skills');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating course");
    }
});

app.post('/admin/skills/category/delete', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM academy_categories WHERE id = ?', [req.body.id]);
        res.redirect('/admin/skills');
    } catch (err) {
        res.status(500).send("Error deleting category");
    }
});

app.post('/admin/skills/course/delete', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM academy_courses WHERE id = ?', [req.body.id]);
        res.redirect('/admin/skills');
    } catch (err) {
        res.status(500).send("Error deleting course");
    }
});

// My Learning
app.get('/skills/my-learning', checkAuth, async (req, res) => {
    try {
        const [progress] = await pool.query(`
            SELECT ac.title as course_title, ac.id as course_id
            FROM academy_progress p
            JOIN academy_lessons al ON p.lesson_id = al.id
            JOIN academy_modules am ON al.module_id = am.id
            JOIN academy_courses ac ON am.course_id = ac.id
            WHERE p.user_id = ?
            GROUP BY ac.id
        `, [req.session.user_id]);
        
        // Let's also fetch certificates directly to know if they completed it
        const [certs] = await pool.query('SELECT course_id FROM certificates WHERE user_id = ?', [req.session.user_id]);
        const completedCourseIds = certs.map(c => c.course_id);

        res.render('skills/my_learning', { progress, completedCourseIds });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading my learning: " + err.message);
    }
});

// ==========================================
// PHASE 5: CAREER, COMMUNITY & CERTIFICATES
// ==========================================

// Career Hub
app.get('/career', checkAuth, async (req, res) => {
    try {
        const [jobs] = await pool.query('SELECT * FROM career_jobs ORDER BY created_at DESC');
        res.render('career/hub', { jobs });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading Career Hub: " + err.message);
    }
});

app.get('/career/portfolio', checkAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM student_portfolios WHERE user_id = ?', [req.session.user_id]);
        res.render('career/portfolio', { portfolio: rows[0] || null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading Portfolio: " + err.message);
    }
});

app.post('/career/portfolio', checkAuth, async (req, res) => {
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
});

// Community Forums
app.get('/community', checkAuth, async (req, res) => {
    try {
        // Fetch forums with topic counts
        const [forums] = await pool.query(`
            SELECT f.*, COUNT(t.id) as topic_count 
            FROM discussion_forums f 
            LEFT JOIN discussion_topics t ON f.id = t.forum_id 
            GROUP BY f.id
            ORDER BY f.category, f.title
        `);
        res.render('community/forums', { forums });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading Community: " + err.message);
    }
});

app.get('/community/forum/:id', checkAuth, async (req, res) => {
    try {
        const [forums] = await pool.query('SELECT * FROM discussion_forums WHERE id = ?', [req.params.id]);
        if (forums.length === 0) return res.status(404).send("Forum not found");
        
        const [topics] = await pool.query(`
            SELECT t.*, u.full_name as author, COUNT(r.id) as reply_count
            FROM discussion_topics t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN discussion_replies r ON t.id = r.topic_id
            WHERE t.forum_id = ?
            GROUP BY t.id
            ORDER BY t.created_at DESC
        `, [req.params.id]);
        
        res.render('community/forums', { selectedForum: forums[0], topics });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading topics");
    }
});

app.post('/community/forum/:id/new', checkAuth, async (req, res) => {
    try {
        const { title, content } = req.body;
        const [result] = await pool.query(
            'INSERT INTO discussion_topics (forum_id, user_id, title, content) VALUES (?, ?, ?, ?)',
            [req.params.id, req.session.user_id, title, content]
        );
        res.redirect('/community/topic/' + result.insertId);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating topic");
    }
});

app.get('/community/topic/:id', checkAuth, async (req, res) => {
    try {
        const [topics] = await pool.query(`
            SELECT t.*, u.full_name as author, u.role as author_role
            FROM discussion_topics t
            JOIN users u ON t.user_id = u.id
            WHERE t.id = ?
        `, [req.params.id]);
        
        if (topics.length === 0) return res.status(404).send("Topic not found");
        
        const [replies] = await pool.query(`
            SELECT r.*, u.full_name as author, u.role as author_role
            FROM discussion_replies r
            JOIN users u ON r.user_id = u.id
            WHERE r.topic_id = ?
            ORDER BY r.created_at ASC
        `, [req.params.id]);
        
        res.render('community/topic', { topic: topics[0], replies });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading topic");
    }
});

app.post('/community/topic/:id/reply', checkAuth, async (req, res) => {
    try {
        await pool.query(
            'INSERT INTO discussion_replies (topic_id, user_id, content) VALUES (?, ?, ?)',
            [req.params.id, req.session.user_id, req.body.content]
        );
        res.redirect('/community/topic/' + req.params.id);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error posting reply");
    }
});

// Certificates
app.get('/skills/certificate/:course_id', checkAuth, async (req, res) => {
    try {
        // First check if they actually completed the course (simplified for MVP: check if certificate exists, if not generate it)
        const courseId = req.params.course_id;
        const userId = req.session.user_id;
        
        let [certs] = await pool.query('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?', [userId, courseId]);
        
        if (certs.length === 0) {
            // Check if they completed all modules/lessons? 
            // For MVP, we will assume they clicked "Generate Certificate" after completing the course
            const crypto = require('crypto');
            const uniqueHash = crypto.randomBytes(16).toString('hex');
            
            await pool.query(
                'INSERT INTO certificates (user_id, course_id, unique_hash) VALUES (?, ?, ?)',
                [userId, courseId, uniqueHash]
            );
            
            [certs] = await pool.query('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?', [userId, courseId]);
        }
        
        const [courses] = await pool.query('SELECT * FROM academy_courses WHERE id = ?', [courseId]);
        
        const baseUrl = req.protocol + '://' + req.get('host');
        res.render('skills/certificate', { certificate: certs[0], course: courses[0], baseUrl });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading certificate");
    }
});

app.get('/verify/:hash', async (req, res) => {
    try {
        const [certs] = await pool.query(`
            SELECT c.*, u.full_name as user_name, u.lastname, ac.title as course_title
            FROM certificates c
            JOIN users u ON c.user_id = u.id
            JOIN academy_courses ac ON c.course_id = ac.id
            WHERE c.unique_hash = ?
        `, [req.params.hash]);
        
        if (certs.length > 0) {
            res.render('public/verify', { valid: true, certificate: certs[0] });
        } else {
            res.render('public/verify', { valid: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Error verifying certificate");
    }
});

app.get('/certificates', checkAuth, async (req, res) => {
    try {
        const [certs] = await pool.query(`
            SELECT c.*, ac.title as course_title 
            FROM certificates c
            JOIN academy_courses ac ON c.course_id = ac.id
            WHERE c.user_id = ?
            ORDER BY c.issued_at DESC
        `, [req.session.user_id]);
        res.render('acct/certificates', { certs });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading certificates");
    }
});

// Centralized Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).send('Something broke! Our engineers have been notified.');
});

// Server Start
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
