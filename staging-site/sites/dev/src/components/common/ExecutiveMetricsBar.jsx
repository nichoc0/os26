import { useState } from 'react';
import { X, ArrowRight } from '@phosphor-icons/react';
import { useIsDev } from '../../store/audienceStore';

export function ExecutiveMetricsBar({ overview, agents, setCurrentView }) {
    const [selectedIdx, setSelectedIdx] = useState(null);
    const isDev = useIsDev();

    const o = overview || {};
    const agentList = agents || [];

    // Map API field names to what we need (API returns total_cost_usd, agent_id, etc.)
    const getCost = (a) => a.total_cost ?? a.total_cost_usd ?? 0;
    const getLatency = (a) => a.avg_latency ?? 0;
    const getPii = (a) => a.pii_count ?? a.flags ?? 0;
    const getRisk = (a) => a.risk_score ?? 0;
    const getId = (a) => a.id ?? a.agent_id ?? 'unknown';
    const getLabel = (a) => a.label ?? a.id ?? a.agent_id ?? 'unknown';

    const piiCount = o.pii_exposures ?? o.total_flags ?? agentList.reduce((s, a) => s + getPii(a), 0);
    const fleetRisk = o.fleet_risk ?? +(Math.min(((o.total_flags || o.pii_exposures || 0) + (o.total_blocks || 0) * 5) / Math.max(o.total_events || o.total_requests || 1, 1) * 100, 100)).toFixed(1);
    const agentsTracked = o.total_agents_tracked ?? o.unique_agents ?? agentList.length;
    const actionsMonitored = o.total_actions_monitored ?? o.total_events ?? agentList.reduce((s, a) => s + (a.total_requests ?? 0), 0);

    const agentBreakdown = (key, fmt) => agentList.map(a => {
        const val = key === 'total_cost' ? getCost(a) : key === 'avg_latency' ? getLatency(a) : key === 'pii_count' ? getPii(a) : key === 'risk_score' ? getRisk(a) : key === 'total_requests' ? (a.total_requests ?? 0) : key === 'agent_present' ? 1 : (a[key] ?? 0);
        return { label: getLabel(a), value: fmt(val), source: getId(a), note: '' };
    });

    const metrics = [
        {
            title: 'Agents Tracked',
            value: `${agentsTracked}`,
            trend: '',
            isPositive: true,
            navTarget: 'agents',
            detail: 'Distinct AI agents under continuous monitoring',
            tooltipTitle: 'Agents in Fleet',
            breakdown: agentBreakdown('agent_present', () => 'tracked'),
            total: { label: 'Total', value: `${agentsTracked}` },
            recommendations: [],
        },
        {
            title: 'Actions Monitored',
            value: `${actionsMonitored.toLocaleString()}`,
            trend: '',
            isPositive: true,
            navTarget: 'telemetry',
            detail: 'Tool calls and AI responses observed in the window',
            tooltipTitle: 'Actions by Agent',
            breakdown: agentBreakdown('total_requests', v => `${v}`),
            total: { label: 'Total', value: `${actionsMonitored.toLocaleString()}` },
            recommendations: [],
        },
        {
            title: 'PII Exposures',
            value: `${piiCount}`,
            trend: '',
            isPositive: piiCount === 0,
            navTarget: 'telemetry',
            detail: 'Personal information instances detected in AI responses',
            tooltipTitle: 'PII by Agent',
            breakdown: agentBreakdown('pii_count', v => `${v}`),
            total: { label: 'Total', value: `${piiCount}` },
            recommendations: [],
        },
        {
            title: isDev ? 'Posture Score' : 'Fleet Risk Score',
            value: `${fleetRisk}`,
            trend: '',
            isPositive: fleetRisk < 0.3,
            navTarget: isDev ? 'agents' : 'risk',
            detail: isDev ? 'Combined signal across exposures, blocked actions, and anomalies' : 'Combined risk across exposures, blocked actions, and anomalies',
            tooltipTitle: isDev ? 'Posture by Agent' : 'Risk by Agent',
            breakdown: agentBreakdown('risk_score', v => v.toFixed(2)),
            total: { label: isDev ? 'Fleet Posture' : 'Fleet Score', value: `${fleetRisk}` },
            recommendations: [],
        },
    ];

    const selected = selectedIdx !== null ? metrics[selectedIdx] : null;
    const priorityStyles = {
        high: 'bg-slate-100 dark:bg-blue-900/20 border-blue-800 dark:border-blue-800/40 text-blue-200 dark:text-blue-200',
        medium: 'bg-blue-50 dark:bg-blue-600/10 border-blue-500 dark:border-blue-500/20 text-blue-400 dark:text-blue-400',
        low: 'bg-slate-50 dark:bg-slate-500/10 border-slate-200 dark:border-slate-500/20 text-slate-600 dark:text-slate-400',
    };

    return (
        <div className="w-full mb-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none">
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-200 dark:divide-slate-800">
                    {metrics.map((metric, idx) => (
                        <div
                            key={idx}
                            onClick={() => {
                                if (metric.navTarget && setCurrentView) {
                                    setCurrentView(metric.navTarget);
                                } else {
                                    setSelectedIdx(selectedIdx === idx ? null : idx);
                                }
                            }}
                            className={`group relative px-5 py-5 transition-colors cursor-pointer ${selectedIdx === idx ? 'bg-blue-50/50 dark:bg-blue-500/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        >
                            <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">{metric.title}</p>
                            <div className="flex items-baseline gap-2 mb-1">
                                <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight">{metric.value}</span>
                                <span className={`text-xs font-semibold ${metric.isPositive ? 'text-blue-600 dark:text-blue-400' : 'text-blue-200 dark:text-blue-200'}`}>
                                    {metric.trend}
                                </span>
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500">{metric.detail}</p>

                            {selectedIdx === idx && (
                                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500" />
                            )}

                            {/* Breakdown Tooltip */}
                            <div className={`absolute top-full mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 ${idx === 0 ? 'left-0' : idx === metrics.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
                                <div className={`w-2 h-2 bg-white dark:bg-slate-900 absolute -top-1 rotate-45 border-l border-t border-slate-200 dark:border-slate-600 ${idx === 0 ? 'left-8' : idx === metrics.length - 1 ? 'right-8' : 'left-1/2 -translate-x-1/2'}`}></div>
                                <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10px] font-sans shadow-xl border border-slate-200 dark:border-slate-600 w-[280px]">
                                    <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-600 font-bold text-[11px] tracking-wide uppercase text-slate-500 dark:text-slate-300">
                                        {metric.tooltipTitle}
                                    </div>
                                    <div className="px-3 py-1.5">
                                        {metric.breakdown.map((row, i) => (
                                            <div key={i} className="flex items-start justify-between py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                                                <div className="flex-1 min-w-0 pr-3">
                                                    <div className="text-slate-700 dark:text-slate-200 font-medium leading-tight">{row.label}</div>
                                                    <div className="text-slate-400 dark:text-slate-500 text-[9px] mt-0.5">
                                                        Source: {row.source}{row.note ? ` · ${row.note}` : ''}
                                                    </div>
                                                </div>
                                                <div className="text-right font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">{row.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-600 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                                        <span className="font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wide">{metric.total.label}</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-[11px]">{metric.total.value}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recommendations Panel */}
            {selected && (
                <div className="bg-white dark:bg-slate-900 border border-t-0 border-slate-200 dark:border-slate-800 rounded-none">
                    <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Recommendations</span>
                            <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100">{selected.title}</span>
                        </div>
                        <button onClick={() => setSelectedIdx(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                            <X size={14} className="text-slate-400" />
                        </button>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {selected.recommendations.map((rec, i) => (
                            <div key={i} className="px-5 py-3 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border rounded-none ${priorityStyles[rec.priority]}`}>
                                    {rec.priority}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">{rec.action}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{rec.detail}</div>
                                </div>
                                <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
                                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">{rec.impact}</span>
                                    <ArrowRight size={12} className="text-slate-300 dark:text-slate-600" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
