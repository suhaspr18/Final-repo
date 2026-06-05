const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const isPostgres = !!process.env.DATABASE_URL;

let pgPool;
let sqliteDb;

if (isPostgres) {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for most hosted Postgres databases (e.g., Vercel, Supabase)
  });
  console.log('Connected to PostgreSQL database.');
} else {
  const dbPath = path.join(__dirname, 'recruitment.db');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
    } else {
      console.log('Connected to the local SQLite recruitment database.');
    }
  });
}

// Helper to convert SQLite query syntax to PostgreSQL syntax
function convertToPgSql(sql) {
  let i = 1;
  // Replace ? with $1, $2, etc.
  let pgSql = sql.replace(/\?/g, () => `$${i++}`);
  
  // Replace schema differences
  pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/ig, 'SERIAL PRIMARY KEY');
  pgSql = pgSql.replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/ig, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  pgSql = pgSql.replace(/PRAGMA foreign_keys = ON;/ig, ''); // Not needed in Postgres
  
  // Add RETURNING id for INSERT statements to match SQLite lastID behavior
  if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING ID')) {
    pgSql += ' RETURNING id';
  }
  
  return pgSql;
}

const dbQuery = {
  async run(sql, params = []) {
    if (isPostgres) {
      const pgSql = convertToPgSql(sql);
      const res = await pgPool.query(pgSql, params);
      return { id: res.rows[0]?.id || 0, changes: res.rowCount };
    } else {
      return new Promise((resolve, reject) => {
        sqliteDb.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, changes: this.changes });
        });
      });
    }
  },
  async all(sql, params = []) {
    if (isPostgres) {
      const pgSql = convertToPgSql(sql);
      const res = await pgPool.query(pgSql, params);
      return res.rows;
    } else {
      return new Promise((resolve, reject) => {
        sqliteDb.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  },
  async get(sql, params = []) {
    if (isPostgres) {
      const pgSql = convertToPgSql(sql);
      const res = await pgPool.query(pgSql, params);
      return res.rows[0];
    } else {
      return new Promise((resolve, reject) => {
        sqliteDb.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }
  }
};

// Initialize schema (Works for both SQLite and Postgres via our wrapper)
async function initDb() {
  try {
    if (!isPostgres) {
      await dbQuery.run('PRAGMA foreign_keys = ON;');
    }

    // Users Table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('candidate', 'recruiter')) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Candidates Table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT,
        skills TEXT,
        experience_years INTEGER DEFAULT 0,
        education TEXT,
        resume_text TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Jobs Table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recruiter_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        required_skills TEXT NOT NULL,
        required_experience INTEGER DEFAULT 0,
        location TEXT,
        salary TEXT,
        status TEXT CHECK(status IN ('open', 'closed')) DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recruiter_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Applications Table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        candidate_id INTEGER NOT NULL,
        match_score REAL DEFAULT 0.0,
        match_analysis TEXT,
        status TEXT CHECK(status IN ('applied', 'screening', 'interview', 'offered', 'rejected')) DEFAULT 'applied',
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
        UNIQUE(job_id, candidate_id)
      )
    `);

    console.log('Database tables initialized successfully.');
  } catch (error) {
    console.error('Error initializing database tables:', error);
  }
}

initDb();

module.exports = {
  db: isPostgres ? pgPool : sqliteDb,
  dbQuery
};
