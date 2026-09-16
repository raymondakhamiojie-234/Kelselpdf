const { Pool } = require('pg');

// Initialize the PostgreSQL pool using a connection string or individual components.
// For Supabase, DATABASE_URL is preferred.
let poolConfig = {};
if (process.env.DATABASE_URL) {
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    };
} else {
    poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'kelselpdf',
        ssl: process.env.DB_HOST && process.env.DB_HOST.includes('supabase') ? { rejectUnauthorized: false } : null,
    };
}

const pool = new Pool(poolConfig);

/**
 * A wrapper that emulates `mysql2/promise` so that 145 existing queries in the codebase
 * don't need to be rewritten.
 * 
 * What this does:
 * 1. Converts MySQL `?` placeholders into Postgres `$1, $2` etc.
 * 2. Formats the return array to match MySQL `[rows, fields]` or `[resultObject, fields]`
 * 3. Injects `RETURNING id` into INSERT queries so `result.insertId` keeps working.
 */
const customPool = {
    query: async (sql, params = []) => {
        try {
            // Convert ? to $1, $2...
            let i = 1;
            const pgSql = sql.replace(/\?/g, () => `$${i++}`);

            // Append RETURNING id for INSERT statements if not present
            let finalSql = pgSql;
            if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
                finalSql = `${pgSql} RETURNING id`;
            }

            const res = await pool.query(finalSql, params);

            // Mock mysql2 return signature: [rows, fields]
            // If it's an insert/update/delete, mysql returns a result object at index 0 with insertId and affectedRows
            if (res.command === 'INSERT' || res.command === 'UPDATE' || res.command === 'DELETE') {
                const mockResult = {
                    insertId: (res.rows && res.rows.length > 0) ? res.rows[0].id : null,
                    affectedRows: res.rowCount
                };
                return [mockResult, res.fields];
            }
            
            // If it's a SELECT, return the rows array at index 0
            return [res.rows, res.fields];
        } catch (err) {
            console.error("Postgres Query Error:", err.message, " | SQL:", sql);
            throw err;
        }
    },
    getConnection: async () => {
        const client = await pool.connect();
        return {
            query: async (sql, params) => customPool.query(sql, params),
            release: () => client.release()
        };
    }
};

module.exports = customPool;
