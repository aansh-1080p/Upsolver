/* ═══════════════════════════════════════════════════════════════
   CP-Agent Chrome Extension — popup.js
   All application logic: tabs, API, rendering, plan persistence.
   MV3 compliant: no eval, no inline scripts, async/await only.
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = 'http://localhost:8000/api';
const WEB_APP_BASE = 'http://localhost:5173';

function openWebApp(tab = null) {
  const cf = $('#cf-handle')?.value?.trim() || '';
  const lc = $('#lc-handle')?.value?.trim() || '';
  const currentTab = tab || state.activeTab || 'report';

  const params = new URLSearchParams();
  if (cf) params.append('cf', cf);
  if (lc) params.append('lc', lc);
  if (currentTab) params.append('tab', currentTab);

  const url = `${WEB_APP_BASE}/?${params.toString()}`;

  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank');
  }
}

/* ── Storage Abstraction (works outside extension context too) ── */
const storage = {
  async get(key) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return await chrome.storage.local.get(key);
      }
    } catch { /* not in extension context */ }
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem(key);
      return raw ? { [key]: JSON.parse(raw) } : {};
    } catch { return {}; }
  },
  async set(obj) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return await chrome.storage.local.set(obj);
      }
    } catch { /* not in extension context */ }
    // Fallback to localStorage
    try {
      for (const [k, v] of Object.entries(obj)) {
        localStorage.setItem(k, JSON.stringify(v));
      }
    } catch { /* ignore */ }
  }
};

/* ── State ──────────────────────────────────────────────────── */
let state = {
  activeTab: 'report',
  difficulty: 'medium',
  platformFilter: 'all',
  tagQuery: '',
  reportData: null,
  planData: null,
  problemsData: null,
  friends: [],
};


/* ── Helpers ────────────────────────────────────────────────── */
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function show(el)  { el.hidden = false; }
function hide(el)  { el.hidden = true; }

function showToast(msg) {
  const toast = $('#toast');
  $('#toast-msg').textContent = msg;
  show(toast);
  setTimeout(() => hide(toast), 4500);
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ── API Layer ──────────────────────────────────────────────── */
async function apiGet(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('API GET error:', err);
    throw err;
  }
}

async function apiPost(path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(data.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error('API POST error:', err);
    throw err;
  }
}

/* ── Health Check ───────────────────────────────────────────── */
async function checkHealth() {
  try {
    const data = await apiGet('/health');
    const badge = $('#backend-status');
    const label = $('#status-label');
    badge.className = 'status-badge status-online';
    badge.title = `Server Online (${data.active_provider || 'Active'})`;
    label.textContent = 'Server';
  } catch {
    const badge = $('#backend-status');
    const label = $('#status-label');
    badge.className = 'status-badge status-offline';
    badge.title = 'Server Offline';
    label.textContent = 'Server';
  }
}

/* ── Tab System ─────────────────────────────────────────────── */
function switchTab(tabId) {
  state.activeTab = tabId;

  $$('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  $$('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabId}`);
  });

  // Update run button text & difficulty selector visibility
  const texts = {
    report: 'Generate Report',
    plan: 'Create Study Plan',
    problems: 'Find Problems',
  };
  $('#run-btn-text').textContent = texts[tabId] || 'Run';

  const diffGroup = $('#difficulty-group');
  if (diffGroup) {
    if (tabId === 'problems') show(diffGroup);
    else hide(diffGroup);
  }
}

/* ── Run Button ─────────────────────────────────────────────── */
async function handleRun() {
  const cf = $('#cf-handle').value.trim();
  const lc = $('#lc-handle').value.trim();
  if (!cf && !lc) {
    showToast('Enter at least one handle.');
    return;
  }

  const tab = state.activeTab;
  if (tab === 'report') await runReport(cf, lc);
  else if (tab === 'plan') await runPlanGenerate();
  else if (tab === 'problems') await runProblems(cf, lc);
}

/* ═══════════════════════════════════════════════════════════════
   REPORT TAB
   ═══════════════════════════════════════════════════════════════ */

async function runReport(cf, lc) {
  hide($('#report-empty'));
  hide($('#report-content'));
  show($('#report-loading'));
  setRunBtnLoading(true);

  try {
    const data = await apiPost('/report', { cf_username: cf, lc_username: lc });
    state.reportData = data;
    renderReport(data);
  } catch (err) {
    showToast(err.message || 'Failed to generate report');
    show($('#report-empty'));
  } finally {
    hide($('#report-loading'));
    setRunBtnLoading(false);
  }
}

function renderReport(data) {
  const { cf_data: cf = {}, lc_data: lc = {}, analysis: an = {}, report_markdown = '', errors = [] } = data;

  // Errors
  const errEl = $('#report-errors');
  if (errors.length > 0) {
    errEl.innerHTML = errors.map(e => `<div>⚠ ${escHtml(e)}</div>`).join('');
    show(errEl);
  } else {
    hide(errEl);
  }

  // Subtitle
  $('#report-subtitle').textContent =
    `Codeforces: ${cf.handle || '—'} · LeetCode: ${lc.username || '—'}`;

  // Metric cards
  const metrics = [
    { label: 'CF Rating', value: cf.rating || '—', sub: `Rank: ${cf.rank || 'Unrated'}`, cls: 'metric-blue' },
    { label: 'CF Max', value: cf.max_rating || '—', sub: cf.max_rank || '—', cls: 'metric-indigo' },
    { label: 'LC Solved', value: lc.total_solved || 0, sub: `E:${lc.easy_solved||0} M:${lc.medium_solved||0} H:${lc.hard_solved||0}`, cls: 'metric-amber' },
    { label: 'LC Contest', value: lc.contest_rating ? Math.round(lc.contest_rating) : '—', sub: lc.contest_ranking ? `#${lc.contest_ranking}` : 'Unranked', cls: 'metric-green' },
    { label: 'Consistency', value: an.consistency_score ? `${Math.round(an.consistency_score * 100)}%` : '0%', sub: 'Activity regularity', cls: 'metric-rose' },
    { label: 'CF Solved', value: cf.solved_count || 0, sub: `Contests: ${cf.contests_count || 0}`, cls: 'metric-cyan' },
  ];

  $('#metric-cards').innerHTML = metrics.map(m => `
    <div class="metric-card ${m.cls}">
      <div class="metric-label">${m.label}</div>
      <div class="metric-value">${m.value}</div>
      <div class="metric-sub">${m.sub}</div>
    </div>
  `).join('');

  // Chart Data Preparation
  const cfHistory = (cf.contest_history || []).map((c, i) => ({
    label: c.contestName || `#${i + 1}`,
    rating: c.newRating,
  }));
  const lcHistory = (lc.contest_history || [])
    .filter(c => c.attended && (c.rating > 0 || c.ranking > 0))
    .map((c, i) => ({
      label: c.contestName || `LC #${i + 1}`,
      rating: Math.round(c.rating || 0),
    }));

  const canvas = $('#rating-chart');
  const chartEmpty = $('#chart-empty');
  canvas.style.width = '100%';
  canvas.style.height = '200px';

  let currentChart = (cfHistory.length === 0 && lcHistory.length > 0) ? 'lc' : 'cf';

  const updateChartDisplay = (mode) => {
    currentChart = mode;
    $('#btn-chart-cf')?.classList.toggle('active', mode === 'cf');
    $('#btn-chart-lc')?.classList.toggle('active', mode === 'lc');

    const history = mode === 'cf' ? cfHistory : lcHistory;
    const color = mode === 'cf' ? '#2d3436' : '#ff4757';

    if (history.length > 0) {
      hide(chartEmpty);
      requestAnimationFrame(() => drawLineChart(canvas, history.map(h => h.rating), color));
    } else {
      show(chartEmpty);
      chartEmpty.textContent = `No ${mode === 'cf' ? 'Codeforces' : 'LeetCode'} rated contest history.`;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  $('#btn-chart-cf').onclick = () => updateChartDisplay('cf');
  $('#btn-chart-lc').onclick = () => updateChartDisplay('lc');

  updateChartDisplay(currentChart);


  // Weak topics
  const weakList = $('#weak-topics-list');
  const weakTopics = an.weak_topics || [];
  if (weakTopics.length > 0) {
    weakList.innerHTML = weakTopics.map(t => {
      const rate = t.failure_rate != null ? Math.round(t.failure_rate * 100) : (t.fail_rate || 0);
      return `
      <div class="topic-item">
        <span class="topic-name">${escHtml(t.tag)}</span>
        <span>
          <span class="topic-stat">${rate}% fail</span>
          <span class="topic-stat-sub">(${t.attempts || 0})</span>
        </span>
      </div>
    `;
    }).join('');
  } else {
    weakList.innerHTML = '<div class="empty-msg">No major bottlenecks detected.</div>';
  }

  // Structured Evaluation Cards
  const narrativeRaw = an.narrative || report_markdown || '';
  const paragraphs = narrativeRaw.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0 && !p.startsWith('#'));
  const overview = paragraphs[0] || 'Overall competitive programming profile active across platforms.';
  const weaknesses = paragraphs[1] || 'Algorithmic bottlenecks detected in key topic categories.';
  const actions = paragraphs[2] || 'Focus on structured deliberate practice targeting high-error algorithm tags.';

  const narrEl = $('#report-narrative');
  narrEl.innerHTML = `
    <div class="eval-card">
      <div class="eval-title">🎯 Executive Snapshot</div>
      <div class="eval-body">${overview}</div>
    </div>
    <div class="eval-card eval-warn">
      <div class="eval-title">⚠️ Key Vulnerabilities</div>
      <div class="eval-body">${weaknesses}</div>
    </div>
    <div class="eval-card eval-action">
      <div class="eval-title">🚀 Tactical Directives</div>
      <div class="eval-body">${actions}</div>
    </div>
  `;

  show($('#report-content'));
}


/* ═══════════════════════════════════════════════════════════════
   PLAN TAB
   ═══════════════════════════════════════════════════════════════ */

async function runPlanGenerate() {
  const cf = $('#cf-handle').value.trim();
  const lc = $('#lc-handle').value.trim();
  if (!cf && !lc) { showToast('Enter at least one handle.'); return; }

  const goal = $('#plan-goal').value.trim() || 'Improve competitive programming skills';
  const duration = parseInt($('#plan-weeks').value);
  const hours = parseInt($('#plan-hours').value);

  hide($('#plan-weeks-container'));
  hide($('#hitl-bar'));
  hide($('#plan-status-banner'));
  show($('#plan-loading'));
  setRunBtnLoading(true);

  try {
    const data = await apiPost('/plan/generate', {
      cf_username: cf,
      lc_username: lc,
      goal,
      duration_weeks: duration,
      hours_per_day: hours,
    });
    state.planData = data;
    renderPlan(data);
  } catch (err) {
    showToast(err.message || 'Failed to generate plan');
  } finally {
    hide($('#plan-loading'));
    setRunBtnLoading(false);
  }
}

async function handleRevisePlan() {
  const cf = $('#cf-handle').value.trim();
  const lc = $('#lc-handle').value.trim();
  const feedback = $('#hitl-feedback').value.trim();
  if (!feedback) return;

  setBtnLoading('#hitl-revise-btn', true);
  try {
    const data = await apiPost('/plan/revise', { cf_username: cf, lc_username: lc, feedback });
    state.planData = data;
    renderPlan(data);
    $('#hitl-feedback').value = '';
  } catch (err) {
    showToast(err.message || 'Failed to revise plan');
  } finally {
    setBtnLoading('#hitl-revise-btn', false);
  }
}

async function handleApprovePlan() {
  const cf = $('#cf-handle').value.trim();
  const lc = $('#lc-handle').value.trim();

  setBtnLoading('#hitl-approve-btn', true);
  try {
    const data = await apiPost('/plan/approve', { cf_username: cf, lc_username: lc });
    state.planData = data;
    renderPlan(data);
    // Auto-save approved plan
    await savePlan(cf, lc, data.plan, data.progress);
  } catch (err) {
    showToast(err.message || 'Failed to approve plan');
  } finally {
    setBtnLoading('#hitl-approve-btn', false);
  }
}

function getWeekStatus(wIdx, weeks, progress) {
  const subtopics = weeks[wIdx]?.subtopics || [];
  if (subtopics.length === 0) return 'not_started';
  const doneCount = subtopics.filter(s => progress?.completedSubtopics?.[`w${wIdx}_${s}`]).length;
  if (doneCount === 0) return 'not_started';
  if (doneCount === subtopics.length) return 'completed';
  return 'in_progress';
}

function renderPlan(data) {
  const plan = data?.plan || {};
  const weeks = plan?.weeks || [];
  const isApproved = plan?.status === 'approved';
  const progress = data?.progress || state.planProgress || { completedSubtopics: {}, reattempt: {}, notes: {} };
  state.planProgress = progress;

  // Banner
  if (weeks.length > 0) {
    const banner = $('#plan-status-banner');
    banner.className = `plan-banner ${isApproved ? 'banner-approved' : 'banner-draft'}`;
    $('#plan-status-icon').textContent = isApproved ? '✓' : '✦';
    const text = $('#plan-status-text');
    text.innerHTML = isApproved
      ? '<strong>Plan Approved & Locked In!</strong><br><span style="font-size:11px;opacity:0.8;">Check off subtopics & flag sections to re-attempt later.</span>'
      : '<strong>Draft Ready for Review</strong><br><span style="font-size:11px;opacity:0.8;">Review the weekly plan below. Revise or approve.</span>';
    const pill = $('#plan-status-badge');
    pill.textContent = plan.status || 'draft';
    pill.style.background = isApproved ? 'rgba(52,211,153,0.15)' : 'rgba(79,110,247,0.15)';
    pill.style.color = isApproved ? '#34d399' : '#4f6ef7';
    show(banner);
  }

  // Week cards
  if (weeks.length > 0) {
    const grid = $('#plan-weeks-grid');
    grid.innerHTML = weeks.map((w, i) => {
      const currentStatus = getWeekStatus(i, weeks, progress);
      const isReattempt = !!progress.reattempt?.[i];
      const statusLabel = currentStatus === 'completed' ? '🟢 Completed' : currentStatus === 'in_progress' ? '🟡 In Progress' : '⚪ Not Started';

      const subtopics = (w.subtopics || []).map(s => {
        const key = `w${i}_${s}`;
        const checked = !!progress.completedSubtopics?.[key];
        return `
          <button type="button" class="subtopic-chip-interactive ${checked ? 'checked' : ''}" data-subtopic-toggle="${escHtml(key)}" data-week-idx="${i}" data-subtopic-name="${escHtml(s)}">
            <span class="subtopic-checkbox">${checked ? '✓' : ''}</span>
            <span class="subtopic-text">${escHtml(s)}</span>
          </button>
        `;
      }).join('');

      const resources = (w.resources || []).map(r =>
        `<a class="resource-link" href="${escHtml(r.url)}" target="_blank" rel="noopener">
          <span>${escHtml(r.name || 'Resource')}</span>
          <span class="arrow">→</span>
        </a>`
      ).join('');

      return `
        <div class="week-card ${currentStatus === 'completed' ? 'card-completed' : ''} ${isReattempt ? 'card-reattempt' : ''}">
          <div class="week-card-header">
            <div class="week-header-left">
              <span class="week-badge">Week ${w.week || i + 1}</span>
              <span class="week-status-badge status-${currentStatus}">${statusLabel}</span>
              <button type="button" class="reattempt-btn ${isReattempt ? 'active' : ''}" data-reattempt-week="${i}" title="${isReattempt ? 'Flagged to re-attempt later (Click to unflag)' : 'Flag this section to re-attempt later'}">
                <span class="flag-icon">${isReattempt ? '🚩' : '⚐'}</span>
                <span>${isReattempt ? 'Re-attempt Flagged' : 'Re-attempt Later'}</span>
              </button>
            </div>
            <span class="week-meta">${w.problems_per_day || 3} probs/day</span>
          </div>
          <div class="week-topic">${escHtml(w.topic || 'Topic')}</div>
          ${subtopics ? `<div class="subtopic-chips-interactive">${subtopics}</div>` : ''}
          ${resources ? `<div class="resource-list">${resources}</div>` : ''}
        </div>
      `;
    }).join('');
    show($('#plan-weeks-container'));
  }

  // HITL bar
  if (weeks.length > 0 && !isApproved) {
    show($('#hitl-bar'));
  } else {
    hide($('#hitl-bar'));
  }
}

async function handleToggleSubtopic(key) {
  if (!state.planData?.plan) return;
  const progress = state.planProgress || { completedSubtopics: {}, reattempt: {}, notes: {} };
  const current = !progress.completedSubtopics?.[key];
  progress.completedSubtopics = {
    ...progress.completedSubtopics,
    [key]: current
  };
  state.planProgress = progress;
  state.planData.progress = progress;

  const cf = $('#cf-handle')?.value?.trim() || '';
  const lc = $('#lc-handle')?.value?.trim() || '';
  if (cf || lc) {
    await savePlan(cf, lc, state.planData.plan, progress);
    apiPost('/plan/progress', { key: `plan_${cf}_${lc}`, progress }).catch(() => {});
  }

  renderPlan(state.planData);
}

async function handleToggleReattempt(wIdx) {
  if (!state.planData?.plan) return;
  const progress = state.planProgress || { completedSubtopics: {}, reattempt: {}, notes: {} };
  progress.reattempt = {
    ...progress.reattempt,
    [wIdx]: !progress.reattempt?.[wIdx]
  };
  state.planProgress = progress;
  state.planData.progress = progress;

  const cf = $('#cf-handle')?.value?.trim() || '';
  const lc = $('#lc-handle')?.value?.trim() || '';
  if (cf || lc) {
    await savePlan(cf, lc, state.planData.plan, progress);
    apiPost('/plan/progress', { key: `plan_${cf}_${lc}`, progress }).catch(() => {});
  }

  renderPlan(state.planData);
}

/* ── Plan Persistence (chrome.storage.local) ─────────────────── */

async function savePlan(cf, lc, plan, progress = null) {
  const key = `plan_${cf}_${lc}`;
  const prog = progress || state.planProgress || { completedSubtopics: {}, reattempt: {}, notes: {} };
  const entry = {
    cf, lc, plan,
    progress: prog,
    savedAt: new Date().toISOString(),
    label: `${cf || '?'}/${lc || '?'} — ${(plan.weeks || []).length} weeks`,
  };

  const stored = await storage.get('savedPlans');
  const plans = stored.savedPlans || {};
  plans[key] = entry;
  await storage.set({ savedPlans: plans });
  loadSavedPlansList();
}

async function deleteSavedPlan(key) {
  const stored = await storage.get('savedPlans');
  const plans = stored.savedPlans || {};
  delete plans[key];
  await storage.set({ savedPlans: plans });
  loadSavedPlansList();
}

async function loadSavedPlan(key) {
  const stored = await storage.get('savedPlans');
  const plans = stored.savedPlans || {};
  const entry = plans[key];
  if (!entry) return;

  const prog = entry.progress || { completedSubtopics: {}, reattempt: {}, notes: {} };
  state.planProgress = prog;
  state.planData = { plan: entry.plan, progress: prog };
  renderPlan({ plan: entry.plan, progress: prog });
}

async function loadSavedPlansList() {
  const stored = await storage.get('savedPlans');
  const plans = stored.savedPlans || {};
  const keys = Object.keys(plans);
  const container = $('#saved-plans-list');
  const badge = $('#saved-plans-count');
  badge.textContent = keys.length;

  if (keys.length === 0) {
    container.innerHTML = '<p class="empty-msg">No saved plans yet.</p>';
    return;
  }

  container.innerHTML = keys.map(k => {
    const p = plans[k];
    const d = new Date(p.savedAt);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <div class="saved-plan-item">
        <div class="plan-info">
          <span class="plan-name">${escHtml(p.label)}</span>
          <span class="plan-date">${dateStr}</span>
        </div>
        <div class="plan-actions">
          <button class="btn-ghost-sm" data-load-plan="${escHtml(k)}">Load</button>
          <button class="btn-danger-sm" data-delete-plan="${escHtml(k)}">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════════
   PROBLEMS TAB
   ═══════════════════════════════════════════════════════════════ */

async function runProblems(cf, lc) {
  hide($('#problems-empty'));
  $('#problems-grid').innerHTML = '';
  hide($('#problems-filters'));
  show($('#problems-loading'));
  setRunBtnLoading(true);

  try {
    const data = await apiPost('/problems', {
      cf_username: cf,
      lc_username: lc,
      difficulty: state.difficulty,
      count: 30,
    });
    state.problemsData = data;
    renderProblems(data);
  } catch (err) {
    showToast(err.message || 'Failed to find problems');
    show($('#problems-empty'));
  } finally {
    hide($('#problems-loading'));
    setRunBtnLoading(false);
  }
}

function renderProblems(data) {
  const problems = data?.problems || [];
  const weakTopics = data?.weak_topics || [];

  // Weak chips
  const chips = $('#weak-chips');
  if (weakTopics.length > 0) {
    chips.innerHTML = `<span class="control-label" style="margin-right:4px">Weak:</span>` +
      weakTopics.slice(0, 6).map(t => {
        const rate = t.failure_rate != null ? Math.round(t.failure_rate * 100) : (t.fail_rate || 0);
        return `<span class="chip" data-chip-tag="${escHtml(t.tag)}">${escHtml(t.tag)} (${rate}%)</span>`;
      }).join('');
    show(chips);
  } else {
    hide(chips);
  }

  if (problems.length > 0) {
    show($('#problems-filters'));
    renderProblemCards(problems);
  } else {
    show($('#problems-empty'));
  }
}

function renderProblemCards(problems) {
  const pf = state.platformFilter;
  const tq = state.tagQuery.toLowerCase();

  const filtered = problems.filter(p => {
    const matchPlat = pf === 'all' || (p.platform || '').toLowerCase() === pf;
    const matchTag = !tq ||
      (p.tags || []).some(t => t.toLowerCase().includes(tq)) ||
      (p.title || '').toLowerCase().includes(tq);
    return matchPlat && matchTag;
  });

  const grid = $('#problems-grid');
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-msg" style="grid-column:span 3;padding:20px">No matching problems.</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const plat = (p.platform || '').toLowerCase();
    const dotCls = plat === 'codeforces' ? 'dot-cf' : plat === 'cses' ? 'dot-cses' : 'dot-lc';
    const diff = (p.difficulty || 'medium').toLowerCase();
    const diffCls = diff === 'easy' ? 'diff-easy' : diff === 'hard' ? 'diff-hard' : 'diff-medium';

    const tags = (p.tags || []).slice(0, 3).map(t =>
      `<span class="tag-pill">${escHtml(t)}</span>`
    ).join('');

    const ratingBadge = p.rating ? `<span class="difficulty-badge diff-medium" style="margin-right:4px">CF ${p.rating}</span>` : '';

    return `
      <div class="problem-card">
        <div class="problem-top">
          <span class="platform-badge"><span class="platform-dot ${dotCls}"></span>${escHtml(p.platform || 'Unknown')}</span>
          <span>${ratingBadge}<span class="difficulty-badge ${diffCls}">${escHtml(diff)}</span></span>
        </div>
        <div class="problem-title" title="${escHtml(p.title || '')}">${escHtml(p.title || 'Problem')}</div>
        <div class="problem-tags">${tags}</div>
        <div class="problem-bottom">
          ${p.relevance ? `<span class="relevance">★ ${escHtml(String(p.relevance))} match</span>` : '<span style="font-size:10px;color:#5c657a">Practice</span>'}
          <a class="solve-link" href="${escHtml(p.url || '#')}" target="_blank" rel="noopener">Solve →</a>
        </div>
      </div>
    `;
  }).join('');
}

/* (Compare tab removed — peer duel is launched inline from Friends tab) */

function deltaHtml(val) {
  if (val == null) return '';
  if (val > 0) return `<div class="stat-delta delta-ahead">+${val} ahead</div>`;
  if (val < 0) return `<div class="stat-delta delta-behind">${val} behind</div>`;
  return `<div class="stat-delta delta-tied">Tied</div>`;
}

function renderTagList(sel, items, detailFn) {
  const el = $(sel);
  if (items.length === 0) {
    el.innerHTML = '<div class="empty-msg">None detected.</div>';
    return;
  }
  el.innerHTML = items.map(t => `
    <div class="tag-item">
      <div class="tag-name">${escHtml(t.tag)}</div>
      <div class="tag-detail">${detailFn(t)}</div>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════════
   CANVAS CHARTS (lightweight, no external lib)
   ═══════════════════════════════════════════════════════════════ */

function drawLineChart(canvas, values, color) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (values.length < 2) return;

  const pad = { top: 15, right: 15, bottom: 25, left: 40 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const minVal = Math.min(...values) - 50;
  const maxVal = Math.max(...values) + 50;
  const range = maxVal - minVal || 1;

  const toX = (i) => pad.left + (i / (values.length - 1)) * plotW;
  const toY = (v) => pad.top + plotH - ((v - minVal) / range) * plotH;

  // Grid lines
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = '#4a5568';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    const val = Math.round(maxVal - (range / 4) * i);
    ctx.fillText(val, pad.left - 5, y + 3);
  }


  // Fill area
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  grad.addColorStop(0, color + '33');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.moveTo(toX(0), pad.top + plotH);
  values.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
  ctx.lineTo(toX(values.length - 1), pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  values.forEach((v, i) => {
    if (i === 0) ctx.moveTo(toX(i), toY(v));
    else ctx.lineTo(toX(i), toY(v));
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Dots
  ctx.fillStyle = color;
  values.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(toX(i), toY(v), 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawDualLineChart(canvas, vals1, vals2, color1, color2) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const all = [...vals1, ...vals2].filter(v => v != null);
  if (all.length < 2) return;

  const pad = { top: 15, right: 15, bottom: 25, left: 40 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const minVal = Math.min(...all) - 50;
  const maxVal = Math.max(...all) + 50;
  const range = maxVal - minVal || 1;

  const maxLen = Math.max(vals1.length, vals2.length);
  const toX = (i) => pad.left + (i / Math.max(maxLen - 1, 1)) * plotW;
  const toY = (v) => pad.top + plotH - ((v - minVal) / range) * plotH;

  // Grid
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  }

  // Y labels
  ctx.fillStyle = '#4a5568';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    const val = Math.round(maxVal - (range / 4) * i);
    ctx.fillText(val, pad.left - 5, y + 3);
  }


  // Draw lines
  const drawSeries = (vals, color) => {
    if (vals.length < 2) return;
    ctx.beginPath();
    vals.forEach((v, i) => {
      if (i === 0) ctx.moveTo(toX(i), toY(v));
      else ctx.lineTo(toX(i), toY(v));
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.fillStyle = color;
    vals.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(toX(i), toY(v), 2, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  drawSeries(vals1, color1);
  drawSeries(vals2, color2);

  // Legend
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = color1;
  ctx.fillRect(w - pad.right - 120, pad.top, 8, 8);
  ctx.fillStyle = '#8a93a8';
  ctx.fillText('You', w - pad.right - 108, pad.top + 8);
  ctx.fillStyle = color2;
  ctx.fillRect(w - pad.right - 60, pad.top, 8, 8);
  ctx.fillStyle = '#8a93a8';
  ctx.fillText('Peer', w - pad.right - 48, pad.top + 8);
}

/* ═══════════════════════════════════════════════════════════════
   UI HELPERS
   ═══════════════════════════════════════════════════════════════ */

function setRunBtnLoading(loading) {
  const btn = $('#run-btn');
  const text = $('#run-btn-text');
  const spin = $('#run-btn-spinner');
  btn.disabled = loading;
  if (loading) {
    text.textContent = 'Processing…';
    show(spin);
  } else {
    const texts = {
      report: 'Generate Report',
      plan: 'Create Study Plan',
      problems: 'Find Problems',
    };
    text.textContent = texts[state.activeTab] || 'Run';
    hide(spin);
  }
}

function setBtnLoading(sel, loading) {
  const btn = $(sel);
  btn.disabled = loading;
}

/* ═══════════════════════════════════════════════════════════════
   FRIENDS / ROSTER SYSTEM & QUICK DUEL
   ═══════════════════════════════════════════════════════════════ */

async function loadFriendsList() {
  const data = await storage.get('upsolver_friends');
  let friends = data.upsolver_friends;
  if (!Array.isArray(friends)) {
    // Default starter friends
    friends = [
      {
        id: 'f_' + Date.now(),
        name: 'tourist (Benchmark)',
        cf: 'tourist',
        lc: 'neal_wu',
        cfRating: 3850,
        cfRank: 'Legendary Grandmaster',
        lcRating: 3340,
        lcSolved: '2400+',
        lastUpdated: Date.now()
      },
      {
        id: 'f_' + (Date.now() + 1),
        name: 'Ravindra (Peer)',
        cf: 'Ravindra19',
        lc: 'Ravindra056',
        cfRating: 1420,
        cfRank: 'Specialist',
        lcRating: 1780,
        lcSolved: '480',
        lastUpdated: Date.now()
      }
    ];
    await storage.set({ upsolver_friends: friends });
  }
  state.friends = friends;
  renderFriendsList();

  updateFriendsBadge();
  loadContestsInfoForExtension();
}

let liveContestsState = { live: [], upcoming: [], live_standings: {} };

async function loadContestsInfoForExtension() {
  const radarContent = $('#contest-radar-content');
  const statusPill = $('#contest-status-pill');
  if (!radarContent) return;

  try {
    const handles = (state.friends || []).map(f => f.cf).filter(Boolean).join(',');
    const data = await apiGet(`/contests?handles=${encodeURIComponent(handles)}`);
    if (data) {
      liveContestsState = data;
      renderContestRadar();
      renderFriendsList();
    }
  } catch (err) {
    if (statusPill) statusPill.textContent = 'Standby';
  }
}

function renderContestRadar() {
  const radarContent = $('#contest-radar-content');
  const statusPill = $('#contest-status-pill');
  if (!radarContent) return;

  const live = liveContestsState.live || [];
  const upcoming = liveContestsState.upcoming || [];

  if (live.length > 0) {
    if (statusPill) {
      statusPill.textContent = '● LIVE NOW';
      statusPill.style.background = '#10b981';
      statusPill.style.color = '#ffffff';
    }
    radarContent.innerHTML = live.map(c => `
      <div class="contest-live-item" style="padding: 6px 8px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; margin-bottom: 6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color: #059669; font-size: 11px;">🔴 ${escHtml(c.platform)}: ${escHtml(c.name)}</strong>
          <a href="${c.url}" target="_blank" style="color: #ff4757; font-size: 10px; font-weight: bold;">Open ↗</a>
        </div>
        ${renderLiveFriendStandings(c.id)}
      </div>
    `).join('');
  } else {
    if (statusPill) {
      statusPill.textContent = 'Upcoming';
      statusPill.style.background = '#d8e0ea';
      statusPill.style.color = '#2d3436';
    }
    if (upcoming.length > 0) {
      const top2 = upcoming.slice(0, 2);
      radarContent.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${top2.map(uc => {
            const hoursAway = uc.startTimeSeconds ? Math.round((uc.startTimeSeconds - Date.now() / 1000) / 3600) : null;
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; font-size: 11px; padding: 4px 8px; background: #f0f2f5; border-radius: 4px;">
                <span style="font-weight:600; color:#2d3436;">[${escHtml(uc.platform)}] ${escHtml(uc.name)}</span>
                <span style="color:#ff4757; font-weight:bold; font-size:10px;">${hoursAway && hoursAway > 0 ? `in ~${hoursAway}h` : 'Upcoming'}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      radarContent.innerHTML = '<p class="empty-msg" style="padding:4px 0;">No active or scheduled contests currently detected.</p>';
    }
  }
}

function renderLiveFriendStandings(contestId) {
  const standingsMap = liveContestsState.live_standings || {};
  const activeFriends = (state.friends || []).filter(f => f.cf && standingsMap[f.cf.toLowerCase()]);

  if (activeFriends.length === 0) {
    return '<div style="font-size: 10px; color: #4a5568; margin-top: 3px;">No tracked friends in active round.</div>';
  }

  return `
    <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px;">
      ${activeFriends.map(f => {
        const st = standingsMap[f.cf.toLowerCase()];
        return `
          <div style="padding: 2px 6px; background: #ffffff; border: 1px solid #10b981; border-radius: 4px; font-size: 10px; font-weight: bold; color: #065f46;">
            ${escHtml(f.name || f.cf)}: Rank #${st.rank} (${st.points} pts)
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function updateFriendsBadge() {
  const badge = $('#friends-count-badge');
  if (badge) badge.textContent = state.friends.length;
}

function renderFriendsList() {
  const container = $('#friends-list');
  if (!container) return;

  if (!state.friends || state.friends.length === 0) {
    container.innerHTML = '<p class="empty-msg">No friends added yet. Add friends above to track their ratings and launch peer duels.</p>';
    return;
  }

  const standingsMap = liveContestsState.live_standings || {};

  container.innerHTML = state.friends.map(f => {
    const cfDisplay = f.cf ? `@${f.cf}` : '—';
    const lcDisplay = f.lc ? `@${f.lc}` : '—';
    const cfRatingDisplay = f.cfRating ? f.cfRating : '—';
    const lcRatingDisplay = f.lcRating ? f.lcRating : '—';
    const cfTotalSolved = f.cfSolved ?? 0;
    const lcTotalSolved = f.lcSolved ?? 0;
    const totalSolvedCombined = (Number(cfTotalSolved) || 0) + (Number(lcTotalSolved) || 0);
    const initial = (f.name || f.cf || f.lc || 'F').charAt(0).toUpperCase();
    const liveStanding = f.cf ? standingsMap[f.cf.toLowerCase()] : null;

    return `
      <div class="friend-card" data-friend-id="${f.id}">
        <div class="friend-card-left">
          <div class="friend-avatar">${initial}</div>
          <div class="friend-info">
            <div class="friend-name-row">
              <span class="friend-name">${escHtml(f.name || f.cf || 'Friend')}</span>
              ${f.cfRank ? `<span class="friend-rank-tag">${escHtml(f.cfRank)}</span>` : ''}
            </div>
            <div class="friend-handles">
              ${f.cf ? `<span class="friend-handle-cf">CF: <strong>${escHtml(cfDisplay)}</strong></span>` : ''}
              ${f.lc ? `<span class="friend-handle-lc">LC: <strong>${escHtml(lcDisplay)}</strong></span>` : ''}
            </div>
          </div>
        </div>

        <div class="friend-stats-badges">
          <div class="friend-stat-badge">
            <span class="stat-mini-label">CF ELO</span>
            <span class="stat-mini-val cf-val">${cfRatingDisplay}</span>
          </div>
          <div class="friend-stat-badge">
            <span class="stat-mini-label">LC RATING</span>
            <span class="stat-mini-val lc-val">${lcRatingDisplay}</span>
          </div>
        </div>

        <!-- Hover Total Questions Solved (NO easy/medium/hard bifurcation) -->
        <div class="friend-hover-questions" title="Total Problems Solved Across Both Platforms: ${totalSolvedCombined}">
          <span class="hover-icon">📊</span>
          <span class="hover-text">Total: <strong>${totalSolvedCombined}</strong> (CF: ${cfTotalSolved} · LC: ${lcTotalSolved})</span>
        </div>

        ${liveStanding ? `
          <div style="grid-column: 1 / -1; padding: 3px 6px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; border-radius: 4px; font-size: 10px; font-weight: bold; color: #065f46; display: flex; justify-content: space-between;">
            <span>⚡ Live in ${escHtml(liveStanding.contest_name || 'Contest')}:</span>
            <span>Rank #${liveStanding.rank}</span>
          </div>
        ` : ''}

        <div class="friend-actions">
          <button class="btn-primary btn-duel" data-duel-friend="${f.id}" title="Launch Peer Duel" type="button">
            <span>⚔️ Duel</span>
          </button>
          <button class="btn-secondary btn-icon-only" data-refresh-friend="${f.id}" title="Refresh ratings" type="button">
            <span>🔄</span>
          </button>
          <button class="btn-secondary btn-icon-only" data-delete-friend="${f.id}" title="Remove friend" type="button">
            <span>🗑️</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}



async function handleAddFriend() {
  const nameInput = $('#friend-name');
  const cfInput = $('#friend-cf');
  const lcInput = $('#friend-lc');

  const name = nameInput.value.trim();
  const cf = cfInput.value.trim();
  const lc = lcInput.value.trim();

  if (!cf && !lc) {
    showToast('Enter at least a Codeforces handle or LeetCode username.');
    return;
  }

  const newFriend = {
    id: 'f_' + Date.now(),
    name: name || cf || lc || 'Friend',
    cf: cf,
    lc: lc,
    cfRating: null,
    cfRank: null,
    lcRating: null,
    lcSolved: null,
    lastUpdated: Date.now()
  };

  // Try quick fetch of ratings from backend if active
  try {
    const rep = await apiPost('/report', { cf_username: cf, lc_username: lc });
    if (rep) {
      if (rep.cf_data) {
        newFriend.cfRating = rep.cf_data.rating || null;
        newFriend.cfRank = rep.cf_data.rank || null;
      }
      if (rep.lc_data) {
        newFriend.lcRating = rep.lc_data.contest_rating ? Math.round(rep.lc_data.contest_rating) : null;
        newFriend.lcSolved = rep.lc_data.total_solved || null;
      }
    }
  } catch {
    // If backend unavailable, add anyway
  }

  const updated = [newFriend, ...state.friends];
  await storage.set({ upsolver_friends: updated });
  state.friends = updated;
  renderFriendsList();

  updateFriendsBadge();

  nameInput.value = '';
  cfInput.value = '';
  lcInput.value = '';

  showToast(`Added ${newFriend.name} to your friends roster!`);
}

async function handleDeleteFriend(id) {
  const updated = state.friends.filter(f => f.id !== id);
  await storage.set({ upsolver_friends: updated });
  state.friends = updated;
  renderFriendsList();

  updateFriendsBadge();
  showToast('Friend removed from roster.');
}

async function handleRefreshFriend(id) {
  const f = state.friends.find(x => x.id === id);
  if (!f) return;
  showToast(`Refreshing ratings for ${f.name}...`);

  try {
    const rep = await apiPost('/report', { cf_username: f.cf, lc_username: f.lc });
    if (rep) {
      if (rep.cf_data) {
        f.cfRating = rep.cf_data.rating || f.cfRating;
        f.cfRank = rep.cf_data.rank || f.cfRank;
      }
      if (rep.lc_data) {
        f.lcRating = rep.lc_data.contest_rating ? Math.round(rep.lc_data.contest_rating) : f.lcRating;
        f.lcSolved = rep.lc_data.total_solved || f.lcSolved;
      }
      f.lastUpdated = Date.now();
      await storage.set({ upsolver_friends: state.friends });
      renderFriendsList();
    
      showToast(`Updated ratings for ${f.name}!`);
    }
  } catch (err) {
    showToast('Failed to refresh: ' + (err.message || 'Network error'));
  }
}

async function handleRefreshAllFriends() {
  if (!state.friends || state.friends.length === 0) return;
  showToast('Refreshing all friend ratings...');
  for (const f of state.friends) {
    try {
      const rep = await apiPost('/report', { cf_username: f.cf, lc_username: f.lc });
      if (rep) {
        if (rep.cf_data) {
          f.cfRating = rep.cf_data.rating || f.cfRating;
          f.cfRank = rep.cf_data.rank || f.cfRank;
        }
        if (rep.lc_data) {
          f.lcRating = rep.lc_data.contest_rating ? Math.round(rep.lc_data.contest_rating) : f.lcRating;
          f.lcSolved = rep.lc_data.total_solved || f.lcSolved;
        }
      }
    } catch { /* continue */ }
  }
  await storage.set({ upsolver_friends: state.friends });
  renderFriendsList();

  showToast('All friend ratings refreshed!');
}



/* ═══════════════════════════════════════════════════════════════
   EVENT LISTENERS (no inline handlers — MV3 compliant)
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  // Health check
  await checkHealth();

  // Tab navigation
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Launch full web dashboard buttons
  $('#open-site-btn')?.addEventListener('click', () => openWebApp(state.activeTab));
  $('#open-plan-site-btn')?.addEventListener('click', () => openWebApp('plan'));

  // Run button
  $('#run-btn').addEventListener('click', handleRun);

  // Plan tab
  $('#plan-generate-btn').addEventListener('click', runPlanGenerate);
  $('#hitl-revise-btn').addEventListener('click', handleRevisePlan);
  $('#hitl-approve-btn').addEventListener('click', handleApprovePlan);

  // Problems tab — difficulty
  $$('#difficulty-control .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#difficulty-control .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.difficulty = btn.dataset.val;
    });
  });

  // Problems tab — platform filter
  $$('#platform-control .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#platform-control .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.platformFilter = btn.dataset.val;
      if (state.problemsData) renderProblemCards(state.problemsData.problems || []);
    });
  });

  // Problems tab — tag search
  $('#tag-search').addEventListener('input', (e) => {
    state.tagQuery = e.target.value;
    if (state.problemsData) renderProblemCards(state.problemsData.problems || []);
  });

  // Friends tab events
  $('#add-friend-btn')?.addEventListener('click', handleAddFriend);
  $('#refresh-all-friends-btn')?.addEventListener('click', handleRefreshAllFriends);

  // Delegated events for Friends list (Refresh / Delete)
  $('#friends-list')?.addEventListener('click', async (e) => {
    const refreshBtn = e.target.closest('[data-refresh-friend]');
    const deleteBtn = e.target.closest('[data-delete-friend]');

    if (refreshBtn) {
      await handleRefreshFriend(refreshBtn.dataset.refreshFriend);
    } else if (deleteBtn) {
      await handleDeleteFriend(deleteBtn.dataset.deleteFriend);
    }
  });

  // Saved plans — load list
  await loadSavedPlansList();

  // Load Friends List
  await loadFriendsList();

  // Delegated events for saved plans (load / delete)
  $('#saved-plans-list').addEventListener('click', async (e) => {
    const loadBtn = e.target.closest('[data-load-plan]');
    const delBtn = e.target.closest('[data-delete-plan]');
    if (loadBtn) await loadSavedPlan(loadBtn.dataset.loadPlan);
    if (delBtn) await deleteSavedPlan(delBtn.dataset.deletePlan);
  });

  // Delegated events for plan weeks (subtopic toggle & re-attempt toggle)
  $('#plan-weeks-grid')?.addEventListener('click', async (e) => {
    const subtopicBtn = e.target.closest('[data-subtopic-toggle]');
    const reattemptBtn = e.target.closest('[data-reattempt-week]');

    if (subtopicBtn) {
      const key = subtopicBtn.dataset.subtopicToggle;
      await handleToggleSubtopic(key);
    } else if (reattemptBtn) {
      const wIdx = parseInt(reattemptBtn.dataset.reattemptWeek, 10);
      await handleToggleReattempt(wIdx);
    }
  });

  // Delegated events for weak topic chips
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip-tag]');
    if (chip) {
      state.tagQuery = chip.dataset.chipTag;
      const search = $('#tag-search');
      if (search) search.value = state.tagQuery;
      if (state.problemsData) renderProblemCards(state.problemsData.problems || []);
    }
  });
});

