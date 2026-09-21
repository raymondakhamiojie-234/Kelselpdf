const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { checkAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/limiters');

router.get('/ai-chat', checkAuth, chatController.getChatUI);
router.get('/api/ai-chat/sessions', checkAuth, chatController.getSessions);
router.get('/api/ai-chat/session/:id', checkAuth, chatController.getSessionMessages);
router.post('/api/ai-chat/session', checkAuth, apiLimiter, chatController.postNewSession);
router.post('/api/ai-chat/message', checkAuth, apiLimiter, chatController.postMessage);

module.exports = router;
