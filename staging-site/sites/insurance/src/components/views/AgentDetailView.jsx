import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Eye } from '@phosphor-icons/react';
import { getAgentCatalog, getAgentById, getFleetTotals } from '../../data/agentCatalog';
import { LiveTelemetry } from './LiveTelemetry';
import { useModeStore } from '../../store/modeStore';
import { usePersona } from '../../store/personaStore';

// AgentDirectory + per-agent detail. ONE clean page per agent — no
// duplicated nav layers. Drill-down is Agent → Session → Tool call
// (Luyun's canonical flow). Cross-agent Tools/Vault/KG live at the
// top-level FleetView tabs, not here.
//
// URL state: ?agent=<id|all> persists the open agent across refresh
// and Slack deep-links from Live Activity / Vault / Posture Report.

function readUrl() {
  if (typeof window === 'undefined') return { agentId: null };
  const p = new URLSearchParams(window.location.search);
  return { agentId: p.get('agent') || null };
}

function writeUrl(agentId) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (agentId) url.searchParams.set('agent', agentId);
  else url.searchParams.delete('agent');
  // Clean up any stale subtab param from the prior nested-nav version.
  url.searchParams.delete('subtab');
  window.history.replaceState({}, '', url.toString());
}

export function AgentDirectoryWithDetail({ data, onInspect, selectedEvent, selectedEventId, setSelectedEventId }) {
  const persona = usePersona();
  const personaSlug = persona?.slug || 'maple-pharmacy';
  const initial = readUrl();
  const [agentId, setAgentIdState] = useState(initial.agentId);

  const setAgentId = (id) => { setAgentIdState(id); writeUrl(id); };

  useEffect(() => {
    const onPop = () => setAgentIdState(readUrl().agentId);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (!agentId) {
    return <AgentDirectory onSelect={setAgentId} data={data} personaSlug={personaSlug} />;
  }

  const isAll = agentId === 'all';
  const agent = isAll ? null : getAgentById(personaSlug, agentId);
  if (!isAll && !agent) {
    return <AgentDirectory onSelect={setAgentId} data={data} personaSlug={personaSlug} />;
  }

  return (
    <AgentDetail
      agent={agent}
      isAll={isAll}
      personaSlug={personaSlug}
      onBack={() => setAgentId(null)}
      data={data}
      onInspect={onInspect}
      selectedEvent={selectedEvent}
      selectedEventId={selectedEventId}
      setSelectedEventId={setSelectedEventId}
      onNavigateToAgent={setAgentId}
    />
  );
}

function AgentDirectory({ onSelect, data, personaSlug }) {
  const mode = useModeStore((s) => s.mode);
  const isMonitoring = mode === 'shadow';
  const catalog = getAgentCatalog(personaSlug);

  // Per-agent live counts derived from the SAME events the agent's
  // feed will show. Prevents the directory tile from claiming "30
  // flags" when drilling in only shows 2. Counts represent the actual
  // events visible in the current window, not the canonical 30d
  // baseline.
  const events = data?.events || [];
  const perAgent = useMemo(() => {
    const byAgent = {};
    for (const a of catalog) byAgent[a.id] = { total: 0, flagged: 0, blocked: 0, redacted: 0 };
    for (const e of events) {
      const bucket = byAgent[e.agent];
      if (!bucket) continue;
      bucket.total++;
      const action = (e.action || '').toLowerCase();
      if (action === 'block') bucket.blocked++;
      else if (action === 'redact') bucket.redacted++;
      else if (action === 'flag') bucket.flagged++;
    }
    return byAgent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length, catalog]);
  const fleet = useMemo(() => {
    let total = 0, flagged = 0, blocked = 0, redacted = 0;
    for (const a of catalog) {
      const b = perAgent[a.id];
      total += b.total; flagged += b.flagged; blocked += b.blocked; redacted += b.redacted;
    }
    return { total, flagged, blocked, redacted };
  }, [perAgent, catalog]);

  return (
    <div className="px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Pick an agent</h2>
          <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-relaxed">
            Each tile opens that agent's sessions feed — click any session for the turn-by-turn transcript with tool calls inline. "All agents" at the bottom is the cross-agent firehose.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {catalog.map((a) => (
            <AgentTile
              key={a.id}
              agent={a}
              onSelect={() => onSelect(a.id)}
              isMonitoring={isMonitoring}
              counts={perAgent[a.id]}
            />
          ))}
          <button
            onClick={() => onSelect('all')}
            className="text-left bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-slate-900 dark:hover:border-slate-100 transition-colors p-5 rounded-none cursor-pointer flex flex-col"
          >
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">All agents</h3>
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Fleet</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 mb-3">
              Cross-agent firehose. Same drill-down (session → tool calls), unfiltered.
            </p>
            <div className="mt-auto pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 text-[10px]">
              <div><div className="text-slate-500 dark:text-slate-400 uppercase tracking-wider">Agents</div><div className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">{catalog.length}</div></div>
              <div><div className="text-slate-500 dark:text-slate-400 uppercase tracking-wider">Events</div><div className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">{fleet.total.toLocaleString()}</div></div>
              <div>
                <div className="text-slate-500 dark:text-slate-400 uppercase tracking-wider">{isMonitoring ? 'Flagged' : 'Blocked'}</div>
                <div className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">{isMonitoring ? (fleet.flagged + fleet.blocked + fleet.redacted).toLocaleString() : fleet.blocked.toLocaleString()}</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentTile({ agent, onSelect, isMonitoring, counts }) {
  // Tile metrics derive from the actual events visible in the feed
  // (so opening the agent doesn't show different numbers). Risk is
  // the canonical per-agent score (it's a model output, not an event
  // count). Tier badge removed.
  const c = counts || { total: 0, flagged: 0, blocked: 0, redacted: 0 };
  const tiles = isMonitoring
    ? [
        { label: 'Events',  value: c.total },
        { label: 'Flagged', value: c.flagged + c.blocked + c.redacted },
        { label: 'Risk',    value: agent.metrics.riskScore.toFixed(1) },
      ]
    : [
        { label: 'Events',  value: c.total },
        { label: 'Flagged', value: c.flagged },
        { label: 'Blocked', value: c.blocked },
        { label: 'Risk',    value: agent.metrics.riskScore.toFixed(1) },
      ];
  const cols = tiles.length === 4 ? 'grid-cols-4' : 'grid-cols-3';
  return (
    <button
      onClick={onSelect}
      className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-500 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors p-5 rounded-none cursor-pointer flex flex-col"
    >
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 mb-1">{agent.label}</h3>
      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-2">{agent.channel}</div>
      <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 mb-3 flex-1">{agent.purpose}</p>
      <div className={`mt-auto pt-3 border-t border-slate-200 dark:border-slate-800 grid ${cols} gap-2 text-[10px]`}>
        {tiles.map((t) => (
          <div key={t.label}>
            <div className="text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.label}</div>
            <div className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">{t.value}</div>
          </div>
        ))}
      </div>
    </button>
  );
}

function AgentDetail({ agent, isAll, personaSlug, onBack, data, onInspect, selectedEvent, selectedEventId, setSelectedEventId, onNavigateToAgent }) {
  const [showAbout, setShowAbout] = useState(false);
  const mode = useModeStore((s) => s.mode);
  const isMonitoring = mode === 'shadow';
  const catalog = getAgentCatalog(personaSlug);
  const fleetTotals = getFleetTotals(personaSlug);
  const filteredData = useMemo(() => {
    if (isAll) return data;
    return { ...data, events: (data?.events || []).filter((e) => e.agent === agent.id) };
  }, [data, isAll, agent]);

  // Header stats derive from the SAME filtered events that the feed
  // below shows, so "30 flags" doesn't appear above a feed that only
  // shows 2 flagged events. Risk score stays from the canonical
  // catalog (per-agent baseline, not in the event stream).
  const liveCounts = useMemo(() => {
    const events = filteredData?.events || [];
    let flagged = 0, blocked = 0, redacted = 0;
    for (const e of events) {
      const a = (e.action || '').toLowerCase();
      if (a === 'block') blocked++;
      else if (a === 'redact') redacted++;
      else if (a === 'flag') flagged++;
    }
    return { total: events.length, flagged, blocked, redacted };
  }, [filteredData]);

  const inlineStats = isAll
    ? (isMonitoring
        ? `${catalog.length} agents · ${liveCounts.total.toLocaleString()} events · ${(liveCounts.flagged + liveCounts.blocked + liveCounts.redacted).toLocaleString()} flagged`
        : `${catalog.length} agents · ${liveCounts.total.toLocaleString()} events · ${liveCounts.redacted} redacted · ${liveCounts.flagged} flagged · ${liveCounts.blocked} blocked`)
    : (isMonitoring
        ? `${liveCounts.total} events · ${liveCounts.flagged + liveCounts.blocked + liveCounts.redacted} flagged · risk ${agent.metrics.riskScore.toFixed(1)}`
        : `${liveCounts.total} events · ${liveCounts.redacted} redacted · ${liveCounts.flagged} flagged · ${liveCounts.blocked} blocked · risk ${agent.metrics.riskScore.toFixed(1)}`);

  return (
    <div className="flex flex-col h-full">
      {/* One-row agent header. Back button · name · channel · stat strip.
          Tool boundaries + full purpose live behind "About this agent"
          so the activity feed dominates the viewport. */}
      <div className="shrink-0 px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-none cursor-pointer transition-colors shrink-0"
          >
            <ArrowLeft size={11} weight="bold" /> Directory
          </button>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 shrink-0">
            {isAll ? 'All agents' : agent.label}
          </h2>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
            {isAll ? `${catalog.length} agents` : agent.channel}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {inlineStats}
          </span>
          {!isAll && (
            <button
              onClick={() => setShowAbout((v) => !v)}
              className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-transparent border-none cursor-pointer"
            >
              {showAbout ? 'Hide details' : 'About this agent'}
            </button>
          )}
        </div>
        {showAbout && !isAll && (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr] gap-3 text-[11px] leading-relaxed">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold mb-1">Purpose</div>
              <p className="text-slate-700 dark:text-slate-300">{agent.purpose}</p>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold mb-1">Allowed tools</div>
              <div className="flex flex-wrap gap-1">
                {agent.tools.allowed.map((t) => (
                  <code key={t} className="font-mono text-[10px] px-1.5 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200">{t}</code>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold mb-1">Restricted (KG-enforced)</div>
              <div className="flex flex-wrap gap-1">
                {agent.tools.restricted.map((t) => (
                  <code key={t} className="font-mono text-[10px] px-1.5 py-0.5 border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">{t}</code>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Activity feed — owns the viewport. compact prop hides the
          redundant "Live Activity / N events" inner header. */}
      <div className="flex-1 overflow-hidden">
        <LiveTelemetry
          data={filteredData}
          onInspect={onInspect}
          selectedEvent={selectedEvent}
          selectedEventId={selectedEventId}
          setSelectedEventId={setSelectedEventId}
          compact
          onNavigateToAgent={isAll ? onNavigateToAgent : null}
        />
      </div>
    </div>
  );
}
