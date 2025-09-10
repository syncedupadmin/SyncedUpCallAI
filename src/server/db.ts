import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = {
  query: (q: string, params?: any[]) => pool.query(q, params),
  one: async (q: string, params?: any[]) => (await pool.query(q, params)).rows[0],
  oneOrNone: async (q: string, params?: any[]) => (await pool.query(q, params)).rows[0] || null,
  manyOrNone: async (q: string, params?: any[]) => (await pool.query(q, params)).rows || [],
  none: async (q: string, params?: any[]) => { await pool.query(q, params); },
  result: async (q: string, params?: any[]) => await pool.query(q, params)
};
