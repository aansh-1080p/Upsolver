/**
 * src/api.js — API client for CP-Agent FastAPI backend
 */

const API_BASE = '/api';

export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Health check failed');
    return await res.json();
  } catch (err) {
    console.error('API health check error:', err);
    return { status: 'offline', active_provider: 'Offline' };
  }
}

export async function generateReport({ cf_username, lc_username, no_cache = false }) {
  const res = await fetch(`${API_BASE}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cf_username, lc_username, no_cache }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to generate report' }));
    throw new Error(err.detail || 'Failed to generate report');
  }
  return await res.json();
}

export async function generatePlan({ cf_username, lc_username, goal, duration_weeks, hours_per_day }) {
  const res = await fetch(`${API_BASE}/plan/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cf_username,
      lc_username,
      goal,
      duration_weeks: Number(duration_weeks),
      hours_per_day: Number(hours_per_day),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to generate study plan' }));
    throw new Error(err.detail || 'Failed to generate study plan');
  }
  return await res.json();
}

export async function revisePlan({ cf_username, lc_username, feedback }) {
  const res = await fetch(`${API_BASE}/plan/revise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cf_username, lc_username, feedback }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to revise plan' }));
    throw new Error(err.detail || 'Failed to revise plan');
  }
  return await res.json();
}

export async function approvePlan({ cf_username, lc_username }) {
  const res = await fetch(`${API_BASE}/plan/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cf_username, lc_username }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to approve plan' }));
    throw new Error(err.detail || 'Failed to approve plan');
  }
  return await res.json();
}

export async function searchProblems({ cf_username, lc_username, difficulty = 'medium', count = 30 }) {
  const res = await fetch(`${API_BASE}/problems`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cf_username, lc_username, difficulty, count: Number(count) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to search problems' }));
    throw new Error(err.detail || 'Failed to search problems');
  }
  return await res.json();
}

export async function comparePeers({ cf_username, lc_username, peer_cf, peer_lc }) {
  const res = await fetch(`${API_BASE}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cf_username, lc_username, peer_cf, peer_lc }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to compare profiles' }));
    throw new Error(err.detail || 'Failed to compare profiles');
  }
  return await res.json();
}

export async function getSavedPlans(cf_username, lc_username) {
  let url = `${API_BASE}/plans`;
  const params = new URLSearchParams();
  if (cf_username) params.append('cf_username', cf_username);
  if (lc_username) params.append('lc_username', lc_username);
  const qs = params.toString();
  if (qs) url += `?${qs}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch saved plans' }));
    throw new Error(err.detail || 'Failed to fetch saved plans');
  }
  return await res.json();
}

export async function getSinglePlan(key) {
  const res = await fetch(`${API_BASE}/plans/${encodeURIComponent(key)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch plan' }));
    throw new Error(err.detail || 'Failed to fetch plan');
  }
  return await res.json();
}

export async function savePlanToServer({ cf_username, lc_username, plan, label, progress }) {
  const res = await fetch(`${API_BASE}/plans/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cf_username, lc_username, plan, label, progress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to save plan' }));
    throw new Error(err.detail || 'Failed to save plan');
  }
  return await res.json();
}

export async function updatePlanProgress(key, progress) {
  const res = await fetch(`${API_BASE}/plans/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, progress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update plan progress' }));
    throw new Error(err.detail || 'Failed to update plan progress');
  }
  return await res.json();
}

export async function deletePlanFromServer(key) {
  const res = await fetch(`${API_BASE}/plans/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to delete plan' }));
    throw new Error(err.detail || 'Failed to delete plan');
  }
  return await res.json();
}

export async function getContests(handles = '') {
  let url = `${API_BASE}/contests`;
  if (handles) url += `?handles=${encodeURIComponent(handles)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch contests' }));
    throw new Error(err.detail || 'Failed to fetch contests');
  }
  return await res.json();
}

export async function refreshFriendsBatch(friends = []) {
  const res = await fetch(`${API_BASE}/friends/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friends }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to refresh friends' }));
    throw new Error(err.detail || 'Failed to refresh friends');
  }
  return await res.json();
}

