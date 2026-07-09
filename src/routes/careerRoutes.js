const express = require('express');
const router = express.Router();
const careerController = require('../controllers/careerController');
const { checkAuth } = require('../middleware/auth'); 

router.get('/career', checkAuth, careerController.getCareer);
router.get('/career/portfolio', checkAuth, careerController.getPortfolio);
router.post('/career/portfolio', checkAuth, careerController.postPortfolio);

module.exports = router;
