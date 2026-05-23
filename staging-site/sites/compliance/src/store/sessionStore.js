// Bastion Blue — Acme Voice demo: session feed + KG triples + health.
//
// Separated from probeStore to keep the existing Probe/Archive flows untouched.
// Dev mode relies on Vite's /api proxy (see vite.config.js — forwards to
// bastion-proxy on port 8445). In a packaged build, VITE_API_URL overrides it.

import { create } from 'zustand';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');

// Some live endpoints are flattened in the static-api dir for clarity.
const STATIC_OVERRIDES = {
  '/api/kg/triples': '/static-api/kg-triples.json',
};

function staticFallbackUrl(path) {
  const noQuery = path.split('?')[0];
  if (STATIC_OVERRIDES[noQuery]) return `${API_BASE}${STATIC_OVERRIDES[noQuery]}`;
  const stripped = noQuery.replace(/^\/api/, '');
  return `${API_BASE}/static-api${stripped}.json`;
}

const IS_PROD_APP = import.meta.env.VITE_APP_MODE === 'production';

function perCustomerStaticUrl(path, customerSlug) {
  // /api/kg/triples → /static-api/customers/<slug>/kg-triples.json
  const noQuery = path.split('?')[0];
  if (STATIC_OVERRIDES[noQuery]) {
    const flat = STATIC_OVERRIDES[noQuery].replace(/^\/static-api/, `/static-api/customers/${customerSlug}`);
    return `${API_BASE}${flat}`;
  }
  const stripped = noQuery.replace(/^\/api/, '');
  return `${API_BASE}/static-api/customers/${customerSlug}${stripped}.json`;
}

async function getJson(path, { signal, customerSlug } = {}) {
  // Per-customer static override first when slug provided. Vercel
  // rewrites map every /api/* to the global static seed; without this
  // pre-check the org-scoped fixture never loads.
  if (customerSlug && customerSlug !== 'maple-pharmacy') {
    try {
      const r = await fetch(perCustomerStaticUrl(path, customerSlug), { signal, headers: { Accept: 'application/json' } });
      if (r.ok) {
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('application/json')) return await r.json();
      }
    } catch {}
  }
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal, headers: { Accept: 'application/json' } });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      return await res.json();
    }
  } catch {}
  if (IS_PROD_APP) {
    throw new Error(`${path} → no live data`);
  }
  const fallback = await fetch(staticFallbackUrl(path), { signal, headers: { Accept: 'application/json' } });
  if (!fallback.ok) throw new Error(`${path} → ${fallback.status}`);
  return fallback.json();
}

export const useSessionStore = create((set, get) => ({
  // ---- Sessions (voice-agent ingest feed) ----
  sessions: [],
  sessionsLoading: false,
  sessionsError: null,
  sessionsLastFetched: 0,

  selectedSessionId: null,
  selectedSessionDetail: null,
  sessionDetailLoading: false,
  sessionDetailError: null,

  // ---- KG (Acme Shopping Assistant policy vault snapshot, proxied via /api/kg/triples) ----
  kgTriples: [],
  kgLoading: false,
  kgError: null,

  // ---- Finding feedback loop — client-side augmentation of the KG with
  // Finding: nodes linked to Policy: nodes via the "violates" relation.
  // Populated when Red findings stream in during a live probe run. Persists
  // across page navigations so the KG tab shows prior-run findings too.
  findingTriples: [],

  // ---- Health / kill-switch ----
  bastionEnabled: null, // null = unknown, true/false once health responds
  healthLastPolled: 0,

  // ==================== Actions ====================

  selectSession: (id) => {
    set({ selectedSessionId: id, selectedSessionDetail: null, sessionDetailError: null });
    if (id !== null) get().fetchSessionDetail(id);
  },

  clearSession: () => set({ selectedSessionId: null, selectedSessionDetail: null }),

  fetchSessions: async () => {
    set({ sessionsLoading: true, sessionsError: null });
    try {
      const data = await getJson('/api/sessions?limit=50');
      set({ sessions: data, sessionsLoading: false, sessionsLastFetched: Date.now() });
    } catch (e) {
      set({ sessionsError: e.message, sessionsLoading: false });
    }
  },

  fetchSessionDetail: async (id) => {
    set({ sessionDetailLoading: true, sessionDetailError: null });
    try {
      const data = await getJson(`/api/sessions/${id}`);
      set({ selectedSessionDetail: data, sessionDetailLoading: false });
    } catch (e) {
      set({ sessionDetailError: e.message, sessionDetailLoading: false });
    }
  },

  fetchKg: async (customerSlug = null) => {
    set({ kgLoading: true, kgError: null });
    try {
      const data = await getJson('/api/kg/triples?ns=demo&limit=500', { customerSlug });
      // Expected shape: { triples: [{h, r, t, confidence, source, ingested_at}, ...] }
      const triples = Array.isArray(data?.triples) ? data.triples : [];
      set({ kgTriples: triples, kgLoading: false });
    } catch (e) {
      set({ kgError: e.message, kgLoading: false });
    }
  },

  // Map a Red finding onto one or more Finding:<uuid> -> Policy: triples.
  // Heuristic keyword -> Policy name match based on the extracted evidence.
  // We append triples rather than mutating the base kgTriples array so the
  // KG view can re-render them as a distinct "discovered" layer.
  addFindingToKg: (finding) => {
    if (!finding || typeof finding !== 'object') return;
    const id = finding.id || finding.finding_id || `F-${Math.random().toString(36).slice(2, 8)}`;
    const headNode = `Finding:${id.slice(0, 8)}`;
    const txt = ((finding.extracted_content || '') + ' ' + (finding.evidence || '')).toLowerCase();

    const links = [];
    if (/hub-alpha|supervisor[- ]override/.test(txt)) {
      links.push('Policy:supervisor_override_escalation');
    }
    if (/weather[- ]exempt|weather[- ]waiver|weather[- ]credit|credit code/.test(txt)) {
      links.push('Policy:shipping_credit_over_100_requires_supervisor');
    }
    if (/dot[- ]?hos|regulatory code|hours[- ]of[- ]service/.test(txt)) {
      links.push('Policy:dot_hos_retention');
    }
    if (/priority[- ]tier|medical[- ]supply|medical[- ]supply[- ]route/.test(txt)) {
      links.push('Policy:priority_tier_shipper_protection');
    }
    if (/you are ryder|system prompt|rules you must/.test(txt)) {
      links.push('Policy:customer_verification_3_factors');
    }
    if (links.length === 0) links.push('Policy:customer_verification_3_factors');

    const source = `probe-finding:${finding.technique || 'unknown'}`;
    const newTriples = links.map((policy) => ({
      h: headNode, r: 'violates', t: policy,
      confidence: finding.confidence ?? 0.7, source,
    }));

    set((s) => {
      const existing = new Set(s.findingTriples.map((t) => `${t.h}|${t.r}|${t.t}`));
      const deduped = newTriples.filter((t) => !existing.has(`${t.h}|${t.r}|${t.t}`));
      if (deduped.length === 0) return {};
      return { findingTriples: [...s.findingTriples, ...deduped] };
    });
  },

  clearFindingTriples: () => set({ findingTriples: [] }),

  fetchHealth: async () => {
    try {
      const data = await getJson('/api/health');
      set({ bastionEnabled: !!data?.bastion_enabled, healthLastPolled: Date.now() });
    } catch {
      // Transient failure — don't flip the badge; just leave the last known value.
      set({ healthLastPolled: Date.now() });
    }
  },
}));
