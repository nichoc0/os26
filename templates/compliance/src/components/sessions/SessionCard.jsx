// One row in the Sessions feed. Mirrors archive/TargetCard layout (left icon +
// metadata, right stats grid, monochrome slate/blue).

import { ChatsTeardrop, ArrowRight } from '@phosphor-icons/react';

const AGENT_LABELS = {
  sera_intake:         'Sera (Intake)',
  pharmacist_callback: 'Pharmacist Callback',
  refill_router:       'Refill Router',
  insurance_sync:      'Insurance Sync',
  triage_classifier:   'Triage Classifier',
  compliance_monitor:  'Compliance Monitor',
};

function fmtTime(iso) {
  if (!iso) return '—';
  // Accept both "2026-04-22 19:25:25" and "2026-04-22T19:20:00+00:00"
  const s = iso.replace(' ', 'T').replace(/\+00:00$/, 'Z');
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { hour12: false });
}

function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return '—';
  const s = new Date(startIso.replace(' ', 'T').replace(/\+00:00$/, 'Z'));
  const e = new Date(endIso.replace(' ', 'T').replace(/\+00:00$/, 'Z'));
  const ms = e - s;
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function SessionCard({ session, onSelect }) {
  return (
    <button
      onClick={() => onSelect(session.id)}
      className="w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none shadow-sm hover:border-blue-400 dark:hover:border-blue-600 transition-colors cursor-pointer group"
    >
      <div className="p-6 md:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5 min-w-0">
          <div className="flex shrink-0 items-center justify-center h-14 w-14 rounded-none bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
            <ChatsTeardrop size={22} weight="bold" className="text-blue-500 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono truncate">
                {session.session_id}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                {AGENT_LABELS[session.agent] || session.agent || 'Agent'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono truncate">
              {session.call_sid}
              {session.caller_phone ? ` · ${session.caller_phone}` : ''}
            </p>
            {session.summary ? (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 line-clamp-1">
                {session.summary}
              </p>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-600 mt-2 italic">no summary</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <ArrowRight
            size={18}
            weight="bold"
            className="text-slate-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
        <Stat label="Turns" value={session.turn_count ?? 0} />
        <Stat label="Duration" value={fmtDuration(session.started_at, session.ended_at)} mono />
        <Stat label="Ingested" value={fmtTime(session.ingested_at)} mono small />
        <Stat label="Started" value={fmtTime(session.started_at)} mono small />
      </div>
    </button>
  );
}

function Stat({ label, value, mono, small }) {
  return (
    <div className="text-center py-4 px-3">
      <div className={`font-mono ${small ? 'text-[11px]' : 'text-xl'} ${mono ? '' : ''} font-bold text-slate-900 dark:text-slate-100`}>
        {value}
      </div>
      <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">
        {label}
      </div>
    </div>
  );
}
