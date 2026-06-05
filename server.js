const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const { dbQuery } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// AI Resume Matching Algorithm
// ==========================================
function calculateMatchScore(candidateSkills, candidateExp, jobSkills, jobExp) {
  // Normalize skills (split by comma, trim, lowercase)
  const parseSkills = (str) => {
    if (!str) return [];
    return str.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
  };

  const cSkills = parseSkills(candidateSkills);
  const jSkills = parseSkills(jobSkills);

  if (jSkills.length === 0) {
    // If no skills are required, match experience or give perfect skill score
    const skillScore = 70;
    const expScore = candidateExp >= jobExp ? 30 : (jobExp > 0 ? (candidateExp / jobExp) * 30 : 30);
    return {
      totalScore: Math.round((skillScore + expScore) * 10) / 10,
      skillsScore: skillScore,
      experienceScore: Math.round(expScore * 10) / 10,
      matchedSkills: [],
      missingSkills: [],
      extraSkills: cSkills
    };
  }

  const matchedSkills = jSkills.filter(s => cSkills.includes(s));
  const missingSkills = jSkills.filter(s => !cSkills.includes(s));
  const extraSkills = cSkills.filter(s => !jSkills.includes(s));

  // Weights: 70% Skills, 30% Experience
  const skillScore = (matchedSkills.length / jSkills.length) * 70;
  
  let experienceScore = 0;
  if (jobExp === 0) {
    experienceScore = 30;
  } else {
    experienceScore = candidateExp >= jobExp ? 30 : (candidateExp / jobExp) * 30;
  }

  const totalScore = Math.min(100, Math.round((skillScore + experienceScore) * 10) / 10);

  return {
    totalScore,
    skillsScore: Math.round(skillScore * 10) / 10,
    experienceScore: Math.round(experienceScore * 10) / 10,
    matchedSkills,
    missingSkills,
    extraSkills
  };
}

// ==========================================
// API Routes: Authentication
// ==========================================

// Register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    // Insert into users
    const userResult = await dbQuery.run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role]
    );

    const userId = userResult.id;

    // If role is candidate, initialize an empty candidate profile
    if (role === 'candidate') {
      await dbQuery.run(
        'INSERT INTO candidates (user_id, title, skills, experience_years, education, resume_text) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, '', '', 0, '', '']
      );
    }

    res.status(201).json({ message: 'User registered successfully', userId, role });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Database error occurred' });
    }
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await dbQuery.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    let candidateId = null;
    if (user.role === 'candidate') {
      const candidate = await dbQuery.get('SELECT id FROM candidates WHERE user_id = ?', [user.id]);
      if (candidate) candidateId = candidate.id;
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        candidateId
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error occurred' });
  }
});

// ==========================================
// API Routes: Candidate Profiles
// ==========================================

// Get Candidate Profile
app.get('/api/candidate/profile/:userId', async (req, res) => {
  try {
    const profile = await dbQuery.get(
      'SELECT c.*, u.name, u.email FROM candidates c JOIN users u ON c.user_id = u.id WHERE c.user_id = ?',
      [req.params.userId]
    );
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Candidate Profile
app.put('/api/candidate/profile/:userId', async (req, res) => {
  const { title, skills, experience_years, education, resume_text } = req.body;
  try {
    const result = await dbQuery.run(
      `UPDATE candidates 
       SET title = ?, skills = ?, experience_years = ?, education = ?, resume_text = ? 
       WHERE user_id = ?`,
      [title, skills, experience_years, education, resume_text, req.params.userId]
    );

    // If update is successful, we should recalculate match scores for this candidate's applications
    const candidate = await dbQuery.get('SELECT id FROM candidates WHERE user_id = ?', [req.params.userId]);
    if (candidate) {
      const apps = await dbQuery.all('SELECT a.id, a.job_id, j.required_skills, j.required_experience FROM applications a JOIN jobs j ON a.job_id = j.id WHERE a.candidate_id = ?', [candidate.id]);
      
      for (const app of apps) {
        const analysis = calculateMatchScore(skills, experience_years, app.required_skills, app.required_experience);
        await dbQuery.run(
          'UPDATE applications SET match_score = ?, match_analysis = ? WHERE id = ?',
          [analysis.totalScore, JSON.stringify(analysis), app.id]
        );
      }
    }

    res.json({ message: 'Profile updated and active application scores recalculated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API Routes: Job Board
// ==========================================

// Get all jobs
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await dbQuery.all(
      'SELECT j.*, u.name as company_name FROM jobs j JOIN users u ON j.recruiter_id = u.id ORDER BY j.created_at DESC'
    );
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create job listing
app.post('/api/jobs', async (req, res) => {
  const { recruiter_id, title, description, required_skills, required_experience, location, salary } = req.body;
  if (!recruiter_id || !title || !description || !required_skills) {
    return res.status(400).json({ error: 'Title, description, and required skills are required' });
  }

  try {
    const result = await dbQuery.run(
      'INSERT INTO jobs (recruiter_id, title, description, required_skills, required_experience, location, salary) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [recruiter_id, title, description, required_skills, required_experience || 0, location, salary]
    );
    res.status(201).json({ message: 'Job posted successfully', jobId: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get job details by ID
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await dbQuery.get(
      'SELECT j.*, u.name as company_name FROM jobs j JOIN users u ON j.recruiter_id = u.id WHERE j.id = ?',
      [req.params.id]
    );
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API Routes: Job Applications & Matching
// ==========================================

// Apply to a job
app.post('/api/applications/apply', async (req, res) => {
  const { job_id, candidate_id } = req.body;
  if (!job_id || !candidate_id) {
    return res.status(400).json({ error: 'Job ID and Candidate ID are required' });
  }

  try {
    // Get candidate skills and experience
    const candidate = await dbQuery.get('SELECT skills, experience_years FROM candidates WHERE id = ?', [candidate_id]);
    // Get job required skills and experience
    const job = await dbQuery.get('SELECT required_skills, required_experience FROM jobs WHERE id = ?', [job_id]);

    if (!candidate || !job) {
      return res.status(404).json({ error: 'Candidate or Job not found' });
    }

    // Run AI match scoring
    const analysis = calculateMatchScore(
      candidate.skills,
      candidate.experience_years,
      job.required_skills,
      job.required_experience
    );

    const result = await dbQuery.run(
      'INSERT INTO applications (job_id, candidate_id, match_score, match_analysis) VALUES (?, ?, ?, ?)',
      [job_id, candidate_id, analysis.totalScore, JSON.stringify(analysis)]
    );

    res.status(201).json({
      message: 'Application submitted successfully',
      applicationId: result.id,
      matchScore: analysis.totalScore
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'You have already applied for this job.' });
    } else {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
});

// Get all applications for a job (Recruiter view, sorted by score)
app.get('/api/applications/job/:jobId', async (req, res) => {
  try {
    const applications = await dbQuery.all(
      `SELECT a.*, c.title as candidate_title, c.skills, c.experience_years, c.education, u.name as candidate_name, u.email as candidate_email
       FROM applications a
       JOIN candidates c ON a.candidate_id = c.id
       JOIN users u ON c.user_id = u.id
       WHERE a.job_id = ?
       ORDER BY a.match_score DESC`,
      [req.params.jobId]
    );
    res.json(applications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all applications submitted by a candidate
app.get('/api/applications/candidate/:candidateId', async (req, res) => {
  try {
    const applications = await dbQuery.all(
      `SELECT a.*, j.title as job_title, j.location, j.salary, u.name as company_name
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       JOIN users u ON j.recruiter_id = u.id
       WHERE a.candidate_id = ?
       ORDER BY a.applied_at DESC`,
      [req.params.candidateId]
    );
    res.json(applications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Application Status (Recruiter action)
app.patch('/api/applications/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    await dbQuery.run(
      'UPDATE applications SET status = ? WHERE id = ?',
      [status, req.params.id]
    );
    res.json({ message: 'Application status updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API Routes: Statistics & DBMS Reports
// ==========================================
app.get('/api/stats', async (req, res) => {
  try {
    const totalJobs = await dbQuery.get('SELECT COUNT(*) as count FROM jobs');
    const totalCandidates = await dbQuery.get('SELECT COUNT(*) as count FROM candidates');
    const totalApplications = await dbQuery.get('SELECT COUNT(*) as count FROM applications');
    
    // Average Match Score
    const avgScore = await dbQuery.get('SELECT AVG(match_score) as avgScore FROM applications');

    // Applications group by status
    const statusCounts = await dbQuery.all(
      'SELECT status, COUNT(*) as count FROM applications GROUP BY status'
    );

    // Top Jobs by applications count (using relational JOIN and GROUP BY)
    const topJobs = await dbQuery.all(
      `SELECT j.title, COUNT(a.id) as app_count, AVG(a.match_score) as avg_score 
       FROM jobs j 
       LEFT JOIN applications a ON j.id = a.job_id 
       GROUP BY j.id 
       ORDER BY app_count DESC 
       LIMIT 5`
    );

    res.json({
      summary: {
        jobs: totalJobs.count,
        candidates: totalCandidates.count,
        applications: totalApplications.count,
        avgMatchScore: avgScore.avgScore ? Math.round(avgScore.avgScore * 10) / 10 : 0
      },
      statusDistribution: statusCounts,
      popularJobs: topJobs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API Routes: SQL Query Playground (DBMS-specific)
// ==========================================
app.post('/api/admin/query', async (req, res) => {
  const { sqlQuery } = req.body;
  if (!sqlQuery) {
    return res.status(400).json({ error: 'SQL query is empty.' });
  }

  // Basic sanity check to prevent database corruption (optional, but good for security)
  const queryType = sqlQuery.trim().split(/\s+/)[0].toUpperCase();
  
  try {
    // If it's a SELECT or PRAGMA, use dbQuery.all. Otherwise, use run.
    if (['SELECT', 'PRAGMA', 'EXPLAIN', 'WITH'].includes(queryType)) {
      const rows = await dbQuery.all(sqlQuery);
      res.json({
        type: 'select',
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        rows: rows,
        count: rows.length
      });
    } else {
      const result = await dbQuery.run(sqlQuery);
      res.json({
        type: 'write',
        changes: result.changes,
        lastInsertId: result.id
      });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Root route to serve Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export the Express API for Vercel Serverless Functions
if (process.env.NODE_ENV !== 'production') {
  // Start Server Locally
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;
