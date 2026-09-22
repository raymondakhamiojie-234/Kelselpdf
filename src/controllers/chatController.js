const pool = require('../config/db');

// Helper to communicate with NVIDIA API
async function generateNvidiaCompletion(messages) {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            model: "meta/llama-3.3-70b-instruct",
            messages: messages,
            temperature: 0.2,
            top_p: 0.7,
            max_tokens: 1024
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`NVIDIA API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

exports.getChatUI = async (req, res) => {
    try {
        const [sessions] = await pool.query('SELECT * FROM ai_chat_sessions WHERE user_id = ? ORDER BY updated_at DESC', [req.session.user.id]);
        res.render('acct/ai_chat', { user: req.session.user, sessions, active_page: 'ai_chat' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading AI Chat");
    }
};

exports.getSessions = async (req, res) => {
    try {
        const [sessions] = await pool.query('SELECT * FROM ai_chat_sessions WHERE user_id = ? ORDER BY updated_at DESC', [req.session.user.id]);
        res.json({ success: true, sessions });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.getSessionMessages = async (req, res) => {
    try {
        const sessionId = req.params.id;
        // Verify ownership
        const [session] = await pool.query('SELECT * FROM ai_chat_sessions WHERE id = ? AND user_id = ?', [sessionId, req.session.user.id]);
        if (session.length === 0) return res.json({ success: false, error: 'Session not found' });
        
        const [messages] = await pool.query('SELECT * FROM ai_chat_messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
        res.json({ success: true, messages });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.postNewSession = async (req, res) => {
    try {
        const [result] = await pool.query('INSERT INTO ai_chat_sessions (user_id) VALUES (?)', [req.session.user.id]);
        res.json({ success: true, session_id: result.insertId });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
};

exports.postMessage = async (req, res) => {
    try {
        const { session_id, message } = req.body;
        if (!session_id || !message) return res.json({ success: false, error: 'Missing data' });
        
        // Verify ownership
        const [session] = await pool.query('SELECT * FROM ai_chat_sessions WHERE id = ? AND user_id = ?', [session_id, req.session.user.id]);
        if (session.length === 0) return res.json({ success: false, error: 'Session not found' });

        // Save User Message
        await pool.query('INSERT INTO ai_chat_messages (session_id, role, content) VALUES (?, ?, ?)', [session_id, 'user', message]);
        
        // Build Context
        let systemPrompt = `You are KelselPDF's AI Tutor. You are helping a student named ${req.session.user.full_name}. Keep your answers helpful, encouraging, and academically focused. Format with Markdown.`;
        
        try {
            const [exams] = await pool.query('SELECT course_code, score, total_questions FROM exam_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [req.session.user.id]);
            if (exams.length > 0) {
                const examText = exams.map(e => `${e.course_code}: ${e.score}/${e.total_questions}`).join(', ');
                systemPrompt += `\nHere are their recent mock exam scores: ${examText}. Use this to guide their studies.`;
            }
            
            const [materials] = await pool.query('SELECT original_name FROM user_materials WHERE user_id = ? ORDER BY uploaded_at DESC LIMIT 5', [req.session.user.id]);
            if (materials.length > 0) {
                const matText = materials.map(m => m.original_name).join(', ');
                systemPrompt += `\nThey recently uploaded these study materials: ${matText}.`;
            }
        } catch (ctxErr) {
            console.error("Failed to build context:", ctxErr);
        }

        // Fetch History
        const [history] = await pool.query('SELECT role, content FROM ai_chat_messages WHERE session_id = ? ORDER BY created_at ASC', [session_id]);
        
        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...history.map(msg => ({ role: msg.role, content: msg.content }))
        ];

        // Ensure title is generated if it's the first message
        if (history.length <= 2) {
            try {
                const titlePrompt = [{ role: 'user', content: `Generate a short 3-word title for this chat based on this first message: "${message}". Reply ONLY with the title.` }];
                const title = await generateNvidiaCompletion(titlePrompt);
                await pool.query('UPDATE ai_chat_sessions SET title = ?, updated_at = NOW() WHERE id = ?', [title.replace(/["']/g, '').trim(), session_id]);
            } catch (e) { }
        } else {
            await pool.query('UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = ?', [session_id]);
        }

        // Call AI
        const aiResponse = await generateNvidiaCompletion(apiMessages);
        
        // Save AI Message
        await pool.query('INSERT INTO ai_chat_messages (session_id, role, content) VALUES (?, ?, ?)', [session_id, 'assistant', aiResponse]);

        res.json({ success: true, reply: aiResponse });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
};
