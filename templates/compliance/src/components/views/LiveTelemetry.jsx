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

    // Severity is signalled by fill weight on a neutral slate scale:
    //   block   → solid dark slate (strong)
    //   redact/pii → mid slate (medium)
    //   flag    → outlined slate (light)
    //   ok      → muted slate (passive)
    // No blue here — that hue belongs to agents.
    if (action === 'block') {
        if (mode === 'shadow') {
            return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-400 dark:border-slate-500 border-dashed rounded-sm whitespace-nowrap" title="Would have blocked in Enforcement mode">Would block</span>;
        }
        return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-sm">Blocked</span>;
    }
    if (action === 'redact' || hasPii) {
        return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-slate-600 text-white dark:bg-slate-300 dark:text-slate-900 rounded-sm">{action === 'redact' ? 'Redacted' : 'PII'}</span>;
    }
    if (action === 'flag') {
        return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-transparent text-slate-700 dark:text-slate-300 border border-slate-400 dark:border-slate-500 rounded-sm">Flagged</span>;
    }
    return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 rounded-sm">OK</span>;
}

const RISK_LEVELS = ['All', 'Low', 'Med', 'High'];

function parseDetections(d) {
    if (typeof d === 'string') {
        try { return JSON.parse(d); } catch { return []; }
    }
    return Array.isArray(d) ? d : [];
}
function parseDetectionsLength(d) { return parseDetections(d).length; }

function getRiskLevel(event) {
    const action = (event.action || '').toLowerCase();
    if (action === 'block' || event.blocked_tools?.length > 0) return 'High';
    if (action === 'flag' || action === 'redact' || parseDetections(event.detections).length > 0) return 'Med';
    return 'Low';
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

export function LiveTelemetry({ data, onInspect, selectedEvent, selectedEventId, setSelectedEventId }) {
    const [selectedAgent, setSelectedAgent] = useState('All');
    const [selectedRisk, setSelectedRisk] = useState('All');
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
        return events.filter((e) => {
            if (selectedAgent !== 'All' && e.agent !== selectedAgent) return false;
            if (selectedRisk !== 'All' && getRiskLevel(e) !== selectedRisk) return false;
            return true;
        });
    }, [events, selectedAgent, selectedRisk]);

    // Count of active non-default filters — surfaces in the collapsed-filters
    // header so users know filters are applied even when the panel is closed.
    const activeFilterCount = (selectedAgent !== 'All' ? 1 : 0) + (selectedRisk !== 'All' ? 1 : 0);

    // Action distribution across the visible window — used for the empty
    // right-pane summary so the view never looks barren even before the
    // user clicks anything.
    const actionStats = useMemo(() => {
        const counts = { pass: 0, flag: 0, redact: 0, block: 0 };
        const highRisk = [];
        for (const e of filteredEvents) {
            const a = (e.action || 'pass').toLowerCase();
            counts[a] = (counts[a] || 0) + 1;
            if (a === 'block' || a === 'flag' || a === 'redact') highRisk.push(e);
        }
        return { counts, highRisk };
    }, [filteredEvents]);

    // App-level state may not have been wired (older callers). Fall back to a
    // simple "click bubbles up to onInspect" model so we degrade gracefully.
    // Click-to-toggle: tapping the currently selected row collapses it.
    const handleSelect = (id) => {
        const next = id == null || id === selectedEventId ? null : id;
        if (setSelectedEventId) setSelectedEventId(next);
        else if (onInspect) onInspect(next);
    };
    const clearSelection = () => {
        if (setSelectedEventId) setSelectedEventId(null);
    };

    // Auto-pick the most recent high-risk event the first time we render with
    // events available. Only fires once so a user who collapses the inline
    // drilldown isn't yanked back into it.
    const autoSelectedRef = useRef(false);
    useEffect(() => {
        if (autoSelectedRef.current) return;
        if (!setSelectedEventId) return;
        if (selectedEventId) { autoSelectedRef.current = true; return; }
        const top = actionStats.highRisk[0];
        if (top) {
            setSelectedEventId(top.id);
            autoSelectedRef.current = true;
        }
    }, [selectedEventId, setSelectedEventId, actionStats.highRisk]);

    const detailLoading = !!selectedEventId && !selectedEvent;

    return (
        <div className="w-full max-w-[1600px] mx-auto pb-12 flex flex-col" style={{ minHeight: 'calc(100vh - 120px)' }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-3 px-1">
                <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                </span>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Live Activity</h1>
                <span className="text-sm text-slate-500 dark:text-slate-400 ml-auto">{filteredEvents.length} events</span>
            </div>

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
                                {selectedRisk !== 'All' && (
                                    <span className="inline-flex items-center gap-1">
                                        <span className="text-slate-400 dark:text-slate-600">Risk:</span>
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedRisk}</span>
                                    </span>
                                )}
                                {selectedAgent !== 'All' && agentMeta[selectedAgent] && (
                                    <span className="inline-flex items-center gap-1.5">
                                        {selectedRisk !== 'All' && <span className="text-slate-300 dark:text-slate-700">·</span>}
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
                                {/* Risk first — primary triage axis. */}
                                <div className="pt-2.5 flex flex-wrap items-center gap-2">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 w-12 shrink-0">Risk</span>
                                    <div className="flex gap-1">
                                        {RISK_LEVELS.map((r) => (
                                            <button
                                                key={r}
                                                onClick={() => setSelectedRisk(r)}
                                                className={`px-2 py-0.5 text-[10px] font-semibold transition-colors rounded-none cursor-pointer border ${
                                                    selectedRisk === r
                                                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                                                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                                                }`}
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Agent second — secondary slice. */}
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

                            {/* Stats — collapsible secondary block */}
                            <CollapsibleSection
                                open={statsOpen}
                                onToggle={() => setStatsOpen((v) => !v)}
                                title={`This window — ${filteredEvents.length} event${filteredEvents.length === 1 ? '' : 's'}`}
                            >
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {[
                                        { key: 'pass',   label: 'Passed' },
                                        { key: 'flag',   label: 'Flagged' },
                                        { key: 'redact', label: 'Redacted' },
                                        { key: 'block',  label: 'Blocked' },
                                    ].map(({ key, label }) => (
                                        <div key={key} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2">
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</div>
                                            <div className="text-2xl font-bold mt-0.5 text-slate-900 dark:text-slate-100">{actionStats.counts[key] || 0}</div>
                                        </div>
                                    ))}
                                </div>
                            </CollapsibleSection>

                            {/* Needs attention — collapsible secondary block */}
                            {actionStats.highRisk.length > 0 ? (
                                <CollapsibleSection
                                    open={needsAttentionOpen}
                                    onToggle={() => setNeedsAttentionOpen((v) => !v)}
                                    icon={<ShieldWarning size={12} weight="duotone" className="text-slate-500 dark:text-slate-400" />}
                                    title={`Needs attention (${actionStats.highRisk.length})`}
                                >
                                    <div className="space-y-1.5">
                                        {actionStats.highRisk.slice(0, 6).map((event) => {
                                            const detectionCount = parseInt(parseDetectionsLength(event.detections));
                                            return (
                                                <button
                                                    key={event.id}
                                                    onClick={() => handleSelect(event.id)}
                                                    className="w-full text-left flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer rounded-none"
                                                >
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
                                        No high-risk events in this window
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                        All filtered events passed every detection rail. Pick any event to see what was inspected.
                                    </p>
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
