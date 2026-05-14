import { useState } from 'react';
import { Robot, Eye, Lock, TreeStructure } from '@phosphor-icons/react';
import { AgentsView } from './AgentsView';
import { LiveTelemetry } from './LiveTelemetry';
import SessionsView from '../sessions/SessionsView';
import { VaultGraph } from './VaultGraph';
import { TabBar } from './RiskCoverageView';

// Fleet — single section for everything about the customer's agent
// fleet: who's deployed, what they're doing right now, what they've
// done historically, and the cross-call knowledge derived from it.
// Replaces the prior four standalone nav items (AI Agents, Live
// Activity, Vault, Knowledge Graph) per Luyun's task-oriented merge:
// every "monitor my fleet" sub-task lives here.

export function FleetView({
    data,
    loading,
    onInspect,
    selectedEvent,
    selectedEventId,
    setSelectedEventId,
    initialTab = 'agents',
}) {
    const tabs = [
        { id: 'agents',    label: 'Directory',       icon: Robot },
        { id: 'live',      label: 'Tools view',      icon: Eye },
        { id: 'sessions',  label: 'Vault',           icon: Lock },
        { id: 'graph',     label: 'Knowledge Graph', icon: TreeStructure },
    ];
    const [tab, setTab] = useState(tabs.find((t) => t.id === initialTab) ? initialTab : 'agents');

    return (
        <div className="flex flex-col h-full">
            <TabBar
                tabs={tabs}
                active={tab}
                onChange={setTab}
                title="Agents"
                subtitle="Every agent under monitoring — who they are, what they're doing now, what they did, what we learned."
            />
            <div className="flex-1 overflow-auto pt-4">
                {tab === 'agents' && <AgentsView data={data} loading={loading} onInspect={onInspect} />}
                {tab === 'live' && (
                    <LiveTelemetry
                        data={data}
                        onInspect={onInspect}
                        selectedEvent={selectedEvent}
                        selectedEventId={selectedEventId}
                        setSelectedEventId={setSelectedEventId}
                    />
                )}
                {tab === 'sessions' && <SessionsView />}
                {tab === 'graph' && <VaultGraph data={data} />}
            </div>
        </div>
    );
}
