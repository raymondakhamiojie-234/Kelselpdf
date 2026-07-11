const express = require('express');
const router = express.Router();
const trialController = require('../controllers/trialController');

router.get('/trial/setup', trialController.getTrialSetup);
router.get('/trial/start', trialController.getTrialStart);
router.get('/trial/take/:course', trialController.getTakeTrial);
router.post('/trial/submit', trialController.postTrialSubmit);

module.exports = router;
