const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const { checkAuth } = require('../middleware/auth'); 

router.get('/community', checkAuth, communityController.getCommunity);
router.get('/community/forum/:id', checkAuth, communityController.getCommunityForum);
router.post('/community/forum/:id/new', checkAuth, communityController.postCommunityForumNew);
router.get('/community/topic/:id', checkAuth, communityController.getCommunityTopic);
router.post('/community/topic/:id/reply', checkAuth, communityController.postCommunityTopicReply);

module.exports = router;
