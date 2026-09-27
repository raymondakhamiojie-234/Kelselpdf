const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculumController');
const { requireAdmin } = require('../middleware/auth');

// Student UI endpoints
router.get('/programmes', curriculumController.getProgrammes);
router.get('/programme/:programme_id', curriculumController.getCurriculum);

// Admin UI endpoints
router.get('/admin/verification-list', requireAdmin, curriculumController.adminVerificationList);
router.post('/admin/update-status', requireAdmin, curriculumController.adminUpdateStatus);

module.exports = router;
