const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({ connectionString: config.databaseUrl, max: 15 });
pool.on('error', (err) => console.error('[db] beklenmeyen hata', err.message));

const db = {
  pool,
  query: (text, params) => pool.query(text, params),
  async one(text, params) { const r = await pool.query(text, params); return r.rows[0] || null; },
  async many(text, params) { const r = await pool.query(text, params); return r.rows; },
  async tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await fn(client);
      await client.query('COMMIT');
      return res;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};

module.exports = db;
