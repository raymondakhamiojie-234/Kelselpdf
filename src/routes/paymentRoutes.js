const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { checkAuth } = require('../middleware/auth'); 

router.get('/payment', checkAuth, paymentController.getPayment);
router.post('/api/verify_payment', checkAuth, paymentController.verifyPayment);
router.get('/payment_history', checkAuth, paymentController.getPaymentHistory);

module.exports = router;
