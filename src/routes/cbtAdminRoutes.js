const express = require('express');
const router = express.Router();
const cbtAdminController = require('../controllers/cbtAdminController');
const cbtImportController = require('../controllers/cbtImportController');
const cbtMockAdminController = require('../controllers/cbtMockAdminController');
const { checkAuth } = require('../middleware/auth'); 
const multer = require('multer');

// Configure multer for memory storage (we send buffer to pdf-parse)
const upload = multer({ storage: multer.memoryStorage() });

// Apply an admin check middleware inline or use existing
const requireAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send("Access Denied: Administrators only.");
    }
    next();
};

router.use(checkAuth);
router.use(requireAdmin);

// Dashboard
router.get('/admin/cbt', (req, res) => res.redirect('/admin/cbt/exam_bodies'));

// Core Entities
router.get('/admin/cbt/exam_bodies', cbtAdminController.getExamBodies);
router.post('/admin/cbt/exam_bodies', cbtAdminController.postExamBody);
router.get('/admin/cbt/exams', cbtAdminController.getExams);
router.post('/admin/cbt/exams', cbtAdminController.postExam);
router.get('/admin/cbt/subjects', cbtAdminController.getSubjects);
router.post('/admin/cbt/subjects', cbtAdminController.postSubject);
router.get('/admin/cbt/topics', cbtAdminController.getTopics);
router.post('/admin/cbt/topics', cbtAdminController.postTopic);
router.get('/admin/cbt/questions', cbtAdminController.getQuestions);
router.post('/admin/cbt/questions', cbtAdminController.postQuestion);

// Ingestion & Review
router.get('/admin/cbt/import', cbtImportController.getImportView);
router.post('/admin/cbt/import/pdf', upload.single('pdf_file'), cbtImportController.postImportPDF);
router.get('/admin/cbt/review', cbtImportController.getReviewQueue);
router.post('/admin/cbt/questions/:id/approve', cbtImportController.postApproveQuestion);
router.post('/admin/cbt/questions/:id/reject', cbtImportController.postRejectQuestion);

// AJAX Endpoints
router.get('/api/cbt/exams/:bodyId', cbtImportController.getExamsForBody);
router.get('/api/cbt/subjects/:examId', cbtImportController.getSubjectsForExam);

module.exports = router;


// Phase 5: Mock Configurations
router.get('/cbt/mocks', cbtMockAdminController.getMocks);
router.get('/cbt/mocks/create', cbtMockAdminController.getCreateMock);
router.post('/cbt/mocks/create', cbtMockAdminController.postCreateMock);
router.post('/cbt/mocks/status', cbtMockAdminController.postToggleStatus);
router.get('/api/cbt/exams/:examId/subjects', cbtMockAdminController.getExamSubjectsAPI);
