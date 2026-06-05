// ==========================================
// Global State
// ==========================================
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let activeTab = 'jobs-tab';
let allJobs = [];
let selectedJobId = null;
let managedJobs = [];
let selectedManagedJobId = null;

const API_BASE = '/api';

// ==========================================
// Initialization & Authentication Management
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  updateUserInterface();
  loadJobs();
  loadStats();
  
  // Default schema items toggling
  const schemas = ['schema-users', 'schema-candidates', 'schema-jobs', 'schema-applications'];
  schemas.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = 'none';
  });
});

function updateUserInterface() {
  const authHeader = document.getElementById('auth-header-actions');
  const btnDashboard = document.getElementById('btn-nav-dashboard');

  if (currentUser) {
    btnDashboard.style.display = 'block';
    authHeader.innerHTML = `
      <div class="user-profile-badge">
        <span class="user-name">👋 Hi, ${currentUser.name}</span>
        <span class="user-role">${currentUser.role}</span>
        <button class="btn-outline" onclick="logout()" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; margin-left: 0.75rem;">Log Out</button>
      </div>
    `;

    // Render dashboards depending on role
    if (currentUser.role === 'candidate') {
      document.getElementById('candidate-dashboard').style.display = 'block';
      document.getElementById('recruiter-dashboard').style.display = 'none';
      loadCandidateProfile();
      loadCandidateApplications();
    } else {
      document.getElementById('candidate-dashboard').style.display = 'none';
      document.getElementById('recruiter-dashboard').style.display = 'block';
      loadRecruiterJobs();
    }
  } else {
    btnDashboard.style.display = 'none';
    authHeader.innerHTML = `<button class="btn-primary" onclick="showAuthModal('login')">Sign In</button>`;
    document.getElementById('candidate-dashboard').style.display = 'none';
    document.getElementById('recruiter-dashboard').style.display = 'none';
    
    if (activeTab === 'dashboard-tab') {
      switchTab('jobs-tab');
    }
  }
}

// Toast Notifications Helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '';
  if (type === 'success') icon = '✓';
  else if (type === 'error') icon = '✗';
  else icon = 'ℹ';

  toast.innerHTML = `<span>${icon}</span> <div>${message}</div>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Switching SPA views
function switchTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  document.getElementById(tabId).classList.add('active');
  
  // Highlighting correct nav btn
  if (tabId === 'jobs-tab') document.getElementById('btn-nav-jobs').classList.add('active');
  else if (tabId === 'dashboard-tab') document.getElementById('btn-nav-dashboard').classList.add('active');
  else if (tabId === 'stats-tab') {
    document.getElementById('btn-nav-stats').classList.add('active');
    loadStats();
  }
  else if (tabId === 'sql-tab') document.getElementById('btn-nav-sql').classList.add('active');
}

// ==========================================
// Authentication Controller
// ==========================================
function showAuthModal(mode = 'login') {
  const modal = document.getElementById('auth-modal');
  modal.style.display = 'flex';
  switchAuthTab(mode);
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

function switchAuthTab(mode) {
  const title = document.getElementById('auth-modal-title');
  const subtitle = document.getElementById('auth-modal-subtitle');
  const nameGroup = document.getElementById('form-group-name');
  const roleGroup = document.getElementById('form-group-role');
  const submitBtn = document.getElementById('auth-submit-btn');
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');

  if (mode === 'login') {
    title.innerText = 'Sign In';
    subtitle.innerText = 'Access your recruitment dashboard.';
    nameGroup.style.display = 'none';
    roleGroup.style.display = 'none';
    submitBtn.innerText = 'Log In';
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    document.getElementById('auth-name').required = false;
  } else {
    title.innerText = 'Create Account';
    subtitle.innerText = 'Sign up to apply or post jobs.';
    nameGroup.style.display = 'block';
    roleGroup.style.display = 'block';
    submitBtn.innerText = 'Create Account';
    tabLogin.classList.remove('active');
    tabSignup.classList.add('active');
    document.getElementById('auth-name').required = true;
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const isSignup = document.getElementById('tab-signup').classList.contains('active');

  if (isSignup) {
    const name = document.getElementById('auth-name').value;
    const role = document.querySelector('input[name="auth-role"]:checked').value;

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      showToast('Account created successfully! Logging in...', 'success');
      // Auto login
      await performLogin(email, password);
    } catch (err) {
      showToast(err.message, 'error');
    }
  } else {
    try {
      await performLogin(email, password);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

async function performLogin(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invalid credentials');

  currentUser = data.user;
  localStorage.setItem('currentUser', JSON.stringify(currentUser));
  closeAuthModal();
  showToast(`Welcome back, ${currentUser.name}!`, 'success');
  updateUserInterface();
  loadJobs();
}

function logout() {
  currentUser = null;
  localStorage.removeItem('currentUser');
  showToast('Logged out successfully', 'info');
  updateUserInterface();
  loadJobs();
}

// ==========================================
// Jobs Explorer Module
// ==========================================
async function loadJobs() {
  const grid = document.getElementById('jobs-grid');
  try {
    const res = await fetch(`${API_BASE}/jobs`);
    if (!res.ok) throw new Error('Could not fetch jobs');
    allJobs = await res.json();
    
    document.getElementById('jobs-count').innerText = `${allJobs.length} Job${allJobs.length === 1 ? '' : 's'}`;
    renderJobsGrid(allJobs);
  } catch (err) {
    grid.innerHTML = `<div class="sql-error-box">Error loading jobs: ${err.message}</div>`;
  }
}

function renderJobsGrid(jobs) {
  const grid = document.getElementById('jobs-grid');
  if (jobs.length === 0) {
    grid.innerHTML = '<div class="no-selection-state"><h3>No job listings match your query.</h3></div>';
    return;
  }

  grid.innerHTML = jobs.map(job => {
    const skills = job.required_skills.split(',').map(s => s.trim());
    const isSelected = selectedJobId === job.id ? 'selected' : '';
    return `
      <div class="job-card ${isSelected}" onclick="selectJob(${job.id})">
        <h3>${escapeHTML(job.title)}</h3>
        <div class="company">${escapeHTML(job.company_name)}</div>
        <div class="job-meta-row">
          <div class="job-meta-item">📍 ${escapeHTML(job.location || 'Remote')}</div>
          <div class="job-meta-item">💼 ${job.required_experience} Yrs exp</div>
          <div class="job-meta-item">💵 ${escapeHTML(job.salary || 'Competitive')}</div>
        </div>
        <div class="job-skills-pill-row">
          ${skills.map(s => `<span class="skill-badge">${escapeHTML(s)}</span>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function filterJobs() {
  const query = document.getElementById('job-search-input').value.toLowerCase();
  const filtered = allJobs.filter(job => 
    job.title.toLowerCase().includes(query) ||
    job.company_name.toLowerCase().includes(query) ||
    (job.location && job.location.toLowerCase().includes(query)) ||
    job.required_skills.toLowerCase().includes(query)
  );
  renderJobsGrid(filtered);
}

async function selectJob(jobId) {
  selectedJobId = jobId;
  
  // Add selected class in UI list
  loadJobs(); // Quick re-render to update selected border class

  const detailsPanel = document.getElementById('job-detail-panel');
  detailsPanel.innerHTML = '<div class="no-selection-state"><h3>Loading job description...</h3></div>';

  try {
    const res = await fetch(`${API_BASE}/jobs/${jobId}`);
    if (!res.ok) throw new Error('Failed to load job details');
    const job = await res.json();
    
    const skills = job.required_skills.split(',').map(s => s.trim());

    // Compute Apply Button state
    let actionBtnHtml = '';
    if (!currentUser) {
      actionBtnHtml = `<button class="btn-primary" onclick="showAuthModal('login')">Sign In to Apply</button>`;
    } else if (currentUser.role === 'recruiter') {
      actionBtnHtml = `<span class="badge-status status-screening">Recruiters cannot apply to jobs</span>`;
    } else {
      actionBtnHtml = `<button class="btn-primary" onclick="applyToJob(${job.id})">Submit Smart Application</button>`;
    }

    detailsPanel.innerHTML = `
      <div class="glass-card job-detail-card">
        <div class="job-detail-header">
          <h2>${escapeHTML(job.title)}</h2>
          <div class="company">${escapeHTML(job.company_name)}</div>
          <div class="job-meta-row" style="font-size: 0.9rem;">
            <div class="job-meta-item">📍 <strong>Location:</strong> ${escapeHTML(job.location || 'Remote')}</div>
            <div class="job-meta-item">💼 <strong>Exp required:</strong> ${job.required_experience} Years</div>
            <div class="job-meta-item">💵 <strong>Salary package:</strong> ${escapeHTML(job.salary || 'Negotiable')}</div>
          </div>
        </div>
        
        <div class="job-detail-body">
          <div class="job-section-title">Requirements & Skills</div>
          <div class="job-skills-pill-row mb-4" style="gap: 0.5rem;">
            ${skills.map(s => `<span class="skill-badge" style="font-size: 0.85rem; padding: 0.35rem 0.75rem;">${escapeHTML(s)}</span>`).join('')}
          </div>

          <div class="job-section-title">Detailed Job Description</div>
          <p class="job-description-text">${escapeHTML(job.description)}</p>
        </div>

        <div class="job-detail-footer">
          <div class="text-secondary small">Posted on: ${new Date(job.created_at).toLocaleDateString()}</div>
          ${actionBtnHtml}
        </div>
      </div>
    `;
  } catch (err) {
    detailsPanel.innerHTML = `<div class="sql-error-box">Error loading details: ${err.message}</div>`;
  }
}

async function applyToJob(jobId) {
  if (!currentUser || !currentUser.candidateId) return;

  try {
    const res = await fetch(`${API_BASE}/applications/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        candidate_id: currentUser.candidateId
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit application');

    showToast(`Application submitted! AI Match Score: ${data.matchScore}%`, 'success');
    switchTab('dashboard-tab');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// Candidate Dashboard Module
// ==========================================
async function loadCandidateProfile() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API_BASE}/candidate/profile/${currentUser.id}`);
    if (!res.ok) throw new Error('Failed to load profile');
    const profile = await res.json();

    document.getElementById('prof-title').value = profile.title || '';
    document.getElementById('prof-skills').value = profile.skills || '';
    document.getElementById('prof-exp').value = profile.experience_years || 0;
    document.getElementById('prof-edu').value = profile.education || '';
    document.getElementById('prof-resume').value = profile.resume_text || '';
  } catch (err) {
    showToast('Error getting profile: ' + err.message, 'error');
  }
}

async function saveCandidateProfile(event) {
  event.preventDefault();
  if (!currentUser) return;

  const title = document.getElementById('prof-title').value;
  const skills = document.getElementById('prof-skills').value;
  const experience_years = parseInt(document.getElementById('prof-exp').value);
  const education = document.getElementById('prof-edu').value;
  const resume_text = document.getElementById('prof-resume').value;

  try {
    const res = await fetch(`${API_BASE}/candidate/profile/${currentUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, skills, experience_years, education, resume_text })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Profile updated. Live applications recalculated!', 'success');
    loadCandidateApplications(); // Refresh match scores list
    loadStats(); // Update live averages
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadCandidateApplications() {
  if (!currentUser || !currentUser.candidateId) return;
  const listEl = document.getElementById('candidate-applications-list');
  listEl.innerHTML = '<p>Loading your applications...</p>';

  try {
    const res = await fetch(`${API_BASE}/applications/candidate/${currentUser.candidateId}`);
    if (!res.ok) throw new Error('Could not fetch applications');
    const apps = await res.json();

    if (apps.length === 0) {
      listEl.innerHTML = '<p class="text-secondary">You haven\'t applied to any jobs yet.</p>';
      return;
    }

    listEl.innerHTML = apps.map(app => {
      const scoreClass = app.match_score >= 75 ? 'score-high' : (app.match_score >= 50 ? 'score-medium' : 'score-low');
      const analysis = JSON.parse(app.match_analysis || '{}');
      
      let analysisDetails = '';
      if (analysis.matchedSkills) {
        analysisDetails = `
          <div class="analysis-box" style="margin-top: 0.75rem; font-size: 0.8rem;">
            <div class="analysis-group">
              <div class="analysis-label">Matching Skills Found:</div>
              <div class="analysis-skills">
                ${analysis.matchedSkills.length > 0 
                  ? analysis.matchedSkills.map(s => `<span class="analysis-pill pill-matched">${escapeHTML(s)}</span>`).join('')
                  : '<span class="text-secondary small">None</span>'}
              </div>
            </div>
            <div class="analysis-group">
              <div class="analysis-label">Missing Skills (Target to Learn):</div>
              <div class="analysis-skills">
                ${analysis.missingSkills.length > 0 
                  ? analysis.missingSkills.map(s => `<span class="analysis-pill pill-missing">${escapeHTML(s)}</span>`).join('')
                  : '<span class="text-secondary small">None! Perfect match.</span>'}
              </div>
            </div>
            <div class="analysis-group">
              <div class="analysis-label">Experience Rating:</div>
              <p class="small text-secondary">Earned <strong>${analysis.experienceScore} / 30</strong> experience points.</p>
            </div>
          </div>
        `;
      }

      return `
        <div class="applicant-card" style="padding: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h4 style="font-size: 1.1rem; color: #1e1b4b;">${escapeHTML(app.job_title)}</h4>
              <p style="font-size: 0.85rem; color: var(--primary); font-weight: 600;">${escapeHTML(app.company_name)}</p>
              <div class="text-secondary small mt-2">Applied: ${new Date(app.applied_at).toLocaleDateString()}</div>
            </div>
            <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
              <span class="badge-status status-${app.status}">${app.status}</span>
              <div class="applicant-score-badge ${scoreClass}" style="padding: 0.35rem 0.6rem;">
                <span class="score-value" style="font-size: 1.1rem;">${app.match_score}%</span>
                <span class="score-label" style="font-size: 0.55rem;">Match</span>
              </div>
            </div>
          </div>
          ${analysisDetails}
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="sql-error-box">Error: ${err.message}</div>`;
  }
}

// ==========================================
// Recruiter Dashboard Module
// ==========================================
async function loadRecruiterJobs() {
  if (!currentUser) return;
  const listEl = document.getElementById('recruiter-jobs-list');
  listEl.innerHTML = '<p>Loading your jobs...</p>';

  try {
    const res = await fetch(`${API_BASE}/jobs`);
    if (!res.ok) throw new Error();
    const jobs = await res.json();
    
    // Filter jobs belonging to this recruiter
    managedJobs = jobs.filter(j => j.recruiter_id === currentUser.id);

    if (managedJobs.length === 0) {
      listEl.innerHTML = '<p class="text-secondary">You haven\'t posted any job openings yet.</p>';
      return;
    }

    listEl.innerHTML = managedJobs.map(job => {
      const isSelected = selectedManagedJobId === job.id ? 'selected' : '';
      return `
        <div class="recruiter-job-item ${isSelected}" onclick="selectManagedJob(${job.id})">
          <div class="recruiter-job-info">
            <h4>${escapeHTML(job.title)}</h4>
            <p>📍 ${escapeHTML(job.location || 'Remote')} | Status: <strong>${job.status}</strong></p>
          </div>
          <span class="count-badge" style="background: var(--primary-light);">View Applicants</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = '<p class="text-danger">Failed to load jobs.</p>';
  }
}

async function createJobListing(event) {
  event.preventDefault();
  if (!currentUser) return;

  const title = document.getElementById('job-title').value;
  const required_skills = document.getElementById('job-skills').value;
  const required_experience = parseInt(document.getElementById('job-exp').value) || 0;
  const location = document.getElementById('job-location').value;
  const salary = document.getElementById('job-salary').value;
  const description = document.getElementById('job-desc').value;

  try {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recruiter_id: currentUser.id,
        title, required_skills, required_experience, location, salary, description
      })
    });
    
    if (!res.ok) throw new Error('Could not publish job post');
    
    showToast('Job opening posted successfully!', 'success');
    document.getElementById('job-creation-form').reset();
    loadRecruiterJobs();
    loadJobs(); // Refresh Explorer
    loadStats(); // Refresh Stats
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function selectManagedJob(jobId) {
  selectedManagedJobId = jobId;
  loadRecruiterJobs(); // Redraw selection indicators

  const panel = document.getElementById('recruiter-applicants-panel');
  panel.innerHTML = '<div class="no-selection-state"><h3>Loading applicant records...</h3></div>';

  try {
    const res = await fetch(`${API_BASE}/applications/job/${jobId}`);
    if (!res.ok) throw new Error();
    const applicants = await res.json();
    
    const targetJob = managedJobs.find(j => j.id === jobId);

    if (applicants.length === 0) {
      panel.innerHTML = `
        <h3>Applicants for "${escapeHTML(targetJob.title)}"</h3>
        <p class="text-secondary mt-2 mb-4">No candidates have applied to this job yet.</p>
        <div class="no-selection-state">
          <p>As soon as candidates submit their profiles, they will rank here based on the AI skill score.</p>
        </div>
      `;
      return;
    }

    let cardsHtml = applicants.map(app => {
      const scoreClass = app.match_score >= 75 ? 'score-high' : (app.match_score >= 50 ? 'score-medium' : 'score-low');
      const analysis = JSON.parse(app.match_analysis || '{}');

      // Status selector
      const statuses = ['applied', 'screening', 'interview', 'offered', 'rejected'];
      const statusOptionsHtml = statuses.map(st => 
        `<option value="${st}" ${app.status === st ? 'selected' : ''}>${st.toUpperCase()}</option>`
      ).join('');

      return `
        <div class="applicant-card">
          <div class="applicant-header">
            <div class="applicant-info">
              <h3>${escapeHTML(app.candidate_name)}</h3>
              <div class="title">${escapeHTML(app.candidate_title || 'Candidate')}</div>
              <p class="small text-secondary">📧 ${escapeHTML(app.candidate_email)} | 🎓 ${escapeHTML(app.education || 'No details')}</p>
            </div>
            <div class="applicant-score-badge ${scoreClass}">
              <span class="score-value">${app.match_score}%</span>
              <span class="score-label">AI Score</span>
            </div>
          </div>

          <div class="analysis-box">
            <div class="analysis-title">AI Matching Compliance Analysis</div>
            <div class="analysis-group">
              <div class="analysis-label">Matching Skills:</div>
              <div class="analysis-skills">
                ${analysis.matchedSkills && analysis.matchedSkills.length > 0
                  ? analysis.matchedSkills.map(s => `<span class="analysis-pill pill-matched">${escapeHTML(s)}</span>`).join('')
                  : '<span class="text-secondary small">None</span>'}
              </div>
            </div>
            <div class="analysis-group">
              <div class="analysis-label">Missing Skills:</div>
              <div class="analysis-skills">
                ${analysis.missingSkills && analysis.missingSkills.length > 0
                  ? analysis.missingSkills.map(s => `<span class="analysis-pill pill-missing">${escapeHTML(s)}</span>`).join('')
                  : '<span class="text-secondary small">None! Full coverage.</span>'}
              </div>
            </div>
            <div class="analysis-group">
              <div class="analysis-label">Experience Delta:</div>
              <p class="small text-secondary">Requires <strong>${targetJob.required_experience} years</strong>. Candidate has <strong>${app.experience_years} years</strong>.</p>
            </div>
          </div>

          <div class="applicant-actions">
            <div class="status-select-wrapper">
              <span>Update Status:</span>
              <select class="status-dropdown" onchange="updateApplicationStatus(${app.id}, this.value)">
                ${statusOptionsHtml}
              </select>
            </div>
            <span class="badge-status status-${app.status}">${app.status}</span>
          </div>
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="section-title-bar">
        <h2>Applicants (${applicants.length})</h2>
        <span class="count-badge">${escapeHTML(targetJob.title)}</span>
      </div>
      <p class="text-secondary small mb-4">Ranked in real-time using SQL sorting (ORDER BY match_score DESC).</p>
      <div style="overflow-y: auto; max-height: 520px;">
        ${cardsHtml}
      </div>
    `;
  } catch (err) {
    panel.innerHTML = '<div class="sql-error-box">Failed to load applicant details.</div>';
  }
}

async function updateApplicationStatus(applicationId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/applications/${applicationId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error();
    
    showToast('Application status updated successfully', 'success');
    if (selectedManagedJobId) selectManagedJob(selectedManagedJobId);
    loadStats(); // Update distribution chart
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

// ==========================================
// Statistics & Live Reports Module
// ==========================================
async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/stats`);
    if (!res.ok) throw new Error();
    const stats = await res.json();

    // Populate Counters
    document.getElementById('stat-total-jobs').innerText = stats.summary.jobs;
    document.getElementById('stat-total-candidates').innerText = stats.summary.candidates;
    document.getElementById('stat-total-applications').innerText = stats.summary.applications;
    document.getElementById('stat-avg-score').innerText = `${stats.summary.avgMatchScore}%`;

    // Render Popular Jobs Table (DBMS relational join display)
    const tableBody = document.getElementById('popular-jobs-table-body');
    if (stats.popularJobs.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="3" class="text-secondary text-center">No analytical records found.</td></tr>';
    } else {
      tableBody.innerHTML = stats.popularJobs.map(job => `
        <tr>
          <td><strong>${escapeHTML(job.title)}</strong></td>
          <td>${job.app_count} applications</td>
          <td>
            <span class="badge-status ${job.avg_score >= 70 ? 'status-offered' : (job.avg_score >= 50 ? 'status-screening' : 'status-rejected')}">
              ${job.avg_score ? Math.round(job.avg_score * 10) / 10 + '%' : '0%'}
            </span>
          </td>
        </tr>
      `).join('');
    }

    // Render Funnel chart
    const chartContainer = document.getElementById('status-distribution-chart');
    if (stats.statusDistribution.length === 0) {
      chartContainer.innerHTML = '<p class="text-secondary small">No applications found to compute funnel metrics.</p>';
      return;
    }

    // Find maximum count for scaling
    const maxVal = Math.max(...stats.statusDistribution.map(s => s.count), 1);
    
    const colors = {
      applied: '#0ea5e9',
      screening: '#f59e0b',
      interview: '#d946ef',
      offered: '#10b981',
      rejected: '#ef4444'
    };

    chartContainer.innerHTML = stats.statusDistribution.map(st => {
      const percent = (st.count / maxVal) * 100;
      const color = colors[st.status] || '#64748b';
      return `
        <div class="chart-bar-item">
          <span class="chart-label">${st.status}</span>
          <div class="chart-track">
            <div class="chart-fill" style="width: ${percent}%; background-color: ${color};"></div>
          </div>
          <span class="chart-value">${st.count}</span>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load system analytics:', err);
  }
}

// ==========================================
// SQL Playground Panel Logic
// ==========================================
function toggleSchemaDetail(id) {
  const el = document.getElementById(id);
  if (el.style.display === 'none') el.style.display = 'block';
  else el.style.display = 'none';
}

function loadPresetQuery(sql) {
  document.getElementById('sql-query-editor').value = sql;
}

function clearQueryEditor() {
  document.getElementById('sql-query-editor').value = '';
}

async function executeSQLQuery() {
  const sql = document.getElementById('sql-query-editor').value;
  const resultsPanel = document.getElementById('sql-results-panel');

  if (!sql.trim()) {
    showToast('Please enter a SQL command first!', 'info');
    return;
  }

  resultsPanel.innerHTML = '<p class="text-secondary">Running command against SQLite engine...</p>';

  try {
    const res = await fetch(`${API_BASE}/admin/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sqlQuery: sql })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (data.type === 'select') {
      if (data.count === 0) {
        resultsPanel.innerHTML = `
          <div class="results-summary">Query completed: 0 rows returned.</div>
          <p class="text-secondary small">The statement executed successfully, but no matching rows were returned by the filter criteria.</p>
        `;
        return;
      }

      // Generate HTML Table dynamically
      const headersHtml = data.columns.map(col => `<th>${escapeHTML(col)}</th>`).join('');
      const rowsHtml = data.rows.map(row => 
        `<tr>${data.columns.map(col => `<td>${escapeHTML(String(row[col] === null ? 'NULL' : row[col]))}</td>`).join('')}</tr>`
      ).join('');

      resultsPanel.innerHTML = `
        <div class="results-summary">Query Success: ${data.count} row(s) returned.</div>
        <div class="results-table-wrapper">
          <table class="data-table" style="font-family: monospace; font-size: 0.8rem;">
            <thead>
              <tr>${headersHtml}</tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    } else {
      resultsPanel.innerHTML = `
        <div class="results-summary" style="color: var(--success);">Command Executed Successfully!</div>
        <p style="font-size: 0.9rem; margin-top: 0.25rem;">
          Rows updated/affected: <strong>${data.changes}</strong>
          ${data.lastInsertId ? `| Newly Inserted Primary Key: <strong>${data.lastInsertId}</strong>` : ''}
        </p>
      `;
      // Reload stats and jobs if write query succeeded (e.g. they modified data)
      loadJobs();
      loadStats();
      updateUserInterface();
    }
  } catch (err) {
    resultsPanel.innerHTML = `
      <div class="results-summary" style="color: var(--danger);">SQL Execution Error</div>
      <div class="sql-error-box">${escapeHTML(err.message)}</div>
    `;
  }
}

// Utility HTML escaper to prevent XSS injection
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
