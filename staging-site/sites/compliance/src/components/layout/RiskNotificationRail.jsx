// Risk Notification Rail — Windows-style toast stack pinned to the right
// edge. Reviewer feedback: "high risk ones should pop up as window with a
// list on the right side of the screen, similar to Windows notifications,
// with a button to bring them to the rest of the notifications. Event
// details should also let people connect to other apps (Slack/email) with
// a 'Don't remind me again' option, and a persistent button on the page
// for the same."
//
// Behaviour:
//   - Collapsed pill in the bottom-right showing total open high-risk count.
//   - Click → expands to a stacked toast list of the most recent high-risk
//     events (block / redact / PII / risk score > 0.5).
//   - Each toast: timestamp, agent, action chip, query snippet, "Inspect"
//     deep-link that pivots to Live Activity with that event selected.
//   - "View all risks" footer → Live Activity filtered to High.
//   - "Connect email" button + first-time nag toast that respects
//     localStorage (`bastion:integrationNagDismissed=1`).
import { useMemo, useState } from 'react';
import { Bell, X, ArrowRight } from '@phosphor-icons/react';
import { useModeStore } from '../../store/modeStore';

function isHighRisk(event) {
  const action = (event.action || '').toLowerCase();
  if (action === 'block' || action === 'redact') return true;
  if (event.blocked_tools?.length > 0) return true;
  if ((event.risk_score || 0) >= 0.5) return true;
  if (event.flags?.includes('pii_exposure')) return true;
  return false;
}

function formatRelative(iso) {
  const d = new Date(iso).getTime();
  if (!d) return '';
  const diff = Math.max(0, Date.now() - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getQueryPreview(event) {
  const msgs = event.request_messages || [];
  const userMsg = msgs.filter((m) => m.role === 'user').pop();
  return userMsg?.content || event.query_preview || event.content || '';
}

function ActionChip({ action, mode }) {
  const map = {
    block:  { label: 'Blocked',  cls: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900' },
    redact: { label: 'Redacted', cls: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900' },
    flag:   { label: 'Flagged',  cls: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900' },
  };
  // In monitoring (shadow) mode the agent never actually blocks or
  // redacts — Bastion only observes and flags. Showing "BLOCKED" there
  // is misleading (the call still went through). Collapse block/redact
  // to "Flagged" in monitoring mode, matching LiveTelemetry.getOutcome.
  let key = (action || '').toLowerCase();
  if (mode === 'shadow' && (key === 'block' || key === 'redact')) key = 'flag';
  const m = map[key] || { label: action || 'High risk', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
  return <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${m.cls}`}>{m.label}</span>;
}

export function RiskNotificationRail({ data, navigate, currentView }) {
  const events = data?.events || [];
  const agentMeta = data?.agentMeta || {};
  const mode = useModeStore((s) => s.mode);
  const [open, setOpen] = useState(false);

  const highRisk = useMemo(() => {
    return events
      .filter(isHighRisk)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [events]);

  const goToEvent = (eventId) => {
    setOpen(false);
    if (navigate) navigate('telemetry', eventId);
  };

  const goToAllRisks = () => {
    setOpen(false);
    if (navigate) navigate('telemetry', null);
  };

  // Don't show the trigger pill on the Live Activity view itself — it's the
  // same data and the floating UI would compete with the inspector. Also
  // hide on the Reports/Posture views (the report is the artifact a
  // recipient may see) and on any `?share=` URL so the external-evidence
  // view stays clean. Pathname check covers the route-naming drift between
  // currentView state and the actual URL segment.
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const isShareUrl = search.includes('share=');
  const isReportsPath = /\/reports(?:\/|$)/.test(path);
  const isPostureView = currentView === 'posture-report' || currentView === 'reports' || currentView === 'history' || currentView === 'risk';
  const hidePill = currentView === 'telemetry' || isPostureView || isReportsPath || isShareUrl;

  if (hidePill) return null;
  if (highRisk.length === 0 && !open) return null;

  return (
    <>
      {/* Trigger pill — bottom-right corner */}
      {!open && !hidePill && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 shadow-lg hover:shadow-xl transition-shadow cursor-pointer rounded-none"
          title="High-risk events"
        >
          <span className="relative">
            <Bell size={16} weight="duotone" className="text-rose-500" />
            {highRisk.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {highRisk.length > 99 ? '99+' : highRisk.length}
              </span>
            )}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">
            {highRisk.length} risk{highRisk.length === 1 ? '' : 's'}
          </span>
        </button>
      )}

      {/* Expanded notification panel — pinned to the right edge */}
      {open && (
        <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[380px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
          <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Bell size={16} weight="duotone" className="text-rose-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">High-risk events</h3>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500">{highRisk.length}</span>
            <button
              onClick={() => setOpen(false)}
              className="ml-auto p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-transparent border-none cursor-pointer"
              aria-label="Close"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          {/* Toast list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {highRisk.length === 0 ? (
              <div className="text-center py-12 text-sm text-slate-500 dark:text-slate-500">
                No high-risk events right now. ✓
              </div>
            ) : highRisk.slice(0, 30).map((event) => {
              const agent = agentMeta[event.agent] || { color: '#94a3b8', label: event.agent };
              return (
                <button
                  key={event.id}
                  onClick={() => goToEvent(event.id)}
                  className="w-full text-left p-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-800 hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer group rounded-none"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500">
                      {formatRelative(event.timestamp)}
                    </span>
                    <span
                      className="text-[10px] font-bold rounded-sm text-white px-1.5 py-0.5"
                      style={{ backgroundColor: agent.color }}
                    >
                      {agent.label}
                    </span>
                    <ActionChip action={event.action} mode={mode} />
                  </div>
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug line-clamp-2">
                    {getQueryPreview(event) || '(no query preview)'}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Inspect <ArrowRight size={10} weight="bold" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer — view all in Live Activity. (Slack/email paging
              removed — no working integration yet; the page was a stub.) */}
          <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 p-3">
            <button
              onClick={goToAllRisks}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer border-none rounded-none"
            >
              View all in Live Activity
              <ArrowRight size={12} weight="bold" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
