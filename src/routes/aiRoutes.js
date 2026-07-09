const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { checkAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/limiters');

router.get('/exam/ai/take/:course', checkAuth, aiController.getAiExamView);
router.get('/api/ai/generate', checkAuth, aiLimiter, aiController.generateExam);
router.post('/api/ai/grade', checkAuth, aiLimiter, aiController.gradeTheory);
router.get('/exam/ai/pdf', checkAuth, aiController.getPdfViewer);
router.post('/api/ai/pdf_chat', checkAuth, aiController.chatPdf);

module.exports = router;
