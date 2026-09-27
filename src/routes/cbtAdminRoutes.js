const express = require('express');
const router = express.Router();
const cbtAdminController = require('../controllers/cbtAdminController');
const { checkAuth } = require('../middleware/auth'); 

// Apply an admin check middleware inline or use existing
const requireAdmin = (req, res, next) => {
    // Assuming auth middleware sets req.session.user
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send("Access Denied: Administrators only.");
    }
    next();
};

router.use(checkAuth);
router.use(requireAdmin);

// Dashboard
router.get('/admin/cbt', (req, res) => res.redirect('/admin/cbt/exam_bodies'));

// Exam Bodies
router.get('/admin/cbt/exam_bodies', cbtAdminController.getExamBodies);
router.post('/admin/cbt/exam_bodies', cbtAdminController.postExamBody);

// Exams
router.get('/admin/cbt/exams', cbtAdminController.getExams);
router.post('/admin/cbt/exams', cbtAdminController.postExam);

// Subjects
router.get('/admin/cbt/subjects', cbtAdminController.getSubjects);
router.post('/admin/cbt/subjects', cbtAdminController.postSubject);

// Topics
router.get('/admin/cbt/topics', cbtAdminController.getTopics);
router.post('/admin/cbt/topics', cbtAdminController.postTopic);

// Questions
router.get('/admin/cbt/questions', cbtAdminController.getQuestions);
router.post('/admin/cbt/questions', cbtAdminController.postQuestion);

module.exports = router;
