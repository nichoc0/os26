// Sessions feed — lists recent voice-agent sessions ingested via
// POST /api/ingest/session. Click a row to drill into the transcript.

import { useEffect } from 'react';
import { Lock, ArrowsClockwise } from '@phosphor-icons/react';
import { useSessionStore } from '../../store/sessionStore';
import { useIsTenant } from '../../data/useIsTenant';
import SessionCard from './SessionCard';
import SessionDetail from './SessionDetail';

export default function SessionsView() {
  const isTenant = useIsTenant();
  const sessions = useSessionStore((s) => s.sessions);
  const loading = useSessionStore((s) => s.sessionsLoading);
  const error = useSessionStore((s) => s.sessionsError);
  const lastFetched = useSessionStore((s) => s.sessionsLastFetched);
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId);
  const selectSession = useSessionStore((s) => s.selectSession);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);

  // Tenant gate: skip the static fixture fetch entirely. /api/sessions
  // is vercel-rewritten to a bundled JSON of demo sessions (Maple Ridge
  // patient calls), which would otherwise leak into every signed-in
  // tenant's Vault.
  useEffect(() => {
    if (isTenant) return; // empty state below
    fetchSessions();
    const id = setInterval(fetchSessions, 4000);
    return () => clearInterval(id);
  }, [fetchSessions, isTenant]);

  if (selectedSessionId !== null) {
    return <SessionDetail />;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-6">
        <header className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
              <Lock size={24} weight="bold" className="text-blue-500 dark:text-blue-400" />
              Vault
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
              Immutable, append-only log of every API call your agents made — request, response, tool decision, policy outcome. Each record is signed at ingest, hashed into a chain, and pinned inside your tenant boundary, so it stands as carrier-grade evidence if a claim is filed. This is where you go to <strong className="text-slate-700 dark:text-slate-300">see the data as it actually was</strong> and prove its integrity hasn't been touched.
            </p>
          </div>
          <button
            onClick={() => fetchSessions()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors rounded-none cursor-pointer"
          >
            <ArrowsClockwise size={14} weight="bold" className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </header>

        {error && import.meta.env.VITE_APP_MODE !== 'production' && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-none p-4 text-sm text-red-700 dark:text-red-300">
            Failed to load sessions: {error}
          </div>
        )}

        {sessions.length === 0 && !loading && !error ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-12 text-center">
            <Lock size={32} weight="bold" className="text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No sessions yet.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Fire a session from the voice pipeline — it will appear here within 4 seconds.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} onSelect={selectSession} />
            ))}
          </div>
        )}

        {lastFetched > 0 && (
          <p className="text-[10px] font-mono text-slate-400 dark:text-slate-600 text-right uppercase tracking-widest">
            Last refresh: {new Date(lastFetched).toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}
