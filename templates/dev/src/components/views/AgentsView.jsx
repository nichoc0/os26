import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, CurrencyDollar, Lightning, ShieldWarning, Eye } from '@phosphor-icons/react';
import { AgentBadge } from '../ui/AgentBadge';

function formatRelativeTime(isoString) {
  if (!isoString) return 'never';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function riskColor(score) {
  if (score >= 0.7) return 'bg-blue-900';
  if (score >= 0.3) return 'bg-blue-600';
  return 'bg-blue-300';
}

function riskLabel(score) {
  if (score >= 0.7) return 'High Risk';
  if (score >= 0.3) return 'Medium Risk';
  return 'Low Risk';
}

function riskTextColor(score) {
  if (score >= 0.7) return 'text-blue-200 dark:text-blue-200';
  if (score >= 0.3) return 'text-blue-400 dark:text-blue-400';
  return 'text-blue-500 dark:text-blue-500';
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-6 animate-pulse">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="h-5 w-14 bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-12 bg-slate-200 dark:bg-slate-700" />
            <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-8 bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent, meta, events, onInspect }) {
  const dotColor = meta?.color || '#94a3b8';

  const agentEvents = useMemo(() => {
    return events
      .filter((e) => e.agent === agent.id)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5);
  }, [events, agent.id]);

  const piiCount = useMemo(() => {
    return events
      .filter((e) => e.agent === agent.id)
      .reduce((sum, e) => sum + (e.pii_detections || []).length, 0);
  }, [events, agent.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
            {meta?.label || agent.id}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {agent.model || ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Clock size={11} />
            {formatRelativeTime(agent.last_seen)}
          </span>
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
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">Requests</span>
          <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
            {(agent.total_requests || 0).toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-0.5">
            <CurrencyDollar size={10} weight="bold" />
            Cost
          </span>
          <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
            ${(agent.total_cost || 0).toFixed(2)}
          </span>
        </div>
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-0.5">
            <Lightning size={10} weight="bold" />
            Avg Latency
          </span>
          <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
            {agent.avg_latency_ms ? `${(agent.avg_latency_ms / 1000).toFixed(1)}s` : '--'}
          </span>
        </div>
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-0.5">
            <ShieldWarning size={10} weight="bold" />
            PII
          </span>
          <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
            {piiCount}
          </span>
        </div>
      </div>

      {/* Risk indicator */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Risk</span>
          <span className={`text-[10px] font-bold ${riskTextColor(agent.risk_score || 0)}`}>
            {riskLabel(agent.risk_score || 0)}
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full transition-all ${riskColor(agent.risk_score || 0)}`}
            style={{ width: `${(agent.risk_score || 0) * 100}%` }}
          />
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-2">Recent Activity</span>
        {agentEvents.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">No recent events</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {agentEvents.map((event) => {
              const preview = (event.query_preview || event.content)
                ? (event.query_preview || event.content).length > 80
                  ? (event.query_preview || event.content).slice(0, 80) + '...'
                  : (event.query_preview || event.content)
                : '(no user message)';

              return (
                <button
                  key={event.id}
                  onClick={() => onInspect(event.id)}
                  className="w-full flex items-center gap-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer bg-transparent border-none px-0"
                >
                  <span className="text-[10px] font-mono text-slate-400 shrink-0 w-16">
                    {formatRelativeTime(event.timestamp)}
                  </span>
                  <span className="text-[11px] text-slate-700 dark:text-slate-300 truncate flex-1">
                    {preview}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">
                    ${(event.cost_usd || 0).toFixed(4)}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">
                    {event.latency_ms ? `${(event.latency_ms / 1000).toFixed(1)}s` : '--'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function AgentsView({ data, loading, onInspect }) {
  const agents = data?.agents || [];
  const agentMeta = data?.agentMeta || {};
  const events = data?.events || [];

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const order = { sera_intake: 0, pharmacist_callback: 1, refill_router: 2, insurance_sync: 3, triage_classifier: 4, compliance_monitor: 5 };
      return (order[a.id] ?? 99) - (order[b.id] ?? 99);
    });
  }, [agents]);

  if (loading) {
    return (
      <div className="w-full max-w-[1600px] mx-auto pb-12">
        <div className="flex items-center gap-3 mb-6">
          <Eye size={24} weight="bold" className="text-slate-400" />
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Agents</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading agent data...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (sortedAgents.length === 0) {
    return (
      <div className="w-full max-w-[1600px] mx-auto pb-12">
        <div className="flex items-center gap-3 mb-6">
          <Eye size={24} weight="bold" className="text-slate-400" />
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Agents</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Detailed agent inspection</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-12 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">No agents detected.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto pb-12">
      <div className="flex items-center gap-3 mb-6">
        <Eye size={24} weight="bold" className="text-slate-400" />
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Agents</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Detailed view of all monitored agents</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {sortedAgents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            meta={agentMeta[agent.id]}
            events={events}
            onInspect={onInspect}
          />
        ))}
      </div>
    </div>
  );
}
