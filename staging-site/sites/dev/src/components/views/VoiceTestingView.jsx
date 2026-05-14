import { useState, useEffect } from 'react';
import { Phone, Network, Crosshair, CalendarBlank, Microphone, ChatText } from '@phosphor-icons/react';
import { useIsDev } from '../../store/audienceStore';
import LiveVoiceView from './LiveVoiceView';
import LiveSocketsView from './LiveSocketsView';
import { RedView } from './RedView';
import { TabBar } from './RiskCoverageView';
import AssuranceScheduleView from './AssuranceScheduleView';
import VoiceRunsPanel from './VoiceRunsPanel';
import CiRunsPanel from './CiRunsPanel';

// Voice Testing — the single consolidated section that owns the spawn
// wizard plus the live monitoring surfaces. Pre-consolidation these
// lived as 5 separate top-level nav items (telemetry, spawn, voice,
// sockets, red); they all collapse here behind tabs.
//
// Default tab is "Spawn Probe" — Luyun's ask was that this section
// reads as "the wizard." Live tabs follow for inspection while a probe
// runs. Adversarial Assessment stays under a dev-only tab since it's
// the bastion-runner deep view that buyers don't usually need to see.

export function VoiceTestingView({ setCurrentView, navigate, initialTab = 'text-runs', tabRequest = null }) {
    const isDev = useIsDev();
    const tabs = [
        { id: 'text-runs',   label: 'Text Runs',             icon: ChatText },
        { id: 'voice-runs',  label: 'Voice Runs',            icon: Microphone },
        { id: 'schedule',    label: 'CI/CD',                 icon: CalendarBlank },
        { id: 'voice',       label: 'Live Voice',            icon: Phone },
        { id: 'sockets',     label: 'Live WebSockets',       icon: Network },
        ...(isDev ? [{ id: 'red', label: 'Adversarial Assessment', icon: Crosshair }] : []),
    ];
    const [tab, setTab] = useState(tabs.find((t) => t.id === initialTab) ? initialTab : 'text-runs');
    // Honour cross-view tab jumps from App's `navigate(view, tab)`. The
    // nonce flips on every request so re-clicking the same tab from a
    // sibling view still triggers the effect.
    useEffect(() => {
        if (tabRequest?.tab && tabs.find((t) => t.id === tabRequest.tab)) {
            setTab(tabRequest.tab);
        }
    }, [tabRequest?.nonce]);

    return (
        <div className="flex flex-col h-full">
            <TabBar
                tabs={tabs}
                active={tab}
                onChange={setTab}
                title="Test Suite"
                subtitle="Adversarial probes against your target agent. Runs are scoped to your org; results land in Reports when they complete."
                docsHref="/docs"
            />
            <div className="flex-1 overflow-auto">
                {tab === 'text-runs' && (
                    <div className="p-4">
                        <CiRunsPanel
                            title="Text Assessment Runs"
                            subtitle="bastion run — probes execute on Bastion infra against your target"
                        />
                    </div>
                )}
                {tab === 'voice-runs' && <VoiceRunsPanel />}
                {tab === 'schedule' && <AssuranceScheduleView setCurrentView={setCurrentView} navigate={navigate} onScheduleNew={() => setTab('spawn')} />}
                {tab === 'voice' && <LiveVoiceView />}
                {tab === 'sockets' && <LiveSocketsView />}
                {tab === 'red' && <RedView />}
            </div>
        </div>
    );
}
