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
 * Converts MySQL `?` placeholders into Postgres `$1, $2` etc.
 * Appends `RETURNING id` for INSERT statements if not present so `result.insertId` keeps working.
 */
function prepareSql(sql) {
    let i = 1;
    const pgSql = sql.replace(/\?/g, () => `$${i++}`);
    let finalSql = pgSql;
    if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
        finalSql = `${pgSql} RETURNING id`;
    }
    return finalSql;
}

/**
 * Formats the return array to match MySQL `[rows, fields]` or `[resultObject, fields]`
 */
function formatResult(res) {
    if (res.command === 'INSERT' || res.command === 'UPDATE' || res.command === 'DELETE') {
        const mockResult = {
            insertId: (res.rows && res.rows.length > 0) ? res.rows[0].id : null,
            affectedRows: res.rowCount
        };
        return [mockResult, res.fields];
    }
    return [res.rows, res.fields];
}

/**
 * A wrapper that emulates `mysql2/promise` so that existing queries in the codebase
 * don't need to be rewritten.
 */
const customPool = {
    query: async (sql, params = []) => {
        try {
            const finalSql = prepareSql(sql);
            const res = await pool.query(finalSql, params);
            return formatResult(res);
        } catch (err) {
            console.error("Postgres Query Error:", err.message, " | SQL:", sql);
            throw err;
        }
    },
    getConnection: async () => {
        const client = await pool.connect();
        return {
            query: async (sql, params = []) => {
                try {
                    const finalSql = prepareSql(sql);
                    const res = await client.query(finalSql, params);
                    return formatResult(res);
                } catch (err) {
                    console.error("Postgres Client Query Error:", err.message, " | SQL:", sql);
                    throw err;
                }
            },
            beginTransaction: async () => {
                await client.query('BEGIN');
            },
            commit: async () => {
                await client.query('COMMIT');
            },
            rollback: async () => {
                try {
                    await client.query('ROLLBACK');
                } catch (e) {
                    console.error("Postgres Rollback Error:", e.message);
                }
            },
            release: () => {
                client.release();
            }
        };
    }
};

module.exports = customPool;
