import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lightning, Crosshair, CalendarBlank, Phone, X } from '@phosphor-icons/react';
import { useIsDev } from '../../store/audienceStore';
import SpawnProbeWizard from './SpawnProbeWizard';
import { RedView } from './RedView';
import { TabBar } from './RiskCoverageView';
import AssuranceScheduleView from './AssuranceScheduleView';
import CallsPanel from './CallsPanel';

// Voice Testing — consolidated voice-agent surface. Single primary tab
// ("Calls") merges the prior Voice Runs / Live Voice / Live WebSockets
// trio into one stacked panel: live (top) + past runs (bottom). Spawn
// Probe is no longer a sibling tab — it's a primary action button in
// the top-right that opens the wizard modally. Schedule (CI/CD) stays
// as a side tab; Adversarial Assessment stays dev-only.

export function VoiceTestingView({ setCurrentView, navigate, initialTab = 'calls', tabRequest = null }) {
    const isDev = useIsDev();
    const tabs = [
        { id: 'calls',    label: 'Calls',                 icon: Phone },
        { id: 'schedule', label: 'CI/CD',                 icon: CalendarBlank },
        ...(isDev ? [{ id: 'red', label: 'Adversarial Assessment', icon: Crosshair }] : []),
    ];
    const initial = tabs.find((t) => t.id === initialTab)
        ? initialTab
        : (initialTab === 'spawn' || initialTab === 'voice' || initialTab === 'sockets' || initialTab === 'voice-runs' ? 'calls' : 'calls');
    const [tab, setTab] = useState(initial);
    const [spawnOpen, setSpawnOpen] = useState(false);

    useEffect(() => {
        if (!tabRequest?.tab) return;
        if (tabRequest.tab === 'spawn') { setSpawnOpen(true); return; }
        if (tabs.find((t) => t.id === tabRequest.tab)) {
            setTab(tabRequest.tab);
        } else if (['voice', 'sockets', 'voice-runs'].includes(tabRequest.tab)) {
            setTab('calls');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabRequest?.nonce]);

    return (
        <div className="flex flex-col h-full">
            <div className="relative">
                <TabBar
                    tabs={tabs}
                    active={tab}
                    onChange={setTab}
                    title="Voice Testing"
                    subtitle="Live voice calls + WebSocket sessions, plus the past-run history. Spawn a probe from the top-right to fire a new run."
                />
                {/* Spawn Probe primary action — sits in the top-right of
                    the section header. Opens the wizard in a modal so the
                    Calls panel below isn't replaced mid-flow. */}
                <button
                    onClick={() => setSpawnOpen(true)}
                    className="absolute top-8 right-6 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border border-slate-900 dark:border-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 rounded-none shadow-sm cursor-pointer transition-colors"
                    title="Spawn an adversarial probe against the target agent"
                >
                    <Lightning size={12} weight="bold" />
                    Spawn probe
                </button>
            </div>
            <div className="flex-1 overflow-auto">
                {tab === 'calls' && <CallsPanel />}
                {tab === 'schedule' && <AssuranceScheduleView setCurrentView={setCurrentView} navigate={navigate} onScheduleNew={() => setSpawnOpen(true)} />}
                {tab === 'red' && <RedView />}
            </div>
            {spawnOpen && (
                <SpawnProbeModal onClose={() => setSpawnOpen(false)}>
                    <SpawnProbeWizard setCurrentView={(v) => { setSpawnOpen(false); if (setCurrentView) setCurrentView(v); }} />
                </SpawnProbeModal>
            )}
        </div>
    );
}

function SpawnProbeModal({ onClose, children }) {
    if (typeof document === 'undefined') return null;
    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Spawn probe"
            className="fixed inset-0 z-[1000] bg-slate-950/70 backdrop-blur-sm flex items-stretch justify-center p-4 sm:p-8"
            onClick={onClose}
        >
            <div
                className="relative flex flex-col w-full max-w-[1400px] h-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 shadow-2xl rounded-none"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="shrink-0 px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-950">
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Spawn probe</div>
                        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">Configure + fire a new adversarial run</h2>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="inline-flex items-center justify-center w-9 h-9 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer transition-colors rounded-none"
                    >
                        <X size={16} weight="bold" />
                    </button>
                </div>
                <div className="flex-1 overflow-auto">{children}</div>
            </div>
        </div>,
        document.body
    );
}
