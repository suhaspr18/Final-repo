const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'recruitment.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite recruitment database.');
  }
});

// Helper functions to wrap sqlite3 queries in Promises for cleaner async/await usage
const dbQuery = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
};

// Initialize schema
db.serialize(() => {
  // Enable foreign key constraints
  db.run('PRAGMA foreign_keys = ON;');

  // Users Table
  db.run(`
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
  db.run(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT,
      skills TEXT, -- Comma-separated skills, e.g. "React, Node.js, JavaScript"
      experience_years INTEGER DEFAULT 0,
      education TEXT,
      resume_text TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Jobs Table
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recruiter_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      required_skills TEXT NOT NULL, -- Comma-separated skills, e.g. "React, JavaScript"
      required_experience INTEGER DEFAULT 0,
      location TEXT,
      salary TEXT,
      status TEXT CHECK(status IN ('open', 'closed')) DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recruiter_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Applications Table
  db.run(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      candidate_id INTEGER NOT NULL,
      match_score REAL DEFAULT 0.0,
      match_analysis TEXT, -- JSON string storing detailed analysis: { matchedSkills: [], missingSkills: [], expDiff: 0 }
      status TEXT CHECK(status IN ('applied', 'screening', 'interview', 'offered', 'rejected')) DEFAULT 'applied',
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
      FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
      UNIQUE(job_id, candidate_id)
    )
  `);

  console.log('Database tables initialized successfully.');
});

module.exports = {
  db,
  dbQuery
};
