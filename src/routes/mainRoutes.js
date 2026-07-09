const express = require('express');
const router = express.Router();
const mainController = require('../controllers/mainController');
const { checkAuth } = require('../middleware/auth');

router.get('/', mainController.getIndex);
router.get('/privacy', mainController.getPrivacy);
router.get('/terms', mainController.getTerms);
router.get('/dashboard', checkAuth, mainController.getDashboard);

module.exports = router;
