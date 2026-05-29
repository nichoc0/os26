// Live Activity — merged feed + inline drilldown.
//
// Reviewer feedback: "Live Activity and Event Details overlap a decent
// amount, can be merged." The original Event Detail page's primary state
// was just another list of the same events; the only unique value was the
// drilldown. So we collapse them into a single split-pane view: compact
// event feed on the left, full drilldown on the right when an event is
// selected. Mirrors the Vault page's split-pane pattern.
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Wrench, Eye, Spinner, ShieldWarning, MagnifyingGlass, Funnel, CaretDown, CaretUp } from '@phosphor-icons/react';
import { useModeStore } from '../../store/modeStore';
import { DrilldownView } from './EventDrilldown';
import { actionIdFor } from '../../data/actionId';
import { useDispositionStore, useDispositionMap } from '../../store/dispositionStore';
import { usePersona } from '../../store/personaStore';

const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none';

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
}


// Single canonical agent pill: colour dot + label, used everywhere on this
// page so an agent reads the same in the filter row, in the feed, and in
// the inspector. The tinted dot carries the colour signal; the label
// carries the identity. No more "label here, dot there" inconsistency.
function AgentPill({ agent, meta, size = 'sm', muted = false }) {
    const info = meta?.[agent] || { color: '#94a3b8', label: agent };
    const dot = size === 'xs' ? 6 : 7;
    const text = size === 'xs' ? 'text-[10px]' : 'text-[10px]';
    return (
        <span className={`inline-flex items-center gap-1.5 ${text} font-semibold whitespace-nowrap ${muted ? 'text-slate-600 dark:text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
            <span
                className="inline-block rounded-full shrink-0"
                style={{ width: dot, height: dot, backgroundColor: info.color }}
            />
            {info.label}
        </span>
    );
}

// Back-compat shim: older call sites still use AgentBadge. Same render path,
// renamed to keep diffs small while we standardise on AgentPill.
const AgentBadge = AgentPill;

// Status badge — neutral slate scale, no colour collision with agent palette.
// Luyun: "Why is 'Flagged for review' the same colour as one of the agents?"
// Answer: because the previous palette put status badges in blue, and blue
// was also used for an agent. Fixed by reserving colour for agent identity
// only and signalling status through fill weight on a neutral scale.
//
// Driven by the event's `action` + `detections` rails (the shape the events
// fixture and ingest webhook actually use).
function StatusBadge({ event, mode }) {
    const action = (event.action || '').toLowerCase();
    let detections = event.detections;
    if (typeof detections === 'string') {
        try { detections = JSON.parse(detections); } catch { detections = []; }
    }
    detections = Array.isArray(detections) ? detections : [];
    const hasPii = detections.some((d) => (d.rail || '').toLowerCase() === 'pii');

    // Canonical vocabulary (per Luyun 2026-05-17, see glossary tooltip):
    //   PASSED   — handled within policy, no rail fired
    //   FLAGGED  — at least one rail fired; in monitoring mode the agent
    //              still served the request (a "would-block" outcome is
    //              also FLAGGED in monitoring — same operator meaning:
    //              "we saw this, we did not stop it")
    //   REDACTED — sensitive content removed before egress (enforcement)
    //   BLOCKED  — enforcement layer prevented the action
    // No "Would block" badge — collapsed into FLAGGED. Mode label on
    // the inspector page tells the operator whether enforcement is on.
    if (action === 'block') {
        if (mode === 'shadow') {
            return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-transparent text-slate-700 dark:text-slate-300 border border-slate-400 dark:border-slate-500 rounded-sm" title="Detection rail fired; agent served the request (monitoring mode)">Flagged</span>;
        }
        return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-sm">Blocked</span>;
    }
    if (action === 'redact') {
        if (mode === 'shadow') {
            return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-transparent text-slate-700 dark:text-slate-300 border border-slate-400 dark:border-slate-500 rounded-sm" title="PII detection rail fired; content was NOT redacted (monitoring mode)">Flagged</span>;
        }
        return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-slate-600 text-white dark:bg-slate-300 dark:text-slate-900 rounded-sm">Redacted</span>;
    }
    if (action === 'flag' || hasPii) {
        return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-transparent text-slate-700 dark:text-slate-300 border border-slate-400 dark:border-slate-500 rounded-sm">Flagged</span>;
    }
    return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 rounded-sm">Passed</span>;
}

// Outcome filter — mode-aware options. In monitoring (shadow) mode the
// agent never actually blocks or redacts, so flag/redact/block all
// collapse to "Flagged" in the UI; the filter offers only the outcomes
// the operator can actually see. In enforcement mode the three
// enforcement actions split out so the operator can drill straight
// into "what got blocked" vs "what got redacted."
const OUTCOMES_MONITORING  = ['All', 'Passed', 'Flagged'];
const OUTCOMES_ENFORCEMENT = ['All', 'Passed', 'Flagged', 'Redacted', 'Blocked'];

function parseDetections(d) {
    if (typeof d === 'string') {
        try { return JSON.parse(d); } catch { return []; }
    }
    return Array.isArray(d) ? d : [];
}
function parseDetectionsLength(d) { return parseDetections(d).length; }

// What outcome bucket does an event fall into, given the current mode?
// Mirrors the StatusBadge / inspector vocabulary so the filter row,
// the per-row badge, and the inspector all agree.
function getOutcome(event, mode) {
    const action = (event.action || '').toLowerCase();
    const isMonitoring = mode === 'shadow';
    if (action === 'pass') return 'Passed';
    if (isMonitoring) {
        // In shadow mode every non-pass collapses to Flagged — the
        // enforcement vocabulary (Blocked / Redacted) doesn't apply
        // because the agent didn't actually intervene.
        return 'Flagged';
    }
    if (action === 'block')  return 'Blocked';
    if (action === 'redact') return 'Redacted';
    if (action === 'flag')   return 'Flagged';
    // Defensive: events with detections but no explicit action still
    // surface as Flagged so they're not lost.
    if (parseDetections(event.detections).length > 0) return 'Flagged';
    return 'Passed';
}

function getUserQuery(event) {
    const msgs = event.request_messages || [];
    const userMsg = msgs.filter((m) => m.role === 'user').pop();
    return userMsg?.content || event.query_preview || event.content || '';
}

// Reusable section with a header that toggles open/closed. Used in the
// inspector welcome panel so each block (stats / needs attention) is its
// own user-controllable level instead of a flat stack — addresses Luyun's
// "way too much happening on this page" + Malissa's "toggles to expand."
function CollapsibleSection({ open, onToggle, title, icon, children }) {
    return (
        <div>
            <button
                type="button"
                onClick={onToggle}
                className="w-full flex items-center gap-2 mb-2 cursor-pointer bg-transparent border-0 p-0 hover:opacity-80 transition-opacity"
            >
                {icon}
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{title}</span>
                <span className="ml-auto">
                    {open
                        ? <CaretUp size={11} weight="bold" className="text-slate-400 dark:text-slate-500" />
                        : <CaretDown size={11} weight="bold" className="text-slate-400 dark:text-slate-500" />}
                </span>
            </button>
            {open && children}
        </div>
    );
}

function EventRow({ event, agentMeta, mode, isSelected, onSelect, selectedEvent, detailLoading }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className={`border-l-2 ${
                isSelected
                    ? 'bg-blue-50/80 dark:bg-blue-900/20 border-l-blue-500 dark:border-l-blue-400'
                    : 'border-l-transparent'
            }`}
        >
            <button
                type="button"
                onClick={() => onSelect(event.id)}
                className={`w-full text-left px-3 py-2 cursor-pointer transition-colors bg-transparent border-0 ${
                    isSelected ? '' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
            >
                <div className="flex items-center gap-2 mb-1">
                    <span
                        className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 shrink-0 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60"
                        title="Action ID — copy-paste to reference this action in tickets."
                    >
                        {actionIdFor(event)}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500 shrink-0">
                        {formatTime(event.timestamp)}
                    </span>
                    <AgentPill agent={event.agent} meta={agentMeta} />
                    <span className="ml-auto flex items-center gap-1.5">
                        {event.response_thinking && <Brain size={12} weight="duotone" className="text-slate-500 dark:text-slate-400" title="thinking" />}
                        {event.response_tool_calls?.length > 0 && <Wrench size={12} weight="duotone" className="text-slate-500 dark:text-slate-400" title="tool calls" />}
                        <StatusBadge event={event} mode={mode} />
                    </span>
                </div>
                <p className="text-[12px] text-slate-700 dark:text-slate-300 leading-snug line-clamp-2">
                    {truncate(getUserQuery(event), 140)}
                </p>
                <p className="text-[9px] font-mono text-slate-400 dark:text-slate-600 mt-1">
                    {event.model}
                </p>
            </button>

            {/* Inline drilldown for narrow widths. On sm+ the right-pane
                inspector handles this — see RIGHT pane below. */}
            {isSelected && (
                <div className="sm:hidden px-3 pb-4 pt-1 border-t border-slate-200 dark:border-slate-800/60">
                    {detailLoading && (
                        <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400 py-3">
                            <Spinner size={14} className="animate-spin" />
                            Loading details…
                        </div>
                    )}
                    {!detailLoading && selectedEvent && (
                        <DrilldownView event={selectedEvent} agentMeta={agentMeta} onBack={() => onSelect(null)} />
                    )}
                </div>
            )}
        </motion.div>
    );
}

export function LiveTelemetry({ data, onInspect, selectedEvent, selectedEventId, setSelectedEventId, compact = false, onNavigateToAgent = null }) {
    const [selectedAgent, setSelectedAgent] = useState('All');
    const [selectedOutcome, setSelectedOutcome] = useState('All');
    // Free-text search across action ID + query preview + agent label.
    // Yousuf 2026-05-27: action IDs must be searchable so an operator can
    // paste "ACT-00041" from a ticket and find the row. Case-insensitive;
    // empty string disables the filter.
    const [searchText, setSearchText] = useState('');
    // Collapsible sections — Malissa's "toggles to expand details" feedback.
    // Filters open by default (active filtering reads as the primary interaction)
    // and the inspector welcome sections collapse independently so the right
    // pane stops being a wall of equal-weight blocks.
    const [filtersOpen, setFiltersOpen] = useState(true);
    const [statsOpen, setStatsOpen] = useState(true);
    const [needsAttentionOpen, setNeedsAttentionOpen] = useState(true);
    const mode = useModeStore((s) => s.mode);

    const agentMeta = data?.agentMeta || {};
    const events = data?.events || [];
    // Build agent filter options keyed by their canonical agent id so the
    // filter row can render the same AgentPill (dot + label) used elsewhere
    // on the page, instead of a label-only button. Resolves Luyun's
    // "label here, dot there" inconsistency.
    const agentFilterOptions = useMemo(
        () => [{ key: 'All', label: 'All', isAll: true },
               ...Object.keys(agentMeta).map((k) => ({ key: k, label: agentMeta[k].label, isAll: false }))],
        [agentMeta],
    );

    const filteredEvents = useMemo(() => {
        const q = searchText.trim().toLowerCase();
        return events.filter((e) => {
            if (selectedAgent !== 'All' && e.agent !== selectedAgent) return false;
            if (selectedOutcome !== 'All' && getOutcome(e, mode) !== selectedOutcome) return false;
            if (q) {
                // Match against the operator-visible ID, the agent label,
                // the raw agent slug, the query preview, the action tag,
                // and the model string. Cheap substring tests — populations
                // are small (tens to low-thousands), no fuzzy matching.
                const id = actionIdFor(e).toLowerCase();
                const label = (agentMeta[e.agent]?.label || '').toLowerCase();
                const slug = String(e.agent || '').toLowerCase();
                const preview = String(e.query_preview || e.content || '').toLowerCase();
                const action = String(e.action || '').toLowerCase();
                const model = String(e.model || '').toLowerCase();
                if (!id.includes(q) && !label.includes(q) && !slug.includes(q) && !preview.includes(q) && !action.includes(q) && !model.includes(q)) return false;
            }
            return true;
        });
    }, [events, selectedAgent, selectedOutcome, searchText, agentMeta, mode]);

    // Count of active non-default filters — surfaces in the collapsed-filters
    // header so users know filters are applied even when the panel is closed.
    const activeFilterCount = (selectedAgent !== 'All' ? 1 : 0) + (selectedOutcome !== 'All' ? 1 : 0) + (searchText.trim() ? 1 : 0);

    // Mode-aware outcome options. Reset the selection if the mode flips
    // and the previously-selected outcome no longer exists (e.g. switching
    // from enforcement → monitoring while filtered to "Blocked").
    const outcomeOptions = mode === 'shadow' ? OUTCOMES_MONITORING : OUTCOMES_ENFORCEMENT;
    useEffect(() => {
        if (!outcomeOptions.includes(selectedOutcome)) setSelectedOutcome('All');
    }, [outcomeOptions, selectedOutcome]);

    // Persisted operator decisions (per persona). Events that have a
    // disposition set are pulled out of "Needs Attention" and surfaced
    // separately in "Recently resolved" with their destination ("→
    // Resolved queue" / "→ Incident register"), per Yousuf 2026-05-27
    // feedback.
    const persona = usePersona();
    const personaSlug = persona?.slug || 'default';
    const hydrateDispositions = useDispositionStore((s) => s.hydrate);
    useEffect(() => { hydrateDispositions(personaSlug); }, [hydrateDispositions, personaSlug]);
    const dispositionMap = useDispositionMap(personaSlug);

    // Action distribution across the visible window — used for the
    // right-pane summary. `needsAttention` excludes events the operator
    // already approved/rejected; `recentlyResolved` lists those events
    // with the destination they were sent to.
    //
    // Defensive: dedupe by event.id so an upstream pipeline that re-emits
    // the same event (polling races, fixture merge) can't cause a single
    // approval to render as "5 approved events." Also skip rows without
    // a usable id — without one we can't address a disposition, and a
    // missing id should never be allowed to collide with another row's
    // disposition under the key "undefined".
    const actionStats = useMemo(() => {
        const counts = { pass: 0, flag: 0, redact: 0, block: 0 };
        const needsAttention = [];
        const recentlyResolved = [];
        const seenIds = new Set();
        for (const e of filteredEvents) {
            const a = (e.action || 'pass').toLowerCase();
            counts[a] = (counts[a] || 0) + 1;
            if (a !== 'block' && a !== 'flag' && a !== 'redact') continue;
            if (e?.id == null) continue;
            const key = String(e.id);
            if (seenIds.has(key)) continue;
            seenIds.add(key);
            const dispo = dispositionMap[key];
            if (dispo) recentlyResolved.push({ event: e, disposition: dispo });
            else needsAttention.push(e);
        }
        // Most-recent decisions first.
        recentlyResolved.sort((a, b) => String(b.disposition.decidedAt).localeCompare(String(a.disposition.decidedAt)));
        return { counts, needsAttention, recentlyResolved };
    }, [filteredEvents, dispositionMap]);

    // App-level state may not have been wired (older callers). Fall back to a
    // simple "click bubbles up to onInspect" model so we degrade gracefully.
    // Click-to-toggle: tapping the currently selected row collapses it.
    const handleSelect = (id) => {
        const next = id == null || id === selectedEventId ? null : id;
        if (setSelectedEventId) setSelectedEventId(next);
        else if (onInspect) onInspect(next);
    };

    // Click on a Needs-Attention / Recently-Resolved item: select the
    // event AND, if we're in the cross-agent firehose, jump to that
    // event's focused-agent view so the operator lands on agent context,
    // not the directory. Nicho 2026-05-27: "it shouldnt bring u to the
    // base agent view but to the focused agent view if u want to click
    // to get the info."
    const handleAttentionClick = (event) => {
        if (onNavigateToAgent && event?.agent) onNavigateToAgent(event.agent);
        handleSelect(event.id);
    };
    const clearSelection = () => {
        if (setSelectedEventId) setSelectedEventId(null);
    };

    // Inspector default = welcome panel (stats + needs-attention list).
    // Previously auto-selected the top high-risk event on mount; Luyun
    // wants the welcome to be the base so the operator sees the window
    // summary first, then clicks an event to drill in.
    // (autoSelectedRef kept for backward compat with callers that still
    // expect this hook signature.)
    const autoSelectedRef = useRef(false);

    const detailLoading = !!selectedEventId && !selectedEvent;

    return (
        <div className="w-full max-w-[1600px] mx-auto pb-12 flex flex-col" style={{ minHeight: 'calc(100vh - 120px)' }}>
            {/* Header — hidden in compact / agent-context mounts so we
                don't double up the title with the agent header above. */}
            {!compact && (
                <div className="flex items-center gap-3 mb-3 px-1">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                    </span>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Live Activity</h1>
                    <span className="text-sm text-slate-500 dark:text-slate-400 ml-auto">{filteredEvents.length} events</span>
                </div>
            )}

            {/* Two-pane layout: feed (left) + inspector (right). Mirrors the Vault
                page's split-pane pattern so drilling into an event keeps the feed
                visible for fast triage instead of forcing a nav hop. */}
            <div className={`${card} flex-1 flex overflow-hidden`} style={{ minHeight: 600 }}>
                {/* LEFT — feed */}
                <div className="w-full sm:w-[42%] sm:max-w-[480px] shrink-0 border-r-0 sm:border-r border-slate-200 dark:border-slate-800 flex flex-col">
                    {/* Filters — collapsible group header gives the two filter rows
                        a parent container so they read as one section, not two
                        flat-stacked rows of pills. Resolves Luyun's "agent and
                        risks buttons next to each other is flattened."
                        Risk leads (primary triage axis), Agent follows. */}
                    <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
                        <button
                            type="button"
                            onClick={() => setFiltersOpen((v) => !v)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer bg-transparent border-0"
                        >
                            <Funnel size={12} weight="bold" className="text-slate-500 dark:text-slate-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Filters</span>
                            {activeFilterCount > 0 && (
                                <span className="text-[9px] font-mono px-1.5 py-0 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-sm">
                                    {activeFilterCount}
                                </span>
                            )}
                            {/* Preview of active filter state — visible in both collapsed
                                and open states so users always know what's selected. */}
                            <span className="ml-2 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {selectedOutcome !== 'All' && (
                                    <span className="inline-flex items-center gap-1">
                                        <span className="text-slate-400 dark:text-slate-600">Outcome:</span>
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedOutcome}</span>
                                    </span>
                                )}
                                {selectedAgent !== 'All' && agentMeta[selectedAgent] && (
                                    <span className="inline-flex items-center gap-1.5">
                                        {selectedOutcome !== 'All' && <span className="text-slate-300 dark:text-slate-700">·</span>}
                                        <span
                                            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                                            style={{ backgroundColor: agentMeta[selectedAgent].color }}
                                        />
                                        <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                                            {agentMeta[selectedAgent].label}
                                        </span>
                                    </span>
                                )}
                            </span>
                            <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-600 shrink-0">
                                {filteredEvents.length} of {events.length}
                            </span>
                            {filtersOpen
                                ? <CaretUp size={11} weight="bold" className="text-slate-400 dark:text-slate-500" />
                                : <CaretDown size={11} weight="bold" className="text-slate-400 dark:text-slate-500" />}
                        </button>
                        {filtersOpen && (
                            <div className="px-3 pb-2.5 space-y-2 border-t border-slate-200/60 dark:border-slate-800/60">
                                {/* Search — leads the filter stack. Matches ID
                                    (ACT-00041), agent slug/label, query preview,
                                    action tag, model. */}
                                <div className="pt-2.5 flex items-center gap-2">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 w-12 shrink-0">Search</span>
                                    <div className="relative flex-1">
                                        <MagnifyingGlass size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                                        <input
                                            type="text"
                                            value={searchText}
                                            onChange={(e) => setSearchText(e.target.value)}
                                            placeholder="ACT-00041, agent, query, action…"
                                            className="w-full pl-7 pr-7 py-1 text-[11px] font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-slate-500 dark:focus:border-slate-500 rounded-none"
                                        />
                                        {searchText && (
                                            <button
                                                type="button"
                                                onClick={() => setSearchText('')}
                                                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-1 cursor-pointer bg-transparent border-0"
                                                title="Clear search"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {/* Outcome — mode-aware action-class filter.
                                    Monitoring: All / Passed / Flagged.
                                    Enforcement: All / Passed / Flagged / Redacted / Blocked. */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 w-12 shrink-0">Outcome</span>
                                    <div className="flex gap-1 flex-wrap">
                                        {outcomeOptions.map((o) => (
                                            <button
                                                key={o}
                                                onClick={() => setSelectedOutcome(o)}
                                                className={`px-2 py-0.5 text-[10px] font-semibold transition-colors rounded-none cursor-pointer border ${
                                                    selectedOutcome === o
                                                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                                                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                                                }`}
                                            >
                                                {o}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Agent filter — hidden in compact (agent-scoped)
                                    mounts since the parent header already names the
                                    agent. Re-picking would be confusing. */}
                                {!compact && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 w-12 shrink-0">Agent</span>
                                    <div className="flex gap-1 flex-wrap">
                                        {agentFilterOptions.map((opt) => {
                                            const active = selectedAgent === opt.key;
                                            const info = agentMeta[opt.key];
                                            return (
                                                <button
                                                    key={opt.key}
                                                    onClick={() => setSelectedAgent(opt.key)}
                                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold transition-colors rounded-none cursor-pointer border ${
                                                        active
                                                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                                                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                                                    }`}
                                                >
                                                    {!opt.isAll && info && (
                                                        <span
                                                            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                                                            style={{ backgroundColor: info.color }}
                                                        />
                                                    )}
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                        <AnimatePresence initial={false}>
                            {filteredEvents.map((event) => (
                                <EventRow
                                    key={event.id}
                                    event={event}
                                    agentMeta={agentMeta}
                                    mode={mode}
                                    isSelected={selectedEventId === event.id}
                                    onSelect={handleSelect}
                                    selectedEvent={selectedEvent}
                                    detailLoading={detailLoading}
                                />
                            ))}
                        </AnimatePresence>
                        {filteredEvents.length === 0 && (
                            <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">
                                No events match the current filters.
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT — inspector */}
                <div className="hidden sm:flex flex-1 bg-slate-50/60 dark:bg-slate-900/40 overflow-y-auto">
                    {detailLoading && (
                        <div className="m-auto flex items-center gap-3 text-slate-500 dark:text-slate-400">
                            <Spinner size={20} className="animate-spin" />
                            <span className="text-sm">Loading event #{selectedEventId}…</span>
                        </div>
                    )}
                    {!detailLoading && selectedEvent && (
                        <div className="w-full p-5">
                            <DrilldownView
                                event={selectedEvent}
                                agentMeta={agentMeta}
                                onBack={clearSelection}
                            />
                        </div>
                    )}
                    {!detailLoading && !selectedEvent && (
                        <div className="w-full p-5 space-y-4">
                            {/* Inspector header — primary level */}
                            <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-2 mb-1">
                                    <Eye size={16} weight="duotone" className="text-slate-600 dark:text-slate-400" />
                                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Inspector</h2>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-500">
                                    Click any event in the feed to see the trigger chain, root-cause explanation, tool calls, and policy decision Bastion took.
                                </p>
                            </div>

                            {/* Stats — collapsible secondary block.
                                Numbers come from overview.json (canonical
                                30-day totals — same source the Posture
                                Report uses). The event feed below shows the
                                most recent sample, not every action; the
                                window-total in the header reconciles to the
                                Posture Report so a sharp reader can cross-
                                check the two screens. */}
                            <CollapsibleSection
                                open={statsOpen}
                                onToggle={() => setStatsOpen((v) => !v)}
                                title={(() => {
                                    // When compact (= agent-scoped mount), the
                                    // canonical fleet overview totals don't apply —
                                    // they'd say "88 flagged" while only 2 of the
                                    // current agent's events are flagged. Use the
                                    // filtered count so the header, stats, and
                                    // needs-attention list all agree.
                                    const total = compact ? filteredEvents.length : (data?.overview?.total_actions_monitored ?? filteredEvents.length);
                                    return `This window — ${total.toLocaleString()} event${total === 1 ? '' : 's'}`;
                                })()}
                            >
                                {(() => {
                                    const ov = data?.overview || {};
                                    const useOverview = !compact;
                                    const totalEvents = useOverview ? (ov.total_actions_monitored ?? filteredEvents.length) : filteredEvents.length;
                                    const baseBlocks = useOverview ? (ov.total_blocks ?? actionStats.counts.block ?? 0) : (actionStats.counts.block ?? 0);
                                    const baseFlags = useOverview ? (ov.total_flags ?? actionStats.counts.flag ?? 0) : (actionStats.counts.flag ?? 0);
                                    const baseRedacts = useOverview ? (ov.pii_exposures ?? actionStats.counts.redact ?? 0) : (actionStats.counts.redact ?? 0);
                                    // In monitoring mode no action is actually
                                    // blocked or redacted — those detections
                                    // become FLAGGED (rail fired but agent
                                    // served the request). Per Luyun, the
                                    // operator should never see a non-zero
                                    // Blocked or Redacted count under
                                    // monitoring; collapse both into Flagged.
                                    const isMonitoring = mode === 'shadow';
                                    const blocks = isMonitoring ? 0 : baseBlocks;
                                    const redacts = isMonitoring ? 0 : baseRedacts;
                                    const flags = isMonitoring ? (baseFlags + baseBlocks + baseRedacts) : baseFlags;
                                    const passed = Math.max(0, totalEvents - blocks - flags - redacts);
                                    // Tile order honours Luyun's mode-specific layout
                                    // (monitoring leads with flagged; enforcement leads with
                                    // redacted). Zero-value tiles are dropped so the bar
                                    // never shows "REDACTED 0 / BLOCKED 0" filler under
                                    // monitoring mode.
                                    const allTiles = isMonitoring
                                        ? [
                                            { key: 'pass',   label: 'Passed',   value: passed },
                                            { key: 'flag',   label: 'Flagged',  value: flags },
                                            { key: 'redact', label: 'Redacted', value: redacts },
                                            { key: 'block',  label: 'Blocked',  value: blocks },
                                          ]
                                        : [
                                            { key: 'pass',   label: 'Passed',   value: passed },
                                            { key: 'redact', label: 'Redacted', value: redacts },
                                            { key: 'flag',   label: 'Flagged',  value: flags },
                                            { key: 'block',  label: 'Blocked',  value: blocks },
                                          ];
                                    const tiles = allTiles.filter((t) => t.value > 0);
                                    return (
                                        <>
                                            <div className={`grid gap-2 ${tiles.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : tiles.length === 3 ? 'grid-cols-3' : tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                {tiles.map(({ key, label, value }) => (
                                                    <div key={key} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2">
                                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</div>
                                                        <div className="text-2xl font-bold mt-0.5 text-slate-900 dark:text-slate-100">{value.toLocaleString()}</div>
                                                    </div>
                                                ))}
                                            </div>
                                            {filteredEvents.length < totalEvents && (
                                                <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                                                    Feed shows the {filteredEvents.length} most recent events. Stats reflect the full window.
                                                </p>
                                            )}
                                        </>
                                    );
                                })()}
                            </CollapsibleSection>

                            {/* Needs attention — events with a fired rail
                                that the operator hasn't decided on yet. Once
                                approved or rejected, the event moves to
                                Recently resolved below. */}
                            {actionStats.needsAttention.length > 0 ? (
                                <CollapsibleSection
                                    open={needsAttentionOpen}
                                    onToggle={() => setNeedsAttentionOpen((v) => !v)}
                                    icon={<ShieldWarning size={12} weight="duotone" className="text-slate-500 dark:text-slate-400" />}
                                    title={`Needs attention (${actionStats.needsAttention.length})`}
                                >
                                    <div className="space-y-1.5">
                                        {actionStats.needsAttention.map((event) => {
                                            const detectionCount = parseInt(parseDetectionsLength(event.detections));
                                            return (
                                                <button
                                                    key={event.id}
                                                    onClick={() => handleAttentionClick(event)}
                                                    className="w-full text-left flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer rounded-none"
                                                >
                                                    <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 shrink-0 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60">
                                                        {actionIdFor(event)}
                                                    </span>
                                                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500 w-12 shrink-0">
                                                        {formatTime(event.timestamp)}
                                                    </span>
                                                    <AgentPill agent={event.agent} meta={agentMeta} />
                                                    <StatusBadge event={event} mode={mode} />
                                                    <span className="text-[11px] text-slate-700 dark:text-slate-300 flex-1 truncate">
                                                        {truncate(getUserQuery(event), 60)}
                                                    </span>
                                                    <span className="text-[9px] text-slate-400 dark:text-slate-600 shrink-0">
                                                        {detectionCount} detection{detectionCount === 1 ? '' : 's'}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </CollapsibleSection>
                            ) : (
                                <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-5 text-center">
                                    <ShieldWarning size={24} weight="duotone" className="text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                        {actionStats.recentlyResolved.length > 0 ? 'All flagged events have been actioned' : 'No high-risk events in this window'}
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                        {actionStats.recentlyResolved.length > 0
                                            ? `${actionStats.recentlyResolved.length} resolved — see Recently resolved below.`
                                            : 'All filtered events passed every detection rail. Pick any event to see what was inspected.'}
                                    </p>
                                </div>
                            )}

                            {/* Recently resolved — items the operator has
                                approved (→ resolved queue) or rejected (→
                                incident register). Lets reviewers verify
                                decisions and undo via the drilldown. */}
                            {actionStats.recentlyResolved.length > 0 && (
                                <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Recently resolved</span>
                                        <span className="text-[9px] font-mono text-slate-400 dark:text-slate-600">{actionStats.recentlyResolved.length}</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!window.confirm('Clear all approve/reject decisions for this account? Resolved items will move back to Needs Attention.')) return;
                                                const state = useDispositionStore.getState();
                                                for (const { event } of actionStats.recentlyResolved) {
                                                    if (event?.id != null) state.clearDisposition(personaSlug, event.id);
                                                }
                                            }}
                                            className="ml-auto text-[9px] font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-transparent border-0 cursor-pointer"
                                            title="Reset all approve/reject decisions for this account."
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <div className="space-y-1.5">
                                        {actionStats.recentlyResolved.slice(0, 10).map(({ event, disposition }) => (
                                            <button
                                                key={event.id}
                                                onClick={() => handleAttentionClick(event)}
                                                className="w-full text-left flex items-center gap-2 px-3 py-2 bg-slate-50/60 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer rounded-none"
                                                title={`Click to inspect — operator decided ${new Date(disposition.decidedAt).toLocaleString()}`}
                                            >
                                                <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 shrink-0 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60">
                                                    {actionIdFor(event)}
                                                </span>
                                                <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 shrink-0 ${disposition.state === 'approved' ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'}`}>
                                                    {disposition.state === 'approved' ? 'Approved' : 'Rejected'}
                                                </span>
                                                <AgentPill agent={event.agent} meta={agentMeta} />
                                                <span className="text-[11px] text-slate-700 dark:text-slate-300 flex-1 truncate">
                                                    {truncate(getUserQuery(event), 50)}
                                                </span>
                                                <span className="text-[9px] text-slate-400 dark:text-slate-600 shrink-0 inline-flex items-center gap-1">
                                                    <span className="text-slate-300 dark:text-slate-700">→</span>
                                                    <span className="font-semibold text-slate-600 dark:text-slate-300">{disposition.destination}</span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex items-start gap-2 text-[10px] text-slate-500 dark:text-slate-500">
                                <MagnifyingGlass size={12} className="mt-0.5 shrink-0" />
                                <span>
                                    The inspector shows the <strong className="text-slate-700 dark:text-slate-300">root cause</strong> of any flagged or blocked event — which rail fired, the trigger chain, and a recommended remediation.
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile inline expansion is rendered inside EventRow above.
                Desktop split-pane keeps the right inspector in view at all times. */}
        </div>
    );
}
