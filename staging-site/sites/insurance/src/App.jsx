import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { SideNav } from './components/layout/SideNav';
import { TopBar } from './components/layout/TopBar';
import { RiskNotificationRail } from './components/layout/RiskNotificationRail';

import { FleetOverview } from './components/views/FleetOverview';
import { PolicyConfig } from './components/views/PolicyConfig';
import { VoiceTestingView } from './components/views/VoiceTestingView';
import { FleetView } from './components/views/FleetView';
import ReportsView from './components/views/ReportsView';
import ChangelogModal, { shouldAutoOpenChangelog } from './components/common/ChangelogModal';
import CliLogin from './components/auth/CliLogin';
import ProductionGate from './components/auth/ProductionGate';
import DemoGate from './components/auth/DemoGate';
import Docs from './components/views/Docs';
import { fetchEvents, fetchAgents, fetchOverview, fetchEventDetail, fetchTimeline, fetchChangelog } from './components/data/api';

const EMPTY_DATA = {
  events: [],
  agents: [],
  agentMeta: {
    sera_intake:         { color: '#2563eb', label: 'Sera (Intake)' },
    pharmacist_callback: { color: '#1e40af', label: 'Pharmacist Callback' },
    refill_router:       { color: '#3b82f6', label: 'Refill Router' },
    insurance_sync:      { color: '#1d4ed8', label: 'Insurance Sync' },
    triage_classifier:   { color: '#60a5fa', label: 'Triage Classifier' },
    compliance_monitor:  { color: '#475569', label: 'Compliance Monitor' },
  },
  overview: { total_requests: 0, total_cost: 0, avg_latency: 0, pii_exposures: 0, fleet_risk: 0, agents_monitored: 0 },
  timeline: [],
  policies: [],
  tool_stats: [],
  pii_summary: [],
};

// Map a URL pathname to the initial dashboard view. Strips the Vite BASE_URL
// (e.g. '/bastion-blue/') and the audience-split '/dev' prefix, then takes
// the first remaining segment as the view id when it matches a known view.
// Lets links like `demo.pistonsolutions.ai/bastion-blue/red` land directly
// on Adversarial Assessment instead of the default Fleet Overview.
// New consolidated view set. Pre-consolidation 14-section count was
// reduced to 7 by merging buyer-irrelevant subdivisions behind tabs
// (see SideNav.jsx). Each consolidated view accepts an `initialTab`
// prop driven by the legacy redirect map below so deep-links still
// land on the right tab.
const VALID_VIEWS = new Set([
  'overview', 'voice-testing', 'fleet', 'reports', 'config',
]);

// Map legacy top-level view IDs to their new consolidated home.
// Format: legacy -> { view, tab? }. `tab` (when present) is forwarded
// to the consolidated view's initialTab prop so the legacy bookmark
// lands on the right pane.
const LEGACY_REDIRECTS = {
  voice:           { view: 'voice-testing', tab: 'voice' },
  sockets:         { view: 'voice-testing', tab: 'sockets' },
  spawn:           { view: 'voice-testing', tab: 'spawn' },
  red:             { view: 'voice-testing', tab: 'red' },
  agents:          { view: 'fleet', tab: 'agents' },
  telemetry:       { view: 'fleet', tab: 'live' },
  drilldown:       { view: 'fleet', tab: 'live' },
  sessions:        { view: 'fleet', tab: 'sessions' },
  vault:           { view: 'fleet', tab: 'sessions' },
  'knowledge-graph': { view: 'fleet', tab: 'graph' },
  'risk-coverage': { view: 'reports' },
  risk:            { view: 'reports' },
  coverage:        { view: 'reports' },
  report:          { view: 'reports' },
  posture:         { view: 'reports' },
};
const REDIRECTS = Object.fromEntries(
  Object.entries(LEGACY_REDIRECTS).map(([k, v]) => [k, v.view])
);
function resolveInitialTab(rawView) {
  return LEGACY_REDIRECTS[rawView]?.tab || null;
}

function detectInitialView() {
  if (typeof window === 'undefined') return 'overview';
  let path = window.location.pathname || '/';
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  if (base && path.startsWith(base)) path = path.slice(base.length);
  if (path === '/dev' || path.startsWith('/dev/')) path = path.slice(4) || '/';
  if (path.startsWith('/')) path = path.slice(1);
  const first = (path.split('/')[0] || '').toLowerCase();
  if (REDIRECTS[first]) return REDIRECTS[first];
  return VALID_VIEWS.has(first) ? first : 'overview';
}

export default function App() {
  // /cli-login is a special, Clerk-gated route used by `bastion login` in the
  // CLI. Short-circuit before the dashboard renders so the rest of App's
  // data-loading effects don't fire.
  if (typeof window !== 'undefined' && window.location.pathname === '/cli-login') {
    return <CliLogin />;
  }
  // /docs — public quickstart for the SDK. Same short-circuit pattern.
  if (typeof window !== 'undefined' && window.location.pathname === '/docs') {
    return <Docs />;
  }

  const [currentView, setCurrentView] = useState(detectInitialView());
  // Cross-view tab jump. When a child requests `navigate('voice-testing', 'schedule')`,
  // App switches view AND signals the target consolidated view to open
  // a specific tab via a monotonically-bumping nonce so the inner view
  // can useEffect on it and not get stuck on its initial tab state.
  const [tabRequest, setTabRequest] = useState({ view: null, tab: null, nonce: 0 });
  const navigate = (view, tab) => {
    if (tab) setTabRequest((r) => ({ view, tab, nonce: r.nonce + 1 }));
    setCurrentView(view);
  };
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [data, setData] = useState(EMPTY_DATA);
  const [reportData, setReportData] = useState(null);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogAutoOpened, setChangelogAutoOpened] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Signed-in tenants must never see the seed fixtures. The static
  // /api/overview, /api/agents, /api/events, /api/timeline endpoints
  // are vercel-rewritten to bundled JSON files that ship Acme-Inc /
  // Sera-pharmacy demo numbers. For an authenticated user we keep
  // `data` at EMPTY_DATA so every metric renders 0 and every view
  // surfaces its empty state. Anonymous viewers (demo) still get
  // the curated fixtures because the loadData fetch path runs.
  const { isSignedIn } = useUser();

  const loadData = useCallback(async () => {
    if (isSignedIn) {
      // Tenant-clean default: zero data. Backend org-scoped feeds
      // (Phase 3 wiring) populate views that consume `useVoiceToken`
      // directly (PostureReportView live panel, CiRunsPanel).
      setData(EMPTY_DATA);
      setReportData(null);
      setLoading(false);
      return;
    }
    try {
      const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');
      const isProdApp = import.meta.env.VITE_APP_MODE === 'production';
      const fetchReport = async () => {
        try {
          const live = await fetch(`${API_BASE}/api/report?from=2025-10-01&to=2026-03-25&customer=Acme%20Logistics`);
          if (live.ok) return live.json();
        } catch {}
        if (isProdApp) return null;
        const fallback = await fetch(`${API_BASE}/static-api/report.json`);
        if (fallback.ok) return fallback.json();
        return null;
      };

      const [eventsResp, agentsResp, overviewResp, timelineResp, reportResp] = await Promise.all([
        fetchEvents({ limit: 500 }),
        fetchAgents(),
        fetchOverview(),
        fetchTimeline(14).catch(() => []),
        fetchReport(),
      ]);
      if (reportResp) setReportData(reportResp);

      const knownAgents = new Set(Object.keys(EMPTY_DATA.agentMeta));

      // Normalize API field names
      let events = (eventsResp.events || eventsResp || [])
        .filter(e => knownAgents.has(e.agent || e.agent_id))
        .map(e => ({
          ...e,
          agent: e.agent || e.agent_id,
          query_preview: e.query_preview || '',
          content: e.query_preview || e.content || '',
        }));

      // Count PII detections per agent from events
      const piiPerAgent = {};
      for (const e of events) {
        try {
          const dets = typeof e.detections === 'string' ? JSON.parse(e.detections) : (e.detections || []);
          if (dets.some(d => d.rail === 'pii')) {
            const aid = e.agent || e.agent_id;
            piiPerAgent[aid] = (piiPerAgent[aid] || 0) + 1;
          }
        } catch {}
      }

      let agentsList = (agentsResp.agents || agentsResp || [])
        .filter(a => knownAgents.has(a.id || a.agent_id))
        .map(a => {
          const id = a.id || a.agent_id;
          return {
            ...a,
            id,
            total_cost: a.total_cost ?? a.total_cost_usd ?? 0,
            avg_latency: a.avg_latency ?? a.avg_latency_ms ?? 0,
            pii_count: piiPerAgent[id] || 0,
            risk_score: a.risk_score ?? +((((a.flags || 0) + (a.blocks || 0) * 3) / Math.max(a.total_requests || 1, 1)) * 100).toFixed(2),
            total_requests: a.total_requests ?? 0,
            last_seen: a.last_seen ?? null,
            status: a.status ?? 'online',
          };
        });

      // Normalize overview
      const overview = overviewResp ? {
        ...overviewResp,
        total_cost: overviewResp.total_cost ?? overviewResp.total_cost_usd ?? 0,
        pii_exposures: overviewResp.pii_exposures ?? overviewResp.total_flags ?? 0,
        agents_monitored: overviewResp.agents_monitored ?? overviewResp.unique_agents ?? 0,
      } : undefined;

      // Normalize timeline for charts
      const rawTimeline = Array.isArray(timelineResp) ? timelineResp : (timelineResp?.buckets || []);
      const timeline = rawTimeline.map(t => ({
        date: t.date,
        label: new Date(t.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        requests: t.requests || 0,
        cost: t.cost_usd ?? t.cost ?? 0,
        risk_events: (t.flags || 0) + (t.blocks || 0),
        risk_score: t.risk_score ?? 0,
        pii_detections: t.flags || 0,
        // Split cost by agent share
        phone_support_cost: (t.cost_usd ?? t.cost ?? 0) * 0.26,
        grid_checker_cost: (t.cost_usd ?? t.cost ?? 0) * 0.18,
        outage_dispatcher_cost: (t.cost_usd ?? t.cost ?? 0) * 0.18,
        billing_assistant_cost: (t.cost_usd ?? t.cost ?? 0) * 0.16,
        safety_coordinator_cost: (t.cost_usd ?? t.cost ?? 0) * 0.10,
        compliance_monitor_cost: (t.cost_usd ?? t.cost ?? 0) * 0.12,
      }));

      // Compute pii_summary from event detections
      const piiCounts = { Email: 0, Phone: 0, SSN: 0, CreditCard: 0, HealthID: 0 };
      for (const e of events) {
        try {
          const dets = typeof e.detections === 'string' ? JSON.parse(e.detections) : (e.detections || []);
          for (const d of dets) {
            if (d.rail === 'pii') {
              for (const type of Object.keys(piiCounts)) {
                if (d.detail?.includes(type)) piiCounts[type]++;
              }
            }
          }
        } catch {}
      }
      const pii_summary = Object.entries(piiCounts).map(([type, count]) => ({ type, count, color: '#3b82f6' }));

      setData(prev => ({
        ...prev,
        events,
        agents: agentsList,
        overview: overview || prev.overview,
        timeline: timeline.length > 0 ? timeline : prev.timeline,
        pii_summary,
      }));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Auto-open changelog once per latest entry
  useEffect(() => {
    fetchChangelog()
      .then(d => {
        const list = Array.isArray(d) ? d : (d?.entries || []);
        const latest = list[0]?.date;
        if (shouldAutoOpenChangelog(latest)) {
          setChangelogOpen(true);
          setChangelogAutoOpened(true);
        }
      })
      .catch(() => {});
  }, []);

  // When an event is selected for drilldown, fetch full details
  useEffect(() => {
    if (!selectedEventId) {
      setSelectedEvent(null);
      return;
    }
    // Check if we already have full details in the events list
    const existing = data.events.find(e => e.id === selectedEventId);
    if (existing && existing.response_content) {
      setSelectedEvent(existing);
      return;
    }
    // Fetch full details from API
    fetchEventDetail(selectedEventId)
      .then(event => setSelectedEvent(event))
      .catch(() => setSelectedEvent(existing || null));
  }, [selectedEventId, data.events]);

  const handleSearch = (targetView, queryText) => {
    if (targetView && targetView !== currentView) setCurrentView(targetView);
  };

  const handleInspectEvent = (eventId) => {
    // Live Activity lives as a tab inside Fleet now; route there.
    setSelectedEventId(eventId);
    if (currentView !== 'fleet') setCurrentView('fleet');
  };

  // When we arrive via a legacy redirect (e.g. ?view=spawn → voice-testing
  // with initial tab "spawn"), resolveInitialTab pulls the target tab from
  // the LEGACY_REDIRECTS map. We compute it once at mount; subsequent
  // user-driven tab switches are owned by the view itself.
  const initialTabForCurrent = (() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const legacyView = params.get('view');
    return legacyView ? resolveInitialTab(legacyView) : null;
  })();

  const renderView = () => {
    switch (currentView) {
      case 'overview':      return <FleetOverview data={data} loading={loading} setCurrentView={setCurrentView} onInspect={handleInspectEvent} reportData={reportData} />;
      case 'voice-testing': return (
        <VoiceTestingView
          setCurrentView={setCurrentView}
          navigate={navigate}
          initialTab={initialTabForCurrent || 'spawn'}
          tabRequest={tabRequest.view === 'voice-testing' ? tabRequest : null}
        />
      );
      case 'fleet':         return (
        <FleetView
          data={data}
          loading={loading}
          onInspect={handleInspectEvent}
          selectedEvent={selectedEvent}
          selectedEventId={selectedEventId}
          setSelectedEventId={setSelectedEventId}
          initialTab={initialTabForCurrent || 'agents'}
        />
      );
      case 'reports':       return <ReportsView data={data} navigate={navigate} tabRequest={tabRequest.view === 'reports' ? tabRequest : null} />;
      case 'config':        return <PolicyConfig data={data} setCurrentView={setCurrentView} />;
      default:              return <FleetOverview data={data} loading={loading} setCurrentView={setCurrentView} onInspect={handleInspectEvent} reportData={reportData} />;
    }
  };

  return (
    <DemoGate><ProductionGate>
      <div className="min-h-screen font-sans bg-slate-50 dark:bg-[#0B1120] text-slate-800 dark:text-slate-300 flex transition-colors duration-300 tech-grid">
        <SideNav currentView={currentView} setCurrentView={setCurrentView} />

        <main className="flex-1 sm:ml-[220px] h-screen overflow-y-auto overflow-x-hidden flex flex-col pb-16 sm:pb-0 relative z-10">
          <TopBar onSearch={handleSearch} setCurrentView={setCurrentView} onOpenChangelog={() => { setChangelogAutoOpened(false); setChangelogOpen(true); }} events={data.events} />
          <section className="flex-1 bg-transparent transition-colors duration-300 p-0 sm:p-6">
            <div className="h-full border-x border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-sm relative px-6 sm:px-10 py-8">
              {error && import.meta.env.VITE_APP_MODE !== 'production' && (
                <div className="mb-4 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 text-xs font-mono">
                  API: {error}, showing cached data
                </div>
              )}
              {renderView()}
            </div>
          </section>
        </main>
        <ChangelogModal
          open={changelogOpen}
          autoOpen={changelogAutoOpened}
          onClose={() => { setChangelogOpen(false); setChangelogAutoOpened(false); }}
        />
        {/* Risk notification rail — Windows-style toast stack pinned to the
            right edge with deep-links into the Live Activity inspector and a
            persistent Slack/email connect button. */}
        <RiskNotificationRail
          data={data}
          currentView={currentView}
          navigate={(view, eventId) => {
            if (eventId !== undefined) setSelectedEventId(eventId);
            setCurrentView(view);
          }}
        />
      </div>
    </ProductionGate></DemoGate>
  );
}
