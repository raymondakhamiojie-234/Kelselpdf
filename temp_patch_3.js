const fs = require('fs');
let code = fs.readFileSync('src/controllers/cbtEngineController.js', 'utf8');

// Replace postStartSession
const targetStart = `// 2. Start Session`;
const endStart = `// 3. Main CBT Engine View`;

if (!code.includes('candidate_subject_selection')) {
    const newPostStartSession = `// 2. Start Session 
exports.postStartSession = async (req, res) => {
    try {
        const { mock_id, selected_electives } = req.body;
        const userId = req.session.user_id;

        const [mockInfo] = await pool.query(\`
            SELECT m.*, e.exam_body_id 
            FROM cbt_mocks m 
            JOIN cbt_exams e ON m.exam_id = e.id 
            WHERE m.id = ? AND m.status = 'PUBLISHED'
        \`, [mock_id]);

        if (mockInfo.length === 0) return res.status(404).send("Mock not found.");
        const mock = mockInfo[0];

        // Enforce Premium Access
        if (mock.is_premium) {
            const user = req.session.user;
            const isSubscribed = user && user.has_paid && (!user.expiry_date || new Date(user.expiry_date) > new Date());
            if (!isSubscribed) {
                return res.redirect('/payment?locked=true');
            }
        }

        // Fetch subject rules for this mock
        const [rules] = await pool.query('SELECT subject_id, question_count, is_compulsory FROM cbt_mock_subjects WHERE mock_id = ?', [mock_id]);
        if (rules.length === 0) return res.status(400).send("Mock blueprint is empty.");

        // CANDIDATE SUBJECT SELECTION LOGIC (JAMB)
        if (mock.candidate_subject_selection && !selected_electives) {
            // Need to render the subject selection screen!
            const [subjectsData] = await pool.query(\`
                SELECT ms.*, s.name as subject_name 
                FROM cbt_mock_subjects ms 
                JOIN cbt_subjects s ON ms.subject_id = s.id 
                WHERE ms.mock_id = ?
            \`, [mock_id]);
            
            return res.render('cbt/select_subjects', {
                active_page: 'cbt_mock',
                mock,
                subjects: subjectsData
            });
        }

        // Determine Final Allowed Subjects
        let activeRules = [];
        if (mock.candidate_subject_selection) {
            let electives = [];
            if (Array.isArray(selected_electives)) { electives = selected_electives; }
            else if (typeof selected_electives === 'string') { electives = [selected_electives]; }
            
            if (electives.length !== mock.required_elective_count) {
                return res.status(400).send(\`You must select exactly \${mock.required_elective_count} electives.\`);
            }
            
            activeRules = rules.filter(r => r.is_compulsory || electives.includes(r.subject_id.toString()));
        } else {
            activeRules = rules; // Take all
        }

        // Ensure user hasn't an active IN_PROGRESS session 
        await pool.query('UPDATE cbt_exam_sessions SET status = ? WHERE user_id = ? AND status = ?', ['ABANDONED', userId, 'IN_PROGRESS']);

        const sessionId = crypto.randomUUID();
        let allQuestions = [];

        for (const rule of activeRules) {
            const [q] = await pool.query(\`
                SELECT id FROM cbt_questions 
                WHERE subject_id = ? AND status = 'PUBLISHED' 
                ORDER BY RAND() LIMIT ?
            \`, [rule.subject_id, rule.question_count]);
            
            allQuestions = allQuestions.concat(q);
        }

        if (allQuestions.length === 0) return res.status(400).send("Not enough questions in the bank.");

        await pool.query(\`
            INSERT INTO cbt_exam_sessions (id, user_id, exam_body_id, exam_id, mock_id, duration_minutes, total_questions) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        \`, [sessionId, userId, mock.exam_body_id, mock.exam_id, mock.id, mock.time_limit_minutes, allQuestions.length]);

        for (let i = 0; i < allQuestions.length; i++) {
            await pool.query(\`
                INSERT INTO cbt_session_questions (session_id, question_id, question_number)
                VALUES (?, ?, ?)
            \`, [sessionId, allQuestions[i].id, i + 1]);
        }

        res.redirect(\`/cbt/engine/\${sessionId}\`);
    } catch(err) {
        console.error(err);
        res.status(500).send("Error starting session: " + err.message);
    }
};

`;
    const before = code.substring(0, code.indexOf(targetStart));
    const after = code.substring(code.indexOf(endStart));
    code = before + newPostStartSession + after;
    fs.writeFileSync('src/controllers/cbtEngineController.js', code);
    console.log("Success!");
} else {
    console.log("Already updated!");
}
