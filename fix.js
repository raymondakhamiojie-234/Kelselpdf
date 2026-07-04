const fs = require('fs');
let data = fs.readFileSync('server.js', 'utf8');

// Fix undefined middleware
data = data.replace(/requireAuth/g, 'checkAuth');

// Fix multer storage to use /tmp for serverless
data = data.replace(/dest: 'uploads\/'/g, "dest: '/tmp/uploads/'");

fs.writeFileSync('server.js', data);
console.log('Fixed server.js');
