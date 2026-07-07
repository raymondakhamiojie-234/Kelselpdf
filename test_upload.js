const fs = require('fs');
const path = require('path');

// Create a dummy PDF file
fs.writeFileSync('dummy.pdf', 'dummy content');

const FormData = require('form-data');
const form = new FormData();
form.append('course_code', 'TEST101');
form.append('year', '2023');
form.append('type', 'Midterm');
form.append('pq_file', fs.createReadStream('dummy.pdf'));

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/admin/past_questions',
  method: 'POST',
  headers: form.getHeaders(),
};

// We need an admin session cookie to bypass requireAdmin
// But wait, the server uses cookie-session. It's encrypted!
