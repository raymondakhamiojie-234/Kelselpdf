const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authLimiter } = require('../middleware/limiters');
const { checkAuth } = require('../middleware/auth');

router.get('/login', authController.getLogin);
router.post('/login', authLimiter, authController.postLogin);

router.get('/register', authController.getRegister);
router.post('/register', authLimiter, authController.postRegister);

router.get('/logout', authController.getLogout);

router.get('/profile', checkAuth, authController.getProfile);
router.post('/profile', checkAuth, authController.postProfile);

module.exports = router;
