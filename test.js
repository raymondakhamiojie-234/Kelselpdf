const mysql = require('mysql2/promise');

async function test() {
    try {
        const pool = mysql.createPool({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'kelselpdf'
        });
        
        const [result] = await pool.query(
            `INSERT INTO users (full_name, lastname, email, password, department_id, level, role, has_paid, subscription_plan) 
             VALUES (?, ?, ?, ?, ?, ?, 'student', 0, 'none')`,
            ['Test', 'User', 'test4@test.com', 'hash', 1, 100]
        );
        console.log('Success:', result);
    } catch(e) {
        console.log('Full Error Object:');
        console.error(e);
    }
    process.exit(0);
}
test();
