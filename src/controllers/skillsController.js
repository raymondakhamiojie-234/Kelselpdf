const pool = require('../config/db');

exports.getSkills = async (req, res) => {
    try {
        const categorySlug = req.query.category;
        const [categories] = await pool.query('SELECT * FROM academy_categories ORDER BY name ASC');
        
        let coursesQuery = `
            SELECT ac.*, cat.name as category_name 
            FROM academy_courses ac 
            JOIN academy_categories cat ON ac.category_id = cat.id
        `;
        let queryParams = [];
        
        if (categorySlug) {
            coursesQuery += ' WHERE cat.slug = ?';
            queryParams.push(categorySlug);
        }
        coursesQuery += ' ORDER BY ac.created_at DESC';
        
        const [courses] = await pool.query(coursesQuery, queryParams);
        
        res.render('skills/browse', { 
            user: req.session.user, 
            categories, 
            courses,
            current_category: categorySlug 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading academy courses");
    }
};

exports.getSkillsCourse = async (req, res) => {
    try {
        const slug = req.params.slug;
        const [courseRows] = await pool.query('SELECT * FROM academy_courses WHERE slug = ?', [slug]);
        
        if (courseRows.length === 0) return res.status(404).send("Course not found");
        const course = courseRows[0];
        
        // Fetch Modules & Lessons
        const [modules] = await pool.query('SELECT * FROM academy_modules WHERE course_id = ? ORDER BY order_index ASC', [course.id]);
        
        for (let mod of modules) {
            const [lessons] = await pool.query('SELECT * FROM academy_lessons WHERE module_id = ? ORDER BY order_index ASC', [mod.id]);
            mod.lessons = lessons;
        }

        // Check if enrolled (if progress exists)
        const [progressRows] = await pool.query(`
            SELECT p.* FROM academy_progress p 
            JOIN academy_lessons l ON p.lesson_id = l.id
            JOIN academy_modules m ON l.module_id = m.id
            WHERE p.user_id = ? AND m.course_id = ? LIMIT 1
        `, [req.session.user.id, course.id]);

        res.render('skills/course_details', {
            user: req.session.user,
            course,
            modules,
            is_enrolled: progressRows.length > 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading course details");
    }
};

exports.postSkillsEnroll = async (req, res) => {
    try {
        const { course_id } = req.body;
        // Verify course exists
        const [courseRows] = await pool.query('SELECT slug, is_premium FROM academy_courses WHERE id = ?', [course_id]);
        if(courseRows.length === 0) return res.status(404).send("Course not found");
        
        // Premium Check
        if (courseRows[0].is_premium && req.session.user.has_paid === 0) {
            return res.redirect('/payment');
        }

        // Get first lesson
        const [lessonRows] = await pool.query(`
            SELECT l.id FROM academy_lessons l
            JOIN academy_modules m ON l.module_id = m.id
            WHERE m.course_id = ? ORDER BY m.order_index ASC, l.order_index ASC LIMIT 1
        `, [course_id]);

        if (lessonRows.length > 0) {
            await pool.query('INSERT IGNORE INTO academy_progress (user_id, lesson_id) VALUES (?, ?)', [req.session.user.id, lessonRows[0].id]);
        }
        
        res.redirect(`/skills/player/${courseRows[0].slug}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error enrolling");
    }
};

exports.getSkillsPlayer = async (req, res) => {
    try {
        const slug = req.params.slug;
        const [courseRows] = await pool.query('SELECT * FROM academy_courses WHERE slug = ?', [slug]);
        if (courseRows.length === 0) return res.status(404).send("Course not found");
        const course = courseRows[0];
        
        // Premium Check
        if (course.is_premium && req.session.user.has_paid === 0) {
            return res.redirect('/payment');
        }

        // Fetch Modules & Lessons
        const [modules] = await pool.query('SELECT * FROM academy_modules WHERE course_id = ? ORDER BY order_index ASC', [course.id]);
        let allLessons = [];
        for (let mod of modules) {
            const [lessons] = await pool.query('SELECT * FROM academy_lessons WHERE module_id = ? ORDER BY order_index ASC', [mod.id]);
            mod.lessons = lessons;
            allLessons = allLessons.concat(lessons);
        }

        // Fetch User Progress
        const [progressRows] = await pool.query(`
            SELECT lesson_id, completed FROM academy_progress 
            WHERE user_id = ? AND lesson_id IN (
                SELECT l.id FROM academy_lessons l
                JOIN academy_modules m ON l.module_id = m.id
                WHERE m.course_id = ?
            )
        `, [req.session.user.id, course.id]);

        const completed_lessons = progressRows.filter(p => p.completed).map(p => p.lesson_id);
        const progress_percent = allLessons.length > 0 ? (completed_lessons.length / allLessons.length) * 100 : 0;

        // Current Lesson Logic
        let current_lesson = null;
        let next_lesson_id = null;
        let prev_lesson_id = null;

        if (req.query.lesson) {
            const lId = parseInt(req.query.lesson);
            const index = allLessons.findIndex(l => l.id === lId);
            if (index !== -1) {
                current_lesson = allLessons[index];
                if (index > 0) prev_lesson_id = allLessons[index - 1].id;
                if (index < allLessons.length - 1) next_lesson_id = allLessons[index + 1].id;
            }
        }

        res.render('skills/player', {
            user: req.session.user,
            course,
            modules,
            current_lesson,
            prev_lesson_id,
            next_lesson_id,
            completed_lessons,
            progress_percent
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading player");
    }
};

exports.postSkillsCompleteLesson = async (req, res) => {
    try {
        const { lesson_id, course_slug } = req.body;
        
        await pool.query(`
            INSERT INTO academy_progress (user_id, lesson_id, completed, completed_at)
            VALUES (?, ?, TRUE, NOW())
            ON DUPLICATE KEY UPDATE completed = TRUE, completed_at = NOW()
        `, [req.session.user.id, lesson_id]);

        // Find next lesson to redirect to
        const [courseRows] = await pool.query('SELECT id FROM academy_courses WHERE slug = ?', [course_slug]);
        if (courseRows.length > 0) {
            const [lessons] = await pool.query(`
                SELECT l.id FROM academy_lessons l
                JOIN academy_modules m ON l.module_id = m.id
                WHERE m.course_id = ? ORDER BY m.order_index ASC, l.order_index ASC
            `, [courseRows[0].id]);
            
            const index = lessons.findIndex(l => l.id == lesson_id);
            if (index !== -1 && index < lessons.length - 1) {
                return res.redirect(`/skills/player/${course_slug}?lesson=${lessons[index+1].id}`);
            }
        }

        res.redirect(`/skills/player/${course_slug}?lesson=${lesson_id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error completing lesson");
    }
};

exports.getSkillsCertificate = async (req, res) => {
    try {
        const courseId = req.params.course_id;
        const userId = req.session.user_id;
        
        let [certs] = await pool.query('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?', [userId, courseId]);
        
        if (certs.length === 0) {
            const crypto = require('crypto');
            const uniqueHash = crypto.randomBytes(16).toString('hex');
            
            await pool.query(
                'INSERT INTO certificates (user_id, course_id, unique_hash) VALUES (?, ?, ?)',
                [userId, courseId, uniqueHash]
            );
            
            [certs] = await pool.query('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?', [userId, courseId]);
        }
        
        const [courses] = await pool.query('SELECT * FROM academy_courses WHERE id = ?', [courseId]);
        
        const baseUrl = req.protocol + '://' + req.get('host');
        res.render('skills/certificate', { certificate: certs[0], course: courses[0], baseUrl });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading certificate");
    }
};

exports.getVerifyHash = async (req, res) => {
    try {
        const [certs] = await pool.query(`
            SELECT c.*, u.full_name as user_name, u.lastname, ac.title as course_title
            FROM certificates c
            JOIN users u ON c.user_id = u.id
            JOIN academy_courses ac ON c.course_id = ac.id
            WHERE c.unique_hash = ?
        `, [req.params.hash]);
        
        if (certs.length > 0) {
            res.render('public/verify', { valid: true, certificate: certs[0] });
        } else {
            res.render('public/verify', { valid: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Error verifying certificate");
    }
};

exports.getCertificates = async (req, res) => {
    try {
        const [certs] = await pool.query(`
            SELECT c.*, ac.title as course_title 
            FROM certificates c
            JOIN academy_courses ac ON c.course_id = ac.id
            WHERE c.user_id = ?
            ORDER BY c.issued_at DESC
        `, [req.session.user_id]);
        res.render('acct/certificates', { certs });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading certificates");
    }
};

exports.getSkillsMyLearning = async (req, res) => {
    try {
        const [progress] = await pool.query(`
            SELECT ac.title as course_title, ac.id as course_id
            FROM academy_progress p
            JOIN academy_lessons al ON p.lesson_id = al.id
            JOIN academy_modules am ON al.module_id = am.id
            JOIN academy_courses ac ON am.course_id = ac.id
            WHERE p.user_id = ?
            GROUP BY ac.id
        `, [req.session.user_id]);
        
        const [certs] = await pool.query('SELECT course_id FROM certificates WHERE user_id = ?', [req.session.user_id]);
        const completedCourseIds = certs.map(c => c.course_id);

        res.render('skills/my_learning', { progress, completedCourseIds });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading my learning: " + err.message);
    }
};
