const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
});

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

module.exports = { globalLimiter, authLimiter, aiLimiter };
