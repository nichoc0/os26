import { useState } from 'react';
import { ChartBar, Shield } from '@phosphor-icons/react';
import { RiskBreakdown } from './RiskBreakdown';
import { CoverageMap } from './CoverageMap';

// Tabbed wrapper merging the prior top-level "Risk Score" and
// "Coverage Map" nav items. Tabs preserve the legacy ?view=risk and
// ?view=coverage deep links via App.jsx REDIRECTS.

const TABS = [
    { id: 'risk',     label: 'Risk Score',   icon: ChartBar },
    { id: 'coverage', label: 'Coverage Map', icon: Shield },
];

export function RiskCoverageView({ reportData, setCurrentView, initialTab = 'risk' }) {
    const [tab, setTab] = useState(TABS.find((t) => t.id === initialTab) ? initialTab : 'risk');

    return (
        <div className="flex flex-col h-full">
            <TabBar tabs={TABS} active={tab} onChange={setTab} title="Risk & Coverage" subtitle="Fleet-wide risk posture and the insurance-coverage map that backs it." />
            <div className="flex-1 overflow-auto">
                {tab === 'risk' && <RiskBreakdown reportData={reportData} setCurrentView={setCurrentView} />}
                {tab === 'coverage' && <CoverageMap setCurrentView={setCurrentView} />}
            </div>
        </div>
    );
}

function TabBar({ tabs, active, onChange, title, subtitle, docsHref }) {
    return (
        <div className="border-b border-slate-200 dark:border-slate-800 px-6 pt-8 pb-0 bg-white dark:bg-slate-950 print:hidden">
            <div className="mb-8 flex items-start justify-between gap-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">{title}</h1>
                    {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed max-w-3xl">{subtitle}</p>}
                </div>
                {docsHref && (
                    <a
                        href={docsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 transition-colors no-underline"
                    >
                        Read the docs →
                    </a>
                )}
            </div>
            <div className="flex gap-1 -mb-px">
                {tabs.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => onChange(id)}
                        className={`relative flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold tracking-wide cursor-pointer transition-colors border-b-2 ${active === id ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                    >
                        <Icon size={14} weight={active === id ? 'bold' : 'regular'} />
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}

export { TabBar };
