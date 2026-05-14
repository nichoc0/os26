import { useState, useEffect } from 'react';
import { Pulse, GearSix, Robot, Phone, ShieldCheck, List, X, ShieldChevron } from '@phosphor-icons/react';
import { useIsDev } from '../../store/audienceStore';
import ExportMenu from './ExportMenu';

// Consolidated nav. Pre-client 14-item count was over-engineered; one
// section per buyer-recognizable concept now. Each consolidated section
// internally uses tabs to surface what used to be a top-level item.
//
// Old → new mapping:
//   risk + coverage              → Risk & Coverage
//   telemetry + voice + sockets + spawn + red → Voice Testing
//   sessions + vault             → Vault & Knowledge
//   report + posture             → Reports (Drive-style file browser)
//   overview, agents, config     → unchanged

// Five sections, each a task a customer wants to accomplish.
//   Overview        — at-a-glance for the active persona
//   Test            — spawn adversarial probes against my agent
//   Fleet           — see my agents, what they're doing, what they've done
//   Posture Report  — produce the attestation a regulator / underwriter signs
//   Settings        — configure my Bastion deployment
const primaryItems = [
    { id: 'overview',      label: 'Overview',       icon: Pulse },
    { id: 'voice-testing', label: 'Test',           icon: Phone },
    { id: 'fleet',         label: 'Agents',         icon: Robot },
    { id: 'reports',       label: 'Posture Report', icon: ShieldCheck },
    { id: 'config',        label: 'Settings',       icon: GearSix },
];

// Items that only make sense for the insurance audience. Risk & Coverage
// and Reports (which surfaces the Underwriting Report) sit behind this
// gate in non-dev mode.
const INSURANCE_ONLY = new Set([]);

const ACTIVE = 'bg-white dark:bg-slate-800 border-x-0 border-y-0 border-r-2 border-r-blue-500 text-blue-600 dark:text-blue-400 relative z-10 shadow-[2px_0_10px_-3px_rgba(37,99,235,0.3)]';
const IDLE = 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 border-none transition-colors';

export function SideNav({ currentView, setCurrentView }) {
    const isDev = useIsDev();
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        if (!mobileOpen) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [mobileOpen]);

    const visibleNav = primaryItems.filter((i) => isDev || !INSURANCE_ONLY.has(i.id));

    return (
        <>
            {/* Desktop sidebar */}
            <aside className="hidden sm:flex w-[220px] bg-slate-100/50 dark:bg-[#060B14]/80 backdrop-blur-sm flex-col py-6 border-r border-slate-300 dark:border-slate-800/80 shrink-0 z-50 transition-colors fixed inset-y-0 left-0">
                <ExportMenu setCurrentView={setCurrentView} />

                <div className="flex-1 w-full flex flex-col gap-0.5 px-2 overflow-y-auto">
                    {visibleNav.map(({ id, label, icon: Icon }) => (
                        <button key={id} onClick={() => setCurrentView(id)} title={label}
                            className={`relative flex items-center gap-3 w-full h-11 px-3 rounded-none transition-all group cursor-pointer text-left ${currentView === id ? ACTIVE : IDLE}`}>
                            {currentView === id && (
                                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-blue-500" />
                            )}
                            <Icon size={18} className={`shrink-0 transition-transform ${currentView === id ? 'text-blue-600 dark:text-blue-400' : 'group-hover:text-slate-800 group-hover:dark:text-slate-200'}`} />
                            <span className={`text-[12px] font-semibold tracking-wide truncate ${currentView === id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-800 group-hover:dark:text-slate-200'}`}>{label}</span>
                        </button>
                    ))}
                </div>
            </aside>

            {/* Mobile bottom trigger bar. */}
            {(() => {
                const current = visibleNav.find((i) => i.id === currentView);
                const CurrentIcon = current?.icon ?? Pulse;
                return (
                    <button
                        onClick={() => setMobileOpen(true)}
                        className="flex sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 h-16 safe-bottom items-center px-4 gap-3 cursor-pointer text-left"
                        aria-label="Open navigation"
                    >
                        <List size={22} weight="bold" className="text-slate-700 dark:text-slate-200 shrink-0" />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <CurrentIcon size={16} className="text-slate-500 dark:text-slate-400 shrink-0" />
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {current?.label ?? 'Menu'}
                            </span>
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            Menu
                        </span>
                    </button>
                );
            })()}

            {/* Mobile drawer overlay. */}
            {mobileOpen && (
                <div className="sm:hidden fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} aria-hidden="true" />
                    <aside className="absolute inset-x-0 bottom-0 top-12 bg-white dark:bg-[#060B14] border-t border-slate-300 dark:border-slate-800 flex flex-col shadow-[0_-12px_40px_rgba(0,0,0,0.45)] safe-bottom">
                        <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-slate-800 shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-black border border-slate-700 flex items-center justify-center p-1 rounded-none">
                                    <img src={`${import.meta.env.BASE_URL}bastion-logo.png`} alt="Bastion" className="w-full h-full object-contain" />
                                </div>
                                <span className="font-bold tracking-tight text-slate-900 dark:text-slate-50">Bastion</span>
                            </div>
                            <button onClick={() => setMobileOpen(false)} className="p-2 -mr-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100" aria-label="Close navigation">
                                <X size={22} weight="bold" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto py-2">
                            <div className="px-2">
                                {visibleNav.map(({ id, label, icon: Icon }) => (
                                    <button key={id} onClick={() => { setCurrentView(id); setMobileOpen(false); }}
                                        className={`relative flex items-center gap-3 w-full h-12 px-3 rounded-none cursor-pointer text-left ${currentView === id ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                                        {currentView === id && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-500" />}
                                        <Icon size={20} className="shrink-0" />
                                        <span className="text-sm font-semibold tracking-wide truncate">{label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </aside>
                </div>
            )}
        </>
    );
}
