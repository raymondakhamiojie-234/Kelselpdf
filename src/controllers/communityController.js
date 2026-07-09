const pool = require('../config/db');

exports.getCommunity = async (req, res) => {
    try {
        const [forums] = await pool.query(`
            SELECT f.*, COUNT(t.id) as topic_count 
            FROM discussion_forums f 
            LEFT JOIN discussion_topics t ON f.id = t.forum_id 
            GROUP BY f.id
            ORDER BY f.category, f.title
        `);
        res.render('community/forums', { forums });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading Community: " + err.message);
    }
};

exports.getCommunityForum = async (req, res) => {
    try {
        const [forums] = await pool.query('SELECT * FROM discussion_forums WHERE id = ?', [req.params.id]);
        if (forums.length === 0) return res.status(404).send("Forum not found");
        
        const [topics] = await pool.query(`
            SELECT t.*, u.full_name as author, COUNT(r.id) as reply_count
            FROM discussion_topics t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN discussion_replies r ON t.id = r.topic_id
            WHERE t.forum_id = ?
            GROUP BY t.id
            ORDER BY t.created_at DESC
        `, [req.params.id]);
        
        res.render('community/forums', { selectedForum: forums[0], topics });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading topics");
    }
};

exports.postCommunityForumNew = async (req, res) => {
    try {
        const { title, content } = req.body;
        const [result] = await pool.query(
            'INSERT INTO discussion_topics (forum_id, user_id, title, content) VALUES (?, ?, ?, ?)',
            [req.params.id, req.session.user_id, title, content]
        );
        res.redirect('/community/topic/' + result.insertId);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating topic");
    }
};

exports.getCommunityTopic = async (req, res) => {
    try {
        const [topics] = await pool.query(`
            SELECT t.*, u.full_name as author, u.role as author_role
            FROM discussion_topics t
            JOIN users u ON t.user_id = u.id
            WHERE t.id = ?
        `, [req.params.id]);
        
        if (topics.length === 0) return res.status(404).send("Topic not found");
        
        const [replies] = await pool.query(`
            SELECT r.*, u.full_name as author, u.role as author_role
            FROM discussion_replies r
            JOIN users u ON r.user_id = u.id
            WHERE r.topic_id = ?
            ORDER BY r.created_at ASC
        `, [req.params.id]);
        
        res.render('community/topic', { topic: topics[0], replies });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading topic");
    }
};

exports.postCommunityTopicReply = async (req, res) => {
    try {
        await pool.query(
            'INSERT INTO discussion_replies (topic_id, user_id, content) VALUES (?, ?, ?)',
            [req.params.id, req.session.user_id, req.body.content]
        );
        res.redirect('/community/topic/' + req.params.id);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error posting reply");
    }
};
