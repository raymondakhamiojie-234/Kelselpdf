const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { checkAuth } = require('../middleware/auth');

router.get('/api/notifications', checkAuth, notificationController.getNotifications);
router.post('/api/notifications/read', checkAuth, notificationController.markAsRead);

module.exports = router;
