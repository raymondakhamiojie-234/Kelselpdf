require('dotenv').config();
const pool = require('./src/config/db');

async function setup() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                message TEXT NOT NULL,
                link VARCHAR(255) DEFAULT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('Done');
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
setup();
