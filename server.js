require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');

const { globalLimiter } = require('./src/middleware/limiters');

const authRoutes = require('./src/routes/authRoutes');
const mainRoutes = require('./src/routes/mainRoutes');
const aiRoutes = require('./src/routes/aiRoutes');
const examRoutes = require('./src/routes/examRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const skillsRoutes = require('./src/routes/skillsRoutes');
const communityRoutes = require('./src/routes/communityRoutes');
const careerRoutes = require('./src/routes/careerRoutes');
const setupRoutes = require('./src/routes/setupRoutes');
const trialRoutes = require('./src/routes/trialRoutes');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Security and Logging Middleware
app.use(helmet({ 
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false
})); 
app.use(morgan('dev'));
app.use(globalLimiter);

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'fallback_secret_key'],
    maxAge: 24 * 60 * 60 * 1000,
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

// Routes
app.use('/', mainRoutes);
app.use('/', authRoutes);
app.use('/', aiRoutes);
app.use('/', examRoutes);
app.use('/', paymentRoutes);
app.use('/', adminRoutes);
app.use('/', skillsRoutes);
app.use('/', communityRoutes);
app.use('/', careerRoutes);
app.use('/', setupRoutes);
app.use('/', trialRoutes);

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
