const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const { checkAuth } = require('../middleware/auth'); 

router.get('/exam/setup', checkAuth, examController.getExamSetup);
router.get('/exam_materials', checkAuth, examController.getExamMaterials);
router.get('/exam/start', examController.getExamStart);
router.get('/exam/take/:course', checkAuth, examController.getTakeExam);
router.post('/exam/submit', checkAuth, examController.postExamSubmit);
router.get('/exam/analytics', checkAuth, examController.getExamAnalytics);

module.exports = router;
