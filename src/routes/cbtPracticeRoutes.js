const express = require('express');
const router = express.Router();
const cbtPracticeController = require('../controllers/cbtPracticeController');
const { checkAuth } = require('../middleware/auth'); 

// All practice routes require authentication (students)
router.use(checkAuth);

// Pages
router.get('/practice', cbtPracticeController.getPracticeDashboard);
router.get('/practice/setup', cbtPracticeController.getPracticeSetup);
router.get('/practice/session', cbtPracticeController.getPracticeSession);

// API Endpoints for interactive session
router.post('/api/cbt/practice/check', cbtPracticeController.postCheckAnswer);
router.post('/api/cbt/practice/bookmark', cbtPracticeController.postToggleBookmark);
router.post('/api/cbt/practice/history', cbtPracticeController.postUpdateHistory);

module.exports = router;
