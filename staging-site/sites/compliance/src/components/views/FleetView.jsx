import { useState, useEffect } from 'react';
import { Eye, TreeStructure } from '@phosphor-icons/react';
import { AgentDirectoryWithDetail } from './AgentDetailView';
import KnowledgeGraphView from '../kg/KnowledgeGraphView';
import { getAgentCatalog, getAgentById } from '../../data/agentCatalog';
import { usePersona } from '../../store/personaStore';

// Agents — two clean tabs per Luyun's 2026-05-18 simplification:
//   Activity  — Agent directory tile-picker → click an agent to drill
//               into their sessions feed → click any event for the
//               tool-call timeline. "All agents" is the cross-fleet
//               firehose. (Agent → Session → Tool call.)
//   Graph     — Knowledge Graph (subsumes the prior Vault graph view).
// Removed: outer "Agents" title, Directory / Tools view / Overview /
// separate Vault tab. Everything is reachable from these two surfaces.

export function FleetView({
    data,
    loading,
    onInspect,
    selectedEvent,
    selectedEventId,
    setSelectedEventId,
    initialTab = 'activity',
    tabRequest = null,
}) {
    const tabs = [
        { id: 'activity', label: 'Activity', icon: Eye },
        { id: 'graph',    label: 'Graph',    icon: TreeStructure },
    ];
    const initial = tabs.find((t) => t.id === initialTab) ? initialTab : 'activity';
    const [tab, setTab] = useState(initial);

    // Cross-view tab jump from App.jsx's navigate(view, tab). The nonce
    // changes on every navigate so repeat targets re-fire the effect.
    // Required so PolicyConfig's "View" can land the user on Fleet →
    // Graph instead of the default Activity tab.
    useEffect(() => {
        if (!tabRequest?.tab) return;
        if (!tabs.find((t) => t.id === tabRequest.tab)) return;
        setTab(tabRequest.tab);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabRequest?.nonce]);

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 px-6 pt-4 bg-white dark:bg-slate-950">
                <div className="flex gap-1 -mb-px">
                    {tabs.map(({ id, label, icon: Icon }) => {
                        const active = tab === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setTab(id)}
                                className={`relative flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold tracking-wide cursor-pointer transition-colors border-b-2 ${
                                    active
                                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                <Icon size={14} weight={active ? 'bold' : 'regular'} />
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="flex-1 overflow-auto pt-6">
                {tab === 'activity' && (
                    <AgentDirectoryWithDetail
                        data={data}
                        onInspect={onInspect}
                        selectedEvent={selectedEvent}
                        selectedEventId={selectedEventId}
                        setSelectedEventId={setSelectedEventId}
                    />
                )}
                {tab === 'graph' && <GraphTab />}
            </div>
        </div>
    );
}

// GraphTab — Knowledge Graph view with an agent scope chip strip at
// the top. Picking an agent narrows the KG to its subgraph (substring
// match on the triple head/tail/relation against agent id + label).
// Default selection = whatever ?agent= the user picked in the Activity
// tab, so the two surfaces stay in sync.
function GraphTab() {
    const persona = usePersona();
    const personaSlug = persona?.slug || 'maple-pharmacy';
    const catalog = getAgentCatalog(personaSlug);
    const readAgent = () => {
        if (typeof window === 'undefined') return null;
        const p = new URLSearchParams(window.location.search).get('agent');
        if (!p || p === 'all') return null;
        return getAgentById(personaSlug, p) ? p : null;
    };
    const [agentId, setAgentIdState] = useState(readAgent());
    const setAgentId = (id) => {
        setAgentIdState(id);
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        if (id) url.searchParams.set('agent', id);
        else url.searchParams.set('agent', 'all');
        window.history.replaceState({}, '', url.toString());
    };
    useEffect(() => {
        const onPop = () => setAgentIdState(readAgent());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const active = agentId ? getAgentById(personaSlug, agentId) : null;
    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 px-6 pb-3 flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mr-1">Scope</span>
                <button
                    onClick={() => setAgentId(null)}
                    className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest border rounded-none cursor-pointer transition-colors ${
                        !agentId
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                    }`}
                >
                    All agents
                </button>
                {catalog.map((a) => {
                    const isActive = agentId === a.id;
                    return (
                        <button
                            key={a.id}
                            onClick={() => setAgentId(a.id)}
                            className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest border rounded-none cursor-pointer transition-colors ${
                                isActive
                                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                            }`}
                        >
                            {a.label}
                        </button>
                    );
                })}
            </div>
            <div className="flex-1 overflow-hidden">
                <KnowledgeGraphView embedded agentId={agentId} agentLabel={active?.label} />
            </div>
        </div>
    );
}
