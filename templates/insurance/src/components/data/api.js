// API helper for fetching live data from Bastion Blue server. Falls back to
// pre-baked static fixtures under /static-api/ when the live backend isn't
// reachable — keeps the demo populated on staging or when the server is down.
const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');

function staticFallbackUrl(path) {
  // /api/events?limit=500 → /static-api/events.json
  // /api/events/123       → /static-api/events/123.json
  const noQuery = path.split('?')[0];
  const stripped = noQuery.replace(/^\/api/, '');
  return `${API_BASE}/static-api${stripped}.json`;
}

const IS_PROD_APP = import.meta.env.VITE_APP_MODE === 'production';

async function fetchJSON(path) {
  try {
    const resp = await fetch(`${API_BASE}${path}`);
    const ct = resp.headers.get('content-type') || '';
    if (resp.ok && ct.includes('application/json')) {
      return await resp.json();
    }
  } catch {}
  if (IS_PROD_APP) {
    throw new Error(`No live data for ${path}`);
  }
  const fallback = await fetch(staticFallbackUrl(path));
  if (!fallback.ok) throw new Error(`HTTP ${fallback.status}`);
  return fallback.json();
}

export async function fetchOverview() {
  return fetchJSON('/api/overview');
}

export async function fetchEvents(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return fetchJSON(`/api/events${qs ? '?' + qs : ''}`);
}

export async function fetchEventDetail(id) {
  return fetchJSON(`/api/events/${id}`);
}

export async function fetchAgents() {
  return fetchJSON('/api/agents');
}

export async function fetchTimeline(days = 14) {
  return fetchJSON(`/api/timeline?days=${days}`);
}

export async function fetchHealth() {
  return fetchJSON('/api/health');
}

export async function fetchChangelog() {
  return fetchJSON('/api/changelog');
}

export async function fetchCoverage() {
  return fetchJSON('/api/coverage');
}
