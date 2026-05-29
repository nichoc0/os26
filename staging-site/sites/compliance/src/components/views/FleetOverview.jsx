import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Circle, Clock, CurrencyDollar, Warning, DownloadSimple, FileText, Check, X, ShieldWarning } from '@phosphor-icons/react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ExecutiveMetricsBar } from '../common/ExecutiveMetricsBar';
import { ScoreDecomposition } from '../common/ScoreDecomposition';
import { AgentBadge } from '../ui/AgentBadge';
import { useModeStore, resolveAppliedAction } from '../../store/modeStore';
import { useIsDev } from '../../store/audienceStore';
import { usePersona } from '../../store/personaStore';
import { useIsTenant } from '../../data/useIsTenant';
import { fleetReportFixture } from '../../data/fleetReportFixture';
import { useLiveRiskPulse } from '../../data/useLiveRiskPulse';

function riskColor(score) {
  if (score >= 0.7) return 'bg-blue-900';
  if (score >= 0.3) return 'bg-blue-600';
  return 'bg-blue-300';
}

function riskLabel(score) {
  if (score >= 0.7) return 'High';
  if (score >= 0.3) return 'Medium';
  return 'Low';
}

function ActionQueueBadge({ action, suppressed }) {
  const key = (action || 'pass').toLowerCase();
  const labels = { flag: 'Flagged', block: 'Blocked', redact: 'Redacted', pass: 'Passed' };
  return (
    <span
      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 ${
        suppressed
          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
      }`}
      title={suppressed ? 'Would have blocked in Enforcement mode' : undefined}
    >
      {labels[key] || action}
      {suppressed && <span className="ml-1">(monitoring)</span>}
    </span>
  );
}

function parseJson(str) {
  if (!str) return [];
  if (typeof str !== 'string') return Array.isArray(str) ? str : [];
  try { return JSON.parse(str); } catch { return []; }
}

export function FleetOverview({ data, setCurrentView, navigate, onInspect, reportData }) {
  const agents = data.agents || [];
  const timeline = data.timeline || [];
  const agentMeta = data.agentMeta || {};
  const mode = useModeStore((s) => s.mode);
  const isDev = useIsDev();
  const persona = usePersona();
  const isTenant = useIsTenant();

  // Navigation shim. Many CTAs on this page used to call
  // setCurrentView('risk' | 'telemetry' | 'agents' | 'policy') — those
  // view names don't exist at the App-level switch anymore, so the
  // calls silently no-op'd (Nicho 2026-05-27: "alot of hrefs in
  // overview/main dashboard are broken and dont point anywhere"). Map
  // each legacy name onto the real (view, tab) tuple the App switch
  // resolves. The "risk" target lands on the Posture Report's Risk tab
  // where the Risk widget lives.
  const LEGACY_VIEW_MAP = {
    risk:      ['reports', 'risk'],
    report:    ['reports', 'reports'],
    reports:   ['reports', 'reports'],
    telemetry: ['fleet',   'activity'],
    agents:    ['fleet',   'activity'],
    fleet:     ['fleet',   'activity'],
    policy:    ['config',  null],
    config:    ['config',  null],
    overview:  ['overview', null],
  };
  const goto = (view, tab) => {
    if (navigate) return navigate(view, tab);
    setCurrentView?.(view);
  };
  // Set or clear the ?agent=<id> URL param that AgentDirectoryWithDetail
  // reads on mount. "View All Agents" needs to CLEAR it so the user
  // lands on the directory grid instead of a stale focused agent;
  // agent-card clicks need to SET it so the operator drills straight
  // into that agent's focused view.
  const writeAgentUrl = (agentId) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (agentId) url.searchParams.set('agent', agentId);
    else url.searchParams.delete('agent');
    // Clear any stale subtab param the prior nested-nav set.
    url.searchParams.delete('subtab');
    window.history.replaceState({}, '', url.toString());
  };
  const gotoAllAgents = () => { writeAgentUrl(null); goto('fleet', 'activity'); };
  const gotoAgent = (agentId) => { writeAgentUrl(agentId); goto('fleet', 'activity'); };
  // Wrapper used as the `setCurrentView` prop for children that were
  // built against the old single-arg API (ScoreDecomposition,
  // ExecutiveMetricsBar). Translates the legacy name to the real
  // (view, tab) tuple before calling navigate.
  const setCurrentViewLegacy = (legacyView) => {
    const mapped = LEGACY_VIEW_MAP[legacyView];
    if (mapped) goto(mapped[0], mapped[1]);
    else goto(legacyView);
  };

  // Persona-themed fixture (same one the Agent Risk Assessment view
  // uses) + the shared live-pulse hook. The two surfaces share both,
  // so the Posture Report card and the Fleet Risk Assessment view
  // render identical gross / net / reduction numbers on every tick.
  const fleetReport = fleetReportFixture(persona.slug);
  const fleetPulse = useLiveRiskPulse(fleetReport);

  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());

  const handleDownloadReport = async () => {
    try {
      const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');
      const resp = await fetch(`${API_BASE}/api/policy/report-xlsx`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bastion-blue-report.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Report download failed:', e);
    }
  };

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const order = { sera_intake: 0, pharmacist_callback: 1, refill_router: 2, insurance_sync: 3, triage_classifier: 4, compliance_monitor: 5 };
      return (order[a.id] ?? 99) - (order[b.id] ?? 99);
    });
  }, [agents]);

  // Only tool-call related alerts (approve/deny makes sense for tool actions, not PII)
  const alertEvents = useMemo(() => {
    const events = data.events || [];
    return events
      .filter(e => {
        const action = (e.action || '').toLowerCase();
        if (action !== 'flag' && action !== 'block' && action !== 'redact') return false;
        if (dismissedAlerts.has(e.id)) return false;
        // Tool violations + confidence flags (actionable items, not PII)
        const dets = parseJson(e.detections);
        return dets.some(d => d.rail === 'tools' || d.rail === 'confidence' || d.rail === 'anomaly');
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 8);
  }, [data.events, dismissedAlerts]);

  const handleApprove = (id) => {
    setDismissedAlerts(prev => new Set([...prev, id]));
  };

  const handleReject = (id) => {
    setDismissedAlerts(prev => new Set([...prev, id]));
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-12">
      {/* Mode banner — passive observation is the baseline */}
      <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40 px-4 py-2.5 flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
        <Circle size={8} weight="fill" className="text-blue-500 shrink-0" />
        <span>
          <strong>Passive observation active.</strong> Telemetry sourced from your existing AI traffic — no probing required. Adversarial Assessment is available as an integration.
        </span>
      </div>

      {/* Executive Metrics */}
      <ExecutiveMetricsBar overview={data.overview} agents={agents} setCurrentView={setCurrentViewLegacy} />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Score Trend (hero) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">{isDev ? 'Posture Trend (14d)' : 'Risk Score Trend (14d)'}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{isDev ? 'Fleet posture improving since Bastion deployment' : 'Fleet risk decline since Bastion deployment'}</p>
            </div>
            {!isDev && (
              <button onClick={() => goto('reports', 'risk')} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer bg-transparent border-none">Risk widget &rarr;</button>
            )}
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="riskScoreGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: 0,
                    fontSize: 11,
                    color: '#1e293b',
                    padding: '8px 12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                  labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  formatter={(value) => [`${Number(value).toFixed(1)}`, isDev ? 'Posture Score' : 'Fleet Risk Score']}
                />
                <Area type="monotone" dataKey="risk_score" stroke="#2563eb" strokeWidth={2} fill="url(#riskScoreGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Events */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Risk Events (14d)</h3>
            <button onClick={() => goto('reports', 'risk')} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer bg-transparent border-none">Risk widget &rarr;</button>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeline} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                <Tooltip
                  cursor={{ fill: 'rgba(37,99,235,0.08)' }}
                  contentStyle={{
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: 0,
                    fontSize: 11,
                    color: '#1e293b',
                    padding: '8px 12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                  labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  formatter={(value) => [`${value} events`, 'Risk Events']}
                />
                <Bar dataKey="risk_events" fill="#2563eb" fillOpacity={0.6} radius={[3, 3, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Score decomposition — sits below the trend charts. The charts are
          the at-a-glance posture; the breakdown explains what's driving it. */}
      <ScoreDecomposition
        reportData={reportData}
        setCurrentView={setCurrentViewLegacy}
        persona={persona}
        title="Risk Score — Component Breakdown"
        subtitle="What's driving your fleet posture right now. Click any row to inspect the underlying events."
      />

      {/* Action Required — Alert Queue */}
      {alertEvents.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldWarning size={16} weight="bold" className="text-slate-600 dark:text-slate-400" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Action Required</h3>
              <span className="text-[10px] font-mono text-slate-500">{alertEvents.length} pending</span>
            </div>
            <button onClick={() => goto('fleet', 'activity')} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer bg-transparent border-none">View All Events &rarr;</button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {alertEvents.map((event) => {
              const detections = parseJson(event.detections);
              const detailText = detections.length > 0 ? detections[0].detail : '';
              return (
                <div key={event.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <span className="text-[10px] font-mono text-slate-400 w-10">#{event.id}</span>
                  <span className="text-[10px] font-mono text-slate-500 w-28 shrink-0">
                    {event.timestamp ? new Date(event.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  <AgentBadge agent={event.agent} agentMeta={agentMeta} />
                  {(() => {
                    const intended = (event.action || '').toLowerCase();
                    const applied = resolveAppliedAction(intended, mode);
                    const suppressed = mode === 'shadow' && (intended === 'block' || intended === 'redact');
                    return <ActionQueueBadge action={applied} suppressed={suppressed} />;
                  })()}
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 flex-1 truncate">
                    {detailText || event.query_preview || ''}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onInspect(event.id)}
                      className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer bg-transparent border border-slate-200 dark:border-slate-700"
                    >
                      Inspect
                    </button>
                    <button
                      onClick={() => handleApprove(event.id)}
                      className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer bg-transparent border border-slate-200 dark:border-slate-700"
                      title="Approve — Mark as safe"
                    >
                      <Check size={12} weight="bold" />
                    </button>
                    <button
                      onClick={() => handleReject(event.id)}
                      className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer bg-transparent border border-slate-200 dark:border-slate-700"
                      title="Reject — Confirm block"
                    >
                      <X size={12} weight="bold" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section: Agent Fleet */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Agent Fleet</h2>
          <button onClick={gotoAllAgents} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer bg-transparent border-none">View All Agents &rarr;</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {sortedAgents.map((agent) => {
            const meta = agentMeta[agent.id] || {};
            const dotColor = meta.color || '#94a3b8';
            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                onClick={() => gotoAgent(agent.id)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
              >
                {/* Header: name + status */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                      {meta.label || agent.id}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-none border ${
                      agent.status === 'online'
                        ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-transparent'
                        : 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-transparent'
                    }`}
                  >
                    {agent.status}
                  </span>
                </div>

                {/* Stats */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Requests</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{agent.total_requests.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <CurrencyDollar size={12} weight="bold" />
                      Cost
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">${agent.total_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Warning size={12} weight="bold" />
                      Risk
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${riskColor(agent.risk_score)}`} />
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {riskLabel(agent.risk_score)} ({agent.risk_score.toFixed(2)})
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Posture Report Preview — pharmacy audience (Maple Ridge). The
          gross / net / reduction numbers are driven by the same
          fleetReportFixture + useLiveRiskPulse hook the Agent Risk
          Assessment view uses, so they tick in lock-step. Buttons route
          to the Posture Report (not the legacy underwriting xlsx). */}
      {/* Risk Pulse card driven by fleetReportFixture — curated demo
          numbers. Hidden for authenticated tenants per the no-seed-data-
          for-real-orgs rule; they'll see live data once the backend
          ships a per-org risk feed. */}
      {!isDev && !isTenant && fleetReport?.risk_assessment && (() => {
        const { grossRisk, netRisk, reductionPct } = fleetPulse;
        const classification = fleetReport.risk_assessment.risk_classification;
        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Posture Report</h3>
              {/* One CTA. The previous pair ("Risk Details" + "Full Report")
                  both landed on the same Reports view (Yousuf 2026-05-27);
                  collapsed per the lean-buttons rule. */}
              <button onClick={() => goto('reports', 'reports')} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer bg-transparent border-none">Open posture report &rarr;</button>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <FileText size={16} className="text-blue-500" />
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Gross Risk <span className="font-bold text-slate-800 dark:text-slate-200 ml-1 tabular-nums">{grossRisk.toFixed(1)}</span>
                </div>
                <span className="text-blue-500 font-bold">&rarr;</span>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Net Risk <span className="font-bold text-blue-600 dark:text-blue-400 ml-1 tabular-nums">{netRisk.toFixed(1)}</span>
                </div>
                <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">({reductionPct.toFixed(0)}% reduction)</span>
              </div>
              {classification && (
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                  {classification}
                </span>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}

