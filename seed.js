const bcrypt = require('bcryptjs');
const { db, dbQuery } = require('./database');

// Reuse matching algorithm for seeding applications
function calculateMatchScore(candidateSkills, candidateExp, jobSkills, jobExp) {
  const parseSkills = (str) => {
    if (!str) return [];
    return str.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
  };
  const cSkills = parseSkills(candidateSkills);
  const jSkills = parseSkills(jobSkills);

  if (jSkills.length === 0) {
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

async function seed() {
  console.log('Starting database seeding...');
  
  try {
    // Clear existing data (safely in correct order of foreign keys)
    await dbQuery.run('DELETE FROM applications');
    await dbQuery.run('DELETE FROM jobs');
    await dbQuery.run('DELETE FROM candidates');
    await dbQuery.run('DELETE FROM users');
    
    // Reset AUTOINCREMENT counters (SQLite only)
    try {
      await dbQuery.run("DELETE FROM sqlite_sequence WHERE name IN ('users', 'candidates', 'jobs', 'applications')");
    } catch (e) {
      // Ignored: Postgres uses sequences and does not have sqlite_sequence table
    }

    const hashedPassword = await bcrypt.hash('password123', 10);

    // 1. Seed Recruiters
    const rec1 = await dbQuery.run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      ['TechCorp Solutions', 'hr@techcorp.com', hashedPassword, 'recruiter']
    );
    const rec2 = await dbQuery.run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      ['GlobalSoft Inc.', 'recruitment@globalsoft.com', hashedPassword, 'recruiter']
    );

    console.log('Seeded Recruiters.');

    // 2. Seed Candidates
    const candUsers = [
      { name: 'Alice Smith', email: 'alice@example.com', title: 'React Developer', skills: 'React, JavaScript, HTML, CSS, Redux', exp: 3, edu: 'B.S. in Computer Science' },
      { name: 'Bob Jones', email: 'bob@example.com', title: 'Full Stack Engineer', skills: 'React, Node.js, Express, SQLite, JavaScript, Git', exp: 5, edu: 'M.S. in Software Engineering' },
      { name: 'Charlie Brown', email: 'charlie@example.com', title: 'Junior Web Developer', skills: 'HTML, CSS, JavaScript', exp: 1, edu: 'Self-taught Bootcamp Graduate' },
      { name: 'Diana Prince', email: 'diana@example.com', title: 'Backend Developer', skills: 'Node.js, Express, SQL, Postgres, Python, Docker', exp: 4, edu: 'B.Tech in Information Technology' }
    ];

    const seededCandidates = [];
    for (const cand of candUsers) {
      const userRes = await dbQuery.run(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        [cand.name, cand.email, hashedPassword, 'candidate']
      );
      const candRes = await dbQuery.run(
        'INSERT INTO candidates (user_id, title, skills, experience_years, education, resume_text) VALUES (?, ?, ?, ?, ?, ?)',
        [userRes.id, cand.title, cand.skills, cand.exp, cand.edu, `Detailed resume for ${cand.name}. Specializing in ${cand.title} with skills in ${cand.skills}.`]
      );
      seededCandidates.push({
        id: candRes.id,
        ...cand
      });
    }

    console.log('Seeded Candidates and profiles.');

    // 3. Seed Jobs
    const jobsData = [
      { recruiter_id: rec1.id, title: 'React Front-End Developer', desc: 'Join our team to build amazing web applications with React and Redux.', skills: 'React, JavaScript, CSS, Redux', exp: 2, loc: 'New York (Remote)', sal: '$80,000 - $100,000' },
      { recruiter_id: rec1.id, title: 'Senior Full Stack Engineer', desc: 'Looking for an experienced engineer to lead our Express/React platform.', skills: 'React, Node.js, Express, SQL, JavaScript', exp: 4, loc: 'San Francisco, CA', sal: '$120,000 - $140,000' },
      { recruiter_id: rec2.id, title: 'Junior Frontend Developer', desc: 'Perfect entry level role to master HTML, CSS, JavaScript, and React.', skills: 'HTML, CSS, JavaScript, React', exp: 1, loc: 'Austin, TX (Hybrid)', sal: '$60,000 - $70,000' },
      { recruiter_id: rec2.id, title: 'Backend specialist (Node.js)', desc: 'Focus on highly performant microservices and SQL databases.', skills: 'Node.js, Express, SQL, Docker', exp: 3, loc: 'Boston, MA', sal: '$95,000 - $110,000' }
    ];

    const seededJobs = [];
    for (const job of jobsData) {
      const jobRes = await dbQuery.run(
        'INSERT INTO jobs (recruiter_id, title, description, required_skills, required_experience, location, salary) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [job.recruiter_id, job.title, job.desc, job.skills, job.exp, job.loc, job.sal]
      );
      seededJobs.push({
        id: jobRes.id,
        ...job
      });
    }

    console.log('Seeded Jobs.');

    // 4. Seed Applications & Calculate Match Scores
    // Alice applies to React Front-End Developer & Junior Frontend Developer
    // Bob applies to Senior Full Stack Engineer & Backend specialist
    // Charlie applies to Junior Frontend Developer
    // Diana applies to Senior Full Stack Engineer & Backend specialist
    const applicationsList = [
      { jobIdx: 0, candIdx: 0, status: 'interview' }, // Alice -> React Dev
      { jobIdx: 2, candIdx: 0, status: 'applied' },   // Alice -> Junior Frontend
      { jobIdx: 1, candIdx: 1, status: 'offered' },   // Bob -> Senior Full Stack
      { jobIdx: 3, candIdx: 1, status: 'applied' },   // Bob -> Backend Specialist
      { jobIdx: 2, candIdx: 2, status: 'screening' }, // Charlie -> Junior Frontend
      { jobIdx: 1, candIdx: 3, status: 'applied' },   // Diana -> Senior Full Stack
      { jobIdx: 3, candIdx: 3, status: 'interview' }  // Diana -> Backend Specialist
    ];

    for (const app of applicationsList) {
      const job = seededJobs[app.jobIdx];
      const cand = seededCandidates[app.candIdx];

      const scoreAnalysis = calculateMatchScore(
        cand.skills,
        cand.exp,
        job.skills,
        job.exp
      );

      await dbQuery.run(
        'INSERT INTO applications (job_id, candidate_id, match_score, match_analysis, status) VALUES (?, ?, ?, ?, ?)',
        [job.id, cand.id, scoreAnalysis.totalScore, JSON.stringify(scoreAnalysis), app.status]
      );
    }

    console.log('Seeded Applications with calculated AI match scores.');
    console.log('Database seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
