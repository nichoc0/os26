import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Envelope, Phone, IdentificationCard, CreditCard, ShieldWarning, ArrowRight, Warning, CheckCircle, Prohibit } from '@phosphor-icons/react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none';

const PII_ICONS = {
    'Email': Envelope,
    'Phone': Phone,
    'SSN': IdentificationCard,
    'Credit Card': CreditCard,
};

const PII_COLORS = {
    'Email': { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', icon: 'text-blue-500' },
    'Phone': { bg: 'bg-blue-100 dark:bg-blue-400/10', text: 'text-blue-500 dark:text-blue-300', icon: 'text-blue-400' },
    'SSN': { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-blue-200 dark:text-blue-200', icon: 'text-blue-800' },
    'Credit Card': { bg: 'bg-blue-200/30 dark:bg-blue-600/10', text: 'text-blue-400 dark:text-blue-400', icon: 'text-blue-600' },
};

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function AgentBadge({ agent, meta }) {
    const info = meta?.[agent] || { color: '#94a3b8', label: agent };
    return (
        <span
            className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-sm text-white"
            style={{ backgroundColor: info.color }}
        >
            {info.label}
        </span>
    );
}

const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-none shadow-lg px-3 py-2 text-xs">
            <p className="font-semibold text-slate-800 dark:text-slate-100">{d.name}: {d.value}</p>
        </div>
    );
};

const BarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-none shadow-lg px-3 py-2 text-xs">
            <p className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{label}</p>
            {payload.map((p) => (
                <p key={p.dataKey} style={{ color: p.fill }} className="font-medium">{p.dataKey}: {p.value}</p>
            ))}
        </div>
    );
};

export function SafetyMetrics({ data, onInspect }) {
    const piiSummary = data?.pii_summary || [];
    const toolStats = data?.tool_stats || [];
    const events = data?.events || [];
    const agentMeta = data?.agentMeta || {};

    // Events with PII detections
    const piiEvents = useMemo(() => {
        return events.filter(e => e.pii_detections?.length > 0);
    }, [events]);

    // Events with rate_anomaly flag
    const anomalyEvents = useMemo(() => {
        return events.filter(e => e.flags?.includes('rate_anomaly'));
    }, [events]);

    // Top 4 PII types for stat cards
    const topPiiTypes = ['Email', 'Phone', 'SSN', 'Credit Card'];
    const piiByType = useMemo(() => {
        const map = {};
        piiSummary.forEach(p => { map[p.type] = p.count; });
        return map;
    }, [piiSummary]);

    // Tool stats for bar chart
    const toolBarData = useMemo(() => {
        return toolStats.map(t => ({
            name: t.name,
            allowed: t.status === 'allowed' ? t.count : 0,
            blocked: t.status === 'blocked' ? t.count : 0,
        }));
    }, [toolStats]);

    const totalPii = piiSummary.reduce((s, p) => s + p.count, 0);

    return (
        <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-12">
            {/* Header */}
            <div className="mb-2">
                <div className="flex items-center gap-3">
                    <ShieldWarning size={28} weight="duotone" className="text-blue-500" />
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Safety &amp; PII Metrics</h1>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {totalPii} PII detections across {piiEvents.length} events &middot; {anomalyEvents.length} anomalies
                </p>
            </div>

            {/* PII Detection Summary — 4 stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {topPiiTypes.map((type, i) => {
                    const Icon = PII_ICONS[type] || ShieldWarning;
                    const colors = PII_COLORS[type] || { bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-600', icon: 'text-slate-500' };
                    const count = piiByType[type] || 0;
                    return (
                        <motion.div
                            key={type}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: i * 0.05 }}
                            className={`${card} p-4`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{type}</p>
                                    <p className={`text-3xl font-bold mt-1 ${colors.text}`}>{count}</p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">detections</p>
                                </div>
                                <div className={`p-3 rounded-sm ${colors.bg}`}>
                                    <Icon size={24} weight="duotone" className={colors.icon} />
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* PII Breakdown Pie */}
                <div className={`${card} p-4`}>
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">PII Breakdown</h2>
                    <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={piiSummary}
                                    dataKey="count"
                                    nameKey="type"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={90}
                                    innerRadius={50}
                                    paddingAngle={2}
                                    strokeWidth={0}
                                >
                                    {piiSummary.map((entry, idx) => (
                                        <Cell key={idx} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 justify-center">
                        {piiSummary.map(p => (
                            <div key={p.type} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                                {p.type} ({p.count})
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tool Validation Bar Chart */}
                <div className={`${card} p-4`}>
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Tool Validation</h2>
                    <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={toolBarData} layout="vertical" margin={{ left: 20, right: 16, top: 4, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-slate-200, #e2e8f0)" />
                                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} width={100} />
                                <RechartsTooltip content={<BarTooltip />} />
                                <Bar dataKey="allowed" fill="#93c5fd" stackId="a" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="blocked" fill="#1e3a5f" stackId="a" radius={[0, 0, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex gap-4 mt-2 justify-center text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5">
                            <CheckCircle size={14} weight="fill" className="text-blue-300" /> Allowed
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Prohibit size={14} weight="fill" className="text-blue-800" /> Blocked
                        </span>
                    </div>
                </div>
            </div>

            {/* Recent PII Events Table */}
            <div className={`${card} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Recent PII Events</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                <th className="text-left px-4 py-2 font-semibold">Timestamp</th>
                                <th className="text-left px-4 py-2 font-semibold">Agent</th>
                                <th className="text-left px-4 py-2 font-semibold">PII Types</th>
                                <th className="text-right px-4 py-2 font-semibold">Risk Score</th>
                                <th className="text-right px-4 py-2 font-semibold"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {piiEvents.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                                        No PII events detected.
                                    </td>
                                </tr>
                            ) : (
                                piiEvents.map((event) => {
                                    const piiTypes = [...new Set(event.pii_detections.map(p => p.type))];
                                    return (
                                        <tr
                                            key={event.id}
                                            onClick={() => onInspect?.(event.id)}
                                            className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                                        >
                                            <td className="px-4 py-2.5">
                                                <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                                                    {formatTime(event.timestamp)}
                                                </span>
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-2">
                                                    {formatDate(event.timestamp)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <AgentBadge agent={event.agent} meta={agentMeta} />
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex flex-wrap gap-1">
                                                    {piiTypes.map(type => {
                                                        const colors = PII_COLORS[type] || { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' };
                                                        return (
                                                            <span key={type} className={`px-2 py-0.5 text-[10px] font-semibold rounded-sm ${colors.bg} ${colors.text}`}>
                                                                {type}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className={`text-xs font-semibold ${
                                                    event.risk_score >= 0.5
                                                        ? 'text-blue-200 dark:text-blue-200'
                                                        : event.risk_score >= 0.1
                                                            ? 'text-blue-400 dark:text-blue-400'
                                                            : 'text-slate-500 dark:text-slate-400'
                                                }`}>
                                                    {event.risk_score.toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <ArrowRight
                                                    size={14}
                                                    className="text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors inline-block"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Anomaly Events */}
            <div className={`${card} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <Warning size={16} weight="duotone" className="text-blue-500" />
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Anomaly Events</h2>
                    <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{anomalyEvents.length} events</span>
                </div>
                {anomalyEvents.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                        No anomaly events detected.
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                        {anomalyEvents.map((event) => {
                            const userMsg = event.request_messages?.filter(m => m.role === 'user').pop();
                            return (
                                <div
                                    key={event.id}
                                    onClick={() => onInspect?.(event.id)}
                                    className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="min-w-[100px]">
                                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 block">
                                                {formatTime(event.timestamp)}
                                            </span>
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                                {formatDate(event.timestamp)}
                                            </span>
                                        </div>
                                        <AgentBadge agent={event.agent} meta={agentMeta} />
                                        <p className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">
                                            {userMsg?.content || 'No query'}
                                        </p>
                                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded-sm">
                                            rate_anomaly
                                        </span>
                                        <span className={`text-xs font-semibold ${
                                            event.risk_score >= 0.5 ? 'text-blue-200 dark:text-blue-200' : 'text-blue-400 dark:text-blue-400'
                                        }`}>
                                            {event.risk_score.toFixed(2)}
                                        </span>
                                        <ArrowRight
                                            size={14}
                                            className="text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
