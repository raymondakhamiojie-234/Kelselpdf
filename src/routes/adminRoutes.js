const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth'); 
const multer = require('multer');
const os = require('os');
const upload = multer({ dest: os.tmpdir() + '/uploads/' });

router.get('/admin', requireAdmin, adminController.getAdmin);
router.get('/admin/questions', requireAdmin, adminController.getQuestions);
router.post('/admin/questions', requireAdmin, upload.single('csv_file'), adminController.postQuestions);
router.post('/admin/questions/clear', requireAdmin, adminController.postClearQuestions);
router.get('/admin/past_questions', requireAdmin, adminController.getPastQuestions);
router.post('/admin/past_questions', requireAdmin, upload.single('pq_file'), adminController.postPastQuestions);
router.get('/admin/subscriptions', requireAdmin, adminController.getSubscriptions);
router.post('/admin/lock_user', requireAdmin, adminController.postLockUser);
router.get('/admin/payments', requireAdmin, adminController.getPayments);
router.get('/admin/skills', requireAdmin, adminController.getSkills);
router.post('/admin/skills/category', requireAdmin, adminController.postSkillsCategory);
router.post('/admin/skills/course', requireAdmin, adminController.postSkillsCourse);
router.post('/admin/skills/category/delete', requireAdmin, adminController.postSkillsCategoryDelete);
router.post('/admin/skills/course/delete', requireAdmin, adminController.postSkillsCourseDelete);

router.get('/admin/users', requireAdmin, adminController.getUsers);
router.post('/admin/users/role', requireAdmin, adminController.postUpdateUserRole);
router.post('/admin/users/delete', requireAdmin, adminController.postDeleteUser);

module.exports = router;
