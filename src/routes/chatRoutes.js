const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { checkAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/limiters');

router.get('/ai-chat', checkAuth, chatController.getChatUI);
router.get('/api/ai-chat/sessions', checkAuth, chatController.getSessions);
router.get('/api/ai-chat/session/:id', checkAuth, chatController.getSessionMessages);
router.post('/api/ai-chat/session', checkAuth, aiLimiter, chatController.postNewSession);
router.post('/api/ai-chat/message', checkAuth, aiLimiter, chatController.postMessage);

module.exports = router;
