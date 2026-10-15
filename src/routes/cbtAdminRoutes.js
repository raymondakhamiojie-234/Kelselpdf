const express = require('express');
const router = express.Router();
const cbtAdminController = require('../controllers/cbtAdminController');
const cbtImportController = require('../controllers/cbtImportController');
const cbtMockAdminController = require('../controllers/cbtMockAdminController');
const { checkAuth } = require('../middleware/auth'); 
const multer = require('multer');

// Configure multer for memory storage (we send buffer to pdf-parse)
const upload = multer({ storage: multer.memoryStorage() });

// Authentication is required for all CBT operations
router.use(checkAuth);

// AJAX Endpoints (Accessible to both students and admins for dynamic subject/exam dropdowns)
router.get('/api/cbt/exams/:bodyId', cbtImportController.getExamsForBody);
router.get('/api/cbt/subjects/:examId', cbtImportController.getSubjectsForExam);
router.get('/api/cbt/exams/:examId/subjects', cbtMockAdminController.getExamSubjectsAPI);

// Apply admin check middleware to admin routes
const requireAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        // If logged in as student, guide them directly to the student mock exam hub
        if (req.session.user && req.session.user.role === 'student') {
            return res.redirect('/cbt/setup');
        }
        return res.status(403).send("Access Denied: Administrators only.");
    }
    next();
};

// Protect all /admin routes
router.use('/admin', requireAdmin);

// Dashboard
router.get('/admin/cbt', cbtAdminController.getDashboard);

// Core Entities
router.get('/admin/cbt/exam_bodies', cbtAdminController.getExamBodies);
router.post('/admin/cbt/exam_bodies', cbtAdminController.postExamBody);
router.post('/admin/cbt/exam_bodies/:id/edit', cbtAdminController.postEditExamBody);

router.get('/admin/cbt/exams', cbtAdminController.getExams);
router.post('/admin/cbt/exams', cbtAdminController.postExam);
router.get('/admin/cbt/exams/:id/edit', cbtAdminController.getEditExam);
router.post('/admin/cbt/exams/:id/edit', cbtAdminController.postEditExam);
router.post('/admin/cbt/exams/:id/delete', cbtAdminController.postDeleteExam);
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
router.post('/admin/cbt/questions/approve-all', cbtImportController.postApproveAllQuestions);
router.post('/admin/cbt/questions/:id/approve', cbtImportController.postApproveQuestion);
router.post('/admin/cbt/questions/:id/reject', cbtImportController.postRejectQuestion);

// Phase 5: Mock Configurations
router.get('/admin/cbt/mocks', cbtMockAdminController.getMocks);
router.get('/admin/cbt/mocks/create', cbtMockAdminController.getCreateMock);
router.post('/admin/cbt/mocks/create', cbtMockAdminController.postCreateMock);
router.post('/admin/cbt/mocks/status', cbtMockAdminController.postToggleStatus);
router.post('/admin/cbt/mocks/delete', cbtMockAdminController.postDeleteMock);
router.post('/admin/cbt/mocks/:id/delete', cbtMockAdminController.postDeleteMock);

module.exports = router;
