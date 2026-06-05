const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Determine if we are running in Vercel Serverless environment
const isVercel = !!process.env.VERCEL;

let dbPath;

if (isVercel) {
  // Vercel Serverless Environment has a read-only filesystem except for the /tmp folder.
  // We MUST write to /tmp to prevent "read-only filesystem" crashes.
  dbPath = '/tmp/recruitment.db';
  
  // The original bundled DB file in the project directory (which is read-only)
  const bundledDbPath = path.join(__dirname, 'recruitment.db');
  
  // If the temporary writeable DB doesn't exist yet, copy the bundled one over!
  // This preserves any seeded data you deployed with.
  if (!fs.existsSync(dbPath) && fs.existsSync(bundledDbPath)) {
    try {
      fs.copyFileSync(bundledDbPath, dbPath);
      console.log('Copied bundled SQLite database to /tmp for write access.');
    } catch (e) {
      console.error('Failed to copy bundled database:', e);
    }
  }
} else {
  // Local development
  dbPath = path.join(__dirname, 'recruitment.db');
}

const sqliteDb = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log(`Connected to the SQLite recruitment database at ${dbPath}`);
  }
});

const dbQuery = {
  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
};

// Initialize schema
async function initDb() {
  try {
    await dbQuery.run('PRAGMA foreign_keys = ON;');

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
  db: sqliteDb,
  dbQuery
};
