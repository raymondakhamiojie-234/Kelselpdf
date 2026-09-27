const express = require('express');
const router = express.Router();
const mainController = require('../controllers/mainController');
const { checkAuth } = require('../middleware/auth');

router.get('/', mainController.getIndex);
router.get('/vision', mainController.getVision);
router.get('/privacy', mainController.getPrivacy);
router.get('/terms', mainController.getTerms);
router.get('/dashboard', checkAuth, mainController.getDashboard);

router.get('/aau-catalogue', (req, res) => res.render('public/aau_catalogue'));
module.exports = router;

