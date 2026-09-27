const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculumController');

// Student UI endpoints
router.get('/programmes', curriculumController.getProgrammes);
router.get('/programme/:programme_id', curriculumController.getCurriculum);

// Admin UI endpoints
router.get('/admin/verification-list', curriculumController.adminVerificationList);

module.exports = router;
