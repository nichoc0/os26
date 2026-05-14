import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal } from '@phosphor-icons/react';

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatCost(usd) {
  return `$${usd.toFixed(3)}`;
}

function formatLatency(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortModel(model) {
  if (!model) return '—';
  // "anthropic/claude-sonnet-4" -> "claude-sonnet-4"
  const parts = model.split('/');
  return parts[parts.length - 1];
}

function deriveStatus(event) {
  if (event.blocked_tools && event.blocked_tools.length > 0) return 'BLOCK';
  if (event.pii_detections && event.pii_detections.length > 0) return 'WARN';
  if (event.flags && event.flags.includes('rate_anomaly')) return 'WARN';
  return 'OK';
}

function statusStyle(status) {
  switch (status) {
    case 'OK':
      return 'bg-blue-50 dark:bg-blue-500/20 text-blue-500 dark:text-blue-300 border-blue-200 dark:border-transparent';
    case 'WARN':
      return 'bg-blue-100 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-transparent';
    case 'BLOCK':
      return 'bg-slate-200 dark:bg-blue-900/30 text-blue-200 dark:text-blue-200 border-blue-800 dark:border-transparent';
    default:
      return 'bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-transparent';
  }
}

function deriveFlags(event) {
  const parts = [];
  if (event.response_tool_calls && event.response_tool_calls.length > 0) {
    const toolName = event.response_tool_calls[0].name;
    parts.push(`TOOL:${toolName}`);
  }
  if (event.pii_detections && event.pii_detections.length > 0) {
    const types = [...new Set(event.pii_detections.map(p => p.type))];
    parts.push(`PII:${types.join(',')}`);
  }
  if (event.blocked_tools && event.blocked_tools.length > 0) {
    parts.push(`BLOCKED:${event.blocked_tools.join(',')}`);
  }
  if (event.flags && event.flags.includes('rate_anomaly')) {
    parts.push('RATE_ANOMALY');
  }
  return parts.join(' | ') || '—';
}

export function EventLog({ data, onInspect }) {
  const events = data.events || [];
  const agentMeta = data.agentMeta || {};

  const displayEvents = useMemo(() => {
    return events.slice(0, 50);
  }, [events]);

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-12">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          Event Log
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Real-time telemetry feed across all monitored agents.
        </p>
      </div>

      <div className="bg-white dark:bg-[#0a0f1c] border border-slate-200 dark:border-slate-800 rounded-none shadow-sm dark:shadow-2xl p-4 sm:p-6 font-mono relative overflow-hidden flex flex-col transition-colors"
           style={{ minHeight: 600 }}>
        {/* Scanline background */}
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.05) 1px, transparent 1px)', backgroundSize: '100% 36px' }} />

        {/* Terminal header */}
        <div className="flex items-center gap-4 mb-6 pb-3 border-b border-slate-200 dark:border-white/10 z-10 relative text-blue-600 dark:text-blue-500 text-xs">
          <Terminal size={14} />
          <span>AGENT_TELEMETRY_STREAM</span>
          <span className="ml-auto opacity-50 text-slate-500 dark:text-slate-400">
            {displayEvents.length} events // LIVE
          </span>
        </div>

        {/* Grid header */}
        <div className="hidden sm:grid grid-cols-[80px_70px_130px_60px_60px_50px_1fr_60px] gap-3 text-[10px] text-slate-500 dark:text-white/30 uppercase tracking-widest mb-3 px-4 font-sans font-bold z-10 relative">
          <div>Time</div>
          <div>Agent</div>
          <div>Model</div>
          <div>Tokens</div>
          <div>Cost</div>
          <div>Latency</div>
          <div>Flags</div>
          <div>Status</div>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto relative z-10">
          <div className="flex flex-col gap-0">
            <AnimatePresence mode="popLayout">
              {displayEvents.map((event) => {
                const status = deriveStatus(event);
                const agentColor = agentMeta[event.agent]?.color || '#94a3b8';
                const agentLabel = agentMeta[event.agent]?.label || event.agent;
                const totalTokens = (event.tokens_input || 0) + (event.tokens_output || 0);
                const flags = deriveFlags(event);

                return (
                  <motion.div
                    key={event.id}
                    layout
                    initial={{ opacity: 0, y: -16, scale: 0.98, backgroundColor: 'rgba(16, 185, 129, 0.08)' }}
                    animate={{ opacity: 1, y: 0, scale: 1, backgroundColor: 'transparent' }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    onClick={() => onInspect?.(event.id)}
                    className="grid grid-cols-1 sm:grid-cols-[80px_70px_130px_60px_60px_50px_1fr_60px] gap-1 sm:gap-3 text-xs px-4 py-2.5 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors items-center cursor-pointer"
                  >
                    {/* Time */}
                    <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatTime(event.timestamp)}
                    </div>

                    {/* Agent */}
                    <div className="font-bold" style={{ color: agentColor }}>
                      {agentLabel.toLowerCase()}
                    </div>

                    {/* Model */}
                    <div className="text-slate-600 dark:text-slate-400 truncate">
                      {shortModel(event.model)}
                    </div>

                    {/* Tokens */}
                    <div className="text-slate-600 dark:text-slate-300 tabular-nums">
                      {formatTokens(totalTokens)}
                    </div>

                    {/* Cost */}
                    <div className="text-slate-600 dark:text-slate-300 tabular-nums">
                      {formatCost(event.cost_usd)}
                    </div>

                    {/* Latency */}
                    <div className="text-slate-600 dark:text-slate-300 tabular-nums">
                      {formatLatency(event.latency_ms)}
                    </div>

                    {/* Flags */}
                    <div className="text-slate-500 dark:text-slate-500 truncate text-[11px]">
                      {flags}
                    </div>

                    {/* Status */}
                    <div>
                      <span className={`px-2 py-0.5 rounded-none text-[9px] font-bold border ${statusStyle(status)}`}>
                        {status}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
