const fs = require('fs');
const path = require('path');

const dirs = [
    { dir: 'views/acct', prefix: 'partials/app_header' },
    { dir: 'views/skills', prefix: '../acct/partials/app_header' },
    { dir: 'views/career', prefix: '../acct/partials/app_header' },
    { dir: 'views/community', prefix: '../acct/partials/app_header' },
    { dir: 'views/admin', prefix: '../acct/partials/app_header' }
];

const skipFiles = ['dashboard.ejs', 'login.ejs', 'register.ejs', 'index.ejs'];

const titleMap = {
    'profile.ejs': { title: 'User Profile', desc: 'Manage your details' },
    'exam_setup.ejs': { title: 'Mock Exams', desc: 'Configure your practice test' },
    'exam_materials.ejs': { title: 'Study Materials', desc: 'Access your resources' },
    'exam_analytics.ejs': { title: 'Analytics', desc: 'Track your performance' },
    'certificates.ejs': { title: 'Certificates', desc: 'Your achievements' },
    'payment_history.ejs': { title: 'Billing', desc: 'Your transaction history' },
    'take_exam.ejs': { title: 'Examination', desc: 'Good luck!' },
    'ai_exam.ejs': { title: 'AI Exam', desc: 'Interactive AI testing' },
    'browse.ejs': { title: 'Skills Academy', desc: 'Browse available courses' },
    'my_learning.ejs': { title: 'My Learning', desc: 'Continue where you left off' },
    'course_details.ejs': { title: 'Course Details', desc: 'Learn new skills' },
    'player.ejs': { title: 'Course Player', desc: 'Watch and learn' },
    'hub.ejs': { title: 'Career Hub', desc: 'Jobs & Mentorship' },
    'portfolio.ejs': { title: 'Portfolio', desc: 'Showcase your work' },
    'forums.ejs': { title: 'Community', desc: 'Join the discussion' },
    'topic.ejs': { title: 'Discussion', desc: 'Share your thoughts' },
    'manage_skills.ejs': { title: 'Manage Skills', desc: 'Academy administration' },
    'past_questions.ejs': { title: 'Past Questions', desc: 'Upload question banks' },
    'payments.ejs': { title: 'Payments', desc: 'Revenue dashboard' },
    'questions.ejs': { title: 'Questions', desc: 'Manage exam questions' },
    'subscriptions.ejs': { title: 'Subscriptions', desc: 'User plans' }
};

for (const { dir, prefix } of dirs) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (!file.endsWith('.ejs') || skipFiles.includes(file)) continue;

        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;

        // 1. Add viewport meta tag if missing
        if (content.includes('<head>') && !content.includes('name="viewport"')) {
            content = content.replace('<head>', '<head>\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">');
            modified = true;
        }

        // 2. Add dashboard-body class
        if (content.includes('<body>')) {
            content = content.replace('<body>', '<body class="dashboard-body">');
            modified = true;
        }

        // 3. Insert header
        if ((content.includes('<main class="main-content">') || content.includes('<div class="main-content">')) && !content.includes('app_header')) {
            const pageInfo = titleMap[file] || { title: 'Portal', desc: '' };
            const includeStr = `\n        <!-- Curved Header -->\n        <%- include('${prefix}', { page_title: '${pageInfo.title}', page_desc: '${pageInfo.desc}' }) %>\n`;
            content = content.replace(/<(main|div) class="main-content">/, '<$1 class="main-content">' + includeStr);
            modified = true;
        }

        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated ${filePath}`);
        }
    }
}
