import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, ShieldCheck, MagnifyingGlass, ListBullets, SquaresFour, Eye, ChartBar, ClockCounterClockwise } from '@phosphor-icons/react';
import { ReportView } from './ReportView';
import PostureReportView from './PostureReportView';
import { RiskBreakdown } from './RiskBreakdown';
import RunHistoryView from './RunHistoryView';
import { usePersona } from '../../store/personaStore';
import { useIsTenant } from '../../data/useIsTenant';
import { fleetReportFixture } from '../../data/fleetReportFixture';

// Reports — Drive-style file browser for every generated report,
// across every customer. Replaces the two prior top-level nav items
// (Underwriting Report, Posture Report) with one section that scales
// to N reports per customer over time.
//
// V1 lists hardcoded entries; v1.1 reads from a manifest the runner
// writes to /bastion-blue/static-api/reports/index.json after each
// run. Card click opens the appropriate viewer inline.

const REPORTS = [
    {
        id: 'posture-maple-pharmacy-2026-05-10',
        type: 'posture',
        title: 'Posture Report',
        customer: 'Demo Pharmacy',
        customerSlug: 'maple-pharmacy',
        generatedAt: '2026-05-10',
        period: '2026-05-10',
        reportId: 'BASTION-ATT-2026-05-10-DEMO',
        probes: 56,
        violations: 4,
        refusals: 2,
        size: '17 KB',
        status: 'live',
    },
    {
        id: 'underwriting-acme-2026-05-08',
        type: 'underwriting',
        title: 'Underwriting Report',
        customer: 'Acme Logistics',
        customerSlug: 'acme-logistics',
        generatedAt: '2026-05-08',
        period: '2025-10-01 → 2026-03-25',
        reportId: 'BASTION-UW-2026-05-ACME',
        probes: 247,
        violations: 8,
        refusals: 184,
        size: '94 KB',
        status: 'live',
    },
];

const TYPE_META = {
    posture: { label: 'Posture', color: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800', Icon: ShieldCheck },
    underwriting: { label: 'Underwriting', color: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800', Icon: FileText },
};

export default function ReportsView({ data, navigate, tabRequest = null }) {
    const persona = usePersona();
    const isTenant = useIsTenant();
    const [open, setOpen] = useState(null);
    const [view, setView] = useState('grid');
    const [query, setQuery] = useState('');
    const [tab, setTab] = useState('reports'); // 'reports' | 'history' | 'risk'
    useEffect(() => {
        if (tabRequest?.tab && ['reports', 'history', 'risk'].includes(tabRequest.tab)) {
            setTab(tabRequest.tab);
        }
    }, [tabRequest?.nonce]);

    // Tenant gate. Signed-in real tenants must NEVER see the Demo
    // Pharmacy catalogue. They get an empty state until their first
    // `bastion run` or voice probe completes and lands in the backend.
    if (isTenant) {
        return (
            <div className="flex flex-col h-full">
                <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                    <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Reports</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Attestation reports + run history scoped to your organization.
                    </p>
                </header>
                <div className="flex-1 flex items-center justify-center px-8">
                    <div className="max-w-lg text-center">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
                            No reports yet
                        </h2>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            Reports appear here after your first assessment run. Run{' '}
                            <code className="font-mono text-[11px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800">bastion run</code>{' '}
                            from CI/CD for text-based testing, or{' '}
                            <code className="font-mono text-[11px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800">bastion voice</code>{' '}
                            for voice-based testing. You can also spawn probes from{' '}
                            <button onClick={() => navigate?.('voice-testing', 'spawn')} className="text-blue-600 hover:underline border-none bg-transparent p-0 cursor-pointer">Voice Testing</button>.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Anonymous / demo viewer path: keep the curated catalogue.
    const catalogued = REPORTS.filter((r) => {
        if (r.type === 'underwriting' && !persona.addOns.insurance) return false;
        if (r.type === 'posture' && r.customerSlug !== persona.reportSlug) return false;
        return true;
    });
    const hasPostureForPersona = catalogued.some((r) => r.type === 'posture');
    const synthesizedPosture = !hasPostureForPersona ? [{
        id: `posture-${persona.reportSlug || persona.slug}-baseline`,
        type: 'posture',
        title: 'Posture Report',
        customer: persona.label,
        customerSlug: persona.reportSlug || persona.slug,
        generatedAt: '—',
        period: 'awaiting first run',
        reportId: `BASTION-ATT-${(persona.reportSlug || persona.slug || 'tenant').toUpperCase()}-BASELINE`,
        probes: 0,
        violations: 0,
        refusals: 0,
        size: 'fixture',
        status: 'baseline',
    }] : [];

    const filtered = [...catalogued, ...synthesizedPosture].filter((r) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return [r.title, r.customer, r.reportId, r.type].some((s) => s.toLowerCase().includes(q));
    });

    if (open) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-800 print:hidden">
                    <button
                        onClick={() => setOpen(null)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                        <ArrowLeft size={14} weight="bold" />
                        Back to Reports
                    </button>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Viewing <strong>{open.title}</strong> · {open.customer} · generated {open.generatedAt}
                    </span>
                </div>
                <div className="flex-1 overflow-auto">
                    {open.type === 'posture' && <PostureReportView runRef={open.runRef} onNavigateHistory={() => { setOpen(null); setTab('history'); }} />}
                    {open.type === 'underwriting' && <ReportView />}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Posture Report</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {tab === 'reports' && 'Every attested run for this customer. Click a report to open the full attestation inline.'}
                            {tab === 'history' && 'Continuous-attestation lineage. Every Bastion run against this agent, newest first. Click a row to open that run\'s Posture Report.'}
                            {tab === 'risk' && `Hazard-risk decomposition for ${persona.label}. Severity counts mapped onto ${persona.frameworks.join(' · ')} controls.`}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search reports"
                                className="text-xs pl-7 pr-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-none w-56 focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div className="flex border border-slate-300 dark:border-slate-700">
                            <button
                                onClick={() => setView('grid')}
                                className={`px-2 py-1.5 cursor-pointer ${view === 'grid' ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
                                title="Grid view"
                            >
                                <SquaresFour size={14} weight={view === 'grid' ? 'bold' : 'regular'} />
                            </button>
                            <button
                                onClick={() => setView('list')}
                                className={`px-2 py-1.5 cursor-pointer ${view === 'list' ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
                                title="List view"
                            >
                                <ListBullets size={14} weight={view === 'list' ? 'bold' : 'regular'} />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="flex gap-1 -mb-px">
                    <SubTab id="reports"  label="Reports"                icon={FileText}              active={tab === 'reports'} onClick={() => setTab('reports')} />
                    <SubTab id="history"  label="Run history"            icon={ClockCounterClockwise} active={tab === 'history'} onClick={() => setTab('history')} />
                    <SubTab id="risk"     label="Agent Risk Assessment"  icon={ChartBar}              active={tab === 'risk'}    onClick={() => setTab('risk')} />
                </div>
            </header>

            <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
                {tab === 'reports' && (
                    <div className="px-6 py-6">
                        {filtered.length === 0 ? (
                            <EmptyState />
                        ) : view === 'grid' ? (
                            <Grid reports={filtered} onOpen={setOpen} />
                        ) : (
                            <ListTable reports={filtered} onOpen={setOpen} />
                        )}
                    </div>
                )}
                {tab === 'history' && (
                    <RunHistoryView
                        navigate={navigate}
                        onOpenReport={(run) => setOpen({
                            id: run.id, type: 'posture', title: 'Posture Report',
                            customer: run.customer, customerSlug: run.customerSlug,
                            generatedAt: run.triggeredAt.slice(0, 10), reportId: run.id,
                            // Drive PostureReportView's fetch toward the per-run
                            // JSON so the document reflects that exact run's totals.
                            runRef: run.id,
                        })}
                    />
                )}
                {tab === 'risk' && (
                    <div className="pt-2">
                        <RiskBreakdown reportData={fleetReportFixture(persona.slug)} persona={persona} setCurrentView={() => {}} />
                    </div>
                )}
            </div>
        </div>
    );
}

function SubTab({ label, icon: Icon, active, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`relative flex items-center gap-2 px-4 py-2 text-[12px] font-semibold tracking-wide cursor-pointer transition-colors border-b-2 ${active ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
            <Icon size={14} weight={active ? 'bold' : 'regular'} />
            {label}
        </button>
    );
}

function Grid({ reports, onOpen }) {
    // Group by customer for Drive-like folder-style sections.
    const groups = reports.reduce((acc, r) => {
        const k = r.customer;
        if (!acc[k]) acc[k] = [];
        acc[k].push(r);
        return acc;
    }, {});
    return (
        <div className="space-y-8">
            {Object.entries(groups).map(([customer, items]) => (
                <section key={customer}>
                    <div className="flex items-center gap-2 mb-3">
                        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            {customer}
                        </h2>
                        <span className="text-[10px] text-slate-400">{items.length} report{items.length === 1 ? '' : 's'}</span>
                        <span className="flex-1 h-px bg-slate-200 dark:bg-slate-800 ml-1" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {items.map((r) => <Card key={r.id} report={r} onOpen={onOpen} />)}
                    </div>
                </section>
            ))}
        </div>
    );
}

function Card({ report, onOpen }) {
    const meta = TYPE_META[report.type] || TYPE_META.posture;
    const Icon = meta.Icon;
    const violationRate = report.probes > 0 ? `${((report.violations / report.probes) * 100).toFixed(1)}%` : '—';
    return (
        <button
            onClick={() => onOpen(report)}
            className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all"
        >
            <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <Icon size={20} weight="bold" className="text-slate-600 dark:text-slate-300" />
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border ${meta.color}`}>
                    {meta.label}
                </span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {report.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 truncate">{report.reportId}</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
                <Stat label="Probes" value={report.probes} />
                <Stat label="Violations" value={report.violations} accent={report.violations > 0 ? 'amber' : 'plain'} />
                <Stat label="Rate" value={violationRate} />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{report.generatedAt}</span>
                <span className="text-[10px] text-slate-400">{report.size}</span>
            </div>
        </button>
    );
}

function Stat({ label, value, accent }) {
    const accentClass = accent === 'amber'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-slate-800 dark:text-slate-100';
    return (
        <div>
            <div className={`text-sm font-bold ${accentClass}`}>{value}</div>
            <div className="text-[9px] uppercase tracking-widest text-slate-400">{label}</div>
        </div>
    );
}

function ListTable({ reports, onOpen }) {
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                        <Th>Title</Th>
                        <Th>Customer</Th>
                        <Th>Type</Th>
                        <Th>Generated</Th>
                        <Th align="right">Probes</Th>
                        <Th align="right">Violations</Th>
                        <Th align="right">Actions</Th>
                    </tr>
                </thead>
                <tbody>
                    {reports.map((r) => {
                        const meta = TYPE_META[r.type];
                        const Icon = meta.Icon;
                        return (
                            <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                <td className="px-4 py-3">
                                    <button onClick={() => onOpen(r)} className="text-slate-900 dark:text-slate-100 font-medium hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer flex items-center gap-2">
                                        <Icon size={14} className="text-slate-500" />
                                        {r.title}
                                    </button>
                                    <div className="text-[10px] text-slate-500 mt-0.5 ml-6">{r.reportId}</div>
                                </td>
                                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.customer}</td>
                                <td className="px-4 py-3">
                                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border ${meta.color}`}>
                                        {meta.label}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.generatedAt}</td>
                                <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">{r.probes}</td>
                                <td className={`px-4 py-3 text-right tabular-nums ${r.violations > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>{r.violations}</td>
                                <td className="px-4 py-3 text-right">
                                    <button onClick={() => onOpen(r)} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer p-1" title="View">
                                        <Eye size={14} weight="bold" />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function Th({ children, align = 'left' }) {
    return (
        <th className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 text-${align}`}>
            {children}
        </th>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText size={32} className="text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No reports match your search.</p>
            <p className="text-xs text-slate-400 mt-1">Try a different query, or spawn a new probe from Voice Testing.</p>
        </div>
    );
}
