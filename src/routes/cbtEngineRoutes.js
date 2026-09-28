const express = require('express');
const router = express.Router();
const cbtEngineController = require('../controllers/cbtEngineController');
const { checkAuth } = require('../middleware/auth'); 

router.use(checkAuth);

// UI Routes
router.get('/cbt/setup', cbtEngineController.getMockSetup);
router.get('/cbt/engine/:sessionId', cbtEngineController.getEngine);
router.get('/cbt/results/:sessionId', cbtEngineController.getResults);

// Actions
router.post('/cbt/start', cbtEngineController.postStartSession);
router.post('/cbt/submit', cbtEngineController.postSubmit);

// AJAX API
router.post('/api/cbt/engine/autosave', cbtEngineController.postAutoSave);
router.post('/api/cbt/engine/violation', cbtEngineController.postLogViolation);

module.exports = router;
