const express = require('express');
const router = express.Router();
const skillsController = require('../controllers/skillsController');
const { checkAuth } = require('../middleware/auth'); 

router.get('/skills', checkAuth, skillsController.getSkills);
router.get('/skills/course/:slug', checkAuth, skillsController.getSkillsCourse);
router.post('/skills/enroll', checkAuth, skillsController.postSkillsEnroll);
router.get('/skills/player/:slug', checkAuth, skillsController.getSkillsPlayer);
router.post('/skills/complete_lesson', checkAuth, skillsController.postSkillsCompleteLesson);
router.get('/skills/certificate/:course_id', checkAuth, skillsController.getSkillsCertificate);
router.get('/verify/:hash', skillsController.getVerifyHash);
router.get('/certificates', checkAuth, skillsController.getCertificates);
router.get('/skills/my-learning', checkAuth, skillsController.getSkillsMyLearning);

module.exports = router;
