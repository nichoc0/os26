// API helper for fetching live data from Bastion Blue server. Falls back to
// pre-baked static fixtures under /static-api/ when the live backend isn't
// reachable — keeps the demo populated on staging or when the server is down.
const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');

function staticFallbackUrl(path, customerSlug) {
  // /api/events?limit=500 → /static-api/events.json
  // /api/events/123       → /static-api/events/123.json
  // With customerSlug:    → /static-api/customers/<slug>/<thing>.json (when one exists)
  const noQuery = path.split('?')[0];
  const stripped = noQuery.replace(/^\/api/, '');
  if (customerSlug) {
    return `${API_BASE}/static-api/customers/${customerSlug}${stripped}.json`;
  }
  return `${API_BASE}/static-api${stripped}.json`;
}

const IS_PROD_APP = import.meta.env.VITE_APP_MODE === 'production';

async function fetchJSON(path, { customerSlug } = {}) {
  // Per-customer static override FIRST when slug is provided. The
  // vercel rewrites in vercel.json map every /api/* route to the
  // global /static-api/<thing>.json, so going through the live API
  // path here returns the default pharmacy seed for /api/agents etc.
  // even when we want a per-customer view. Try the per-customer file
  // first; only fall through to the live API / global static when no
  // per-customer override exists for this path.
  if (customerSlug && customerSlug !== 'maple-pharmacy') {
    try {
      const perCustomer = await fetch(staticFallbackUrl(path, customerSlug));
      if (perCustomer.ok) {
        const ct = perCustomer.headers.get('content-type') || '';
        if (ct.includes('application/json')) return await perCustomer.json();
      }
    } catch {}
    // Per-customer file was missing. DO NOT fall through to the
    // global pharmacy fixtures — that's how pharmacy tool calls
    // (check_rx_history, patient_id, metformin) leaked into the
    // Bahrain Bank inspector. Throw so the caller can fall back to
    // whatever list-entry data it already has, or render an empty
    // detail panel.
    throw new Error(`No per-customer fixture for ${customerSlug}${path}`);
  }
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
  // Global static fallback.
  const fallback = await fetch(staticFallbackUrl(path));
  if (!fallback.ok) throw new Error(`HTTP ${fallback.status}`);
  return fallback.json();
}

export async function fetchOverview(opts = {}) {
  return fetchJSON('/api/overview', opts);
}

export async function fetchEvents(params = {}, opts = {}) {
  const qs = new URLSearchParams(params).toString();
  return fetchJSON(`/api/events${qs ? '?' + qs : ''}`, opts);
}

export async function fetchEventDetail(id, opts = {}) {
  return fetchJSON(`/api/events/${id}`, opts);
}

export async function fetchAgents(opts = {}) {
  return fetchJSON('/api/agents', opts);
}

export async function fetchTimeline(days = 14, opts = {}) {
  return fetchJSON(`/api/timeline?days=${days}`, opts);
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
