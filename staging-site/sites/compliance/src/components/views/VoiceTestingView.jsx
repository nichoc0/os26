import { useState, useEffect } from 'react';
import { Lightning, Phone, Network, Crosshair, CalendarBlank, Microphone } from '@phosphor-icons/react';
import { useIsDev } from '../../store/audienceStore';
import SpawnProbeWizard from './SpawnProbeWizard';
import LiveVoiceView from './LiveVoiceView';
import LiveSocketsView from './LiveSocketsView';
import { RedView } from './RedView';
import { TabBar } from './RiskCoverageView';
import AssuranceScheduleView from './AssuranceScheduleView';
import VoiceRunsPanel from './VoiceRunsPanel';

// Voice Testing — the single consolidated section that owns the spawn
// wizard plus the live monitoring surfaces. Pre-consolidation these
// lived as 5 separate top-level nav items (telemetry, spawn, voice,
// sockets, red); they all collapse here behind tabs.
//
// Default tab is "Spawn Probe" — Luyun's ask was that this section
// reads as "the wizard." Live tabs follow for inspection while a probe
// runs. Adversarial Assessment stays under a dev-only tab since it's
// the bastion-runner deep view that buyers don't usually need to see.

export function VoiceTestingView({ setCurrentView, navigate, initialTab = 'spawn', tabRequest = null }) {
    const isDev = useIsDev();
    const tabs = [
        { id: 'spawn',       label: 'Spawn Probe',           icon: Lightning },
        { id: 'voice-runs',  label: 'Voice Runs',            icon: Microphone },
        { id: 'schedule',    label: 'CI/CD',                 icon: CalendarBlank },
        { id: 'voice',       label: 'Live Voice',            icon: Phone },
        { id: 'sockets',     label: 'Live WebSockets',       icon: Network },
        ...(isDev ? [{ id: 'red', label: 'Adversarial Assessment', icon: Crosshair }] : []),
    ];
    const [tab, setTab] = useState(tabs.find((t) => t.id === initialTab) ? initialTab : 'spawn');
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
                title="Voice Testing"
                subtitle="Spawn adversarial probes against the target voice agent and watch them run live. Reports land in the Reports section when a run completes."
            />
            <div className="flex-1 overflow-auto">
                {tab === 'spawn' && <SpawnProbeWizard setCurrentView={setCurrentView} />}
                {tab === 'voice-runs' && <VoiceRunsPanel />}
                {tab === 'schedule' && <AssuranceScheduleView setCurrentView={setCurrentView} navigate={navigate} onScheduleNew={() => setTab('spawn')} />}
                {tab === 'voice' && <LiveVoiceView />}
                {tab === 'sockets' && <LiveSocketsView />}
                {tab === 'red' && <RedView />}
            </div>
        </div>
    );
}
