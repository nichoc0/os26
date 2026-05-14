/**
 * CI Runs panel — shows assessment reports uploaded by `bastion run` /
 * `bastion assessment` (locally or in CI), org-scoped to the active
 * Clerk tenant.
 *
 * Auth: fetches `/api/sdk/runs` with the user's Bastion bk_* Bearer
 * (minted via useVoiceToken from the Clerk session). The backend route
 * filters by `api_keys.org_id`, so different orgs see only their own
 * CI runs. Falls back to `/api/sdk/runs-public` ONLY when no Bearer is
 * available (anonymous demo browsing, never for an authenticated
 * tenant).
 */
import { useEffect, useState } from 'react';
import { GitBranch, GitCommit, Robot, Warning, ArrowSquareOut } from '@phosphor-icons/react';
import { useVoiceToken } from '../../data/useVoiceToken';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');

function relativeTime(epochSeconds) {
  if (!epochSeconds) return '—';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function shortRepo(url) {
  if (!url) return '(no repo)';
  return url.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '');
}

export default function CiRunsPanel() {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);
  // Bk_* minted from the active Clerk session; lets us hit the auth'd
  // `/api/sdk/runs` so the user only sees runs from their own org.
  const { apiKey: bearer, status: bearerStatus } = useVoiceToken();

  useEffect(() => {
    let cancelled = false;
    // Wait for the bearer mint to settle before deciding which endpoint
    // to hit. `status === 'minting'` returns early so we don't fire two
    // requests (one anonymous, one authed) on first render.
    if (bearerStatus === 'idle' || bearerStatus === 'minting') return;
    const url = bearer
      ? `${API_BASE}/api/sdk/runs?limit=20`
      : `${API_BASE}/api/sdk/runs-public?limit=20`;
    const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
    fetch(url, { headers })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data) => { if (!cancelled) setRuns(Array.isArray(data?.runs) ? data.runs : []); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [bearer, bearerStatus]);

  // Hide the panel entirely when nothing has been ingested yet — keeps the
  // dashboard clean for first-time viewers.
  if (runs && runs.length === 0 && !error) return null;

  return (
    <section className="border border-slate-200 dark:border-slate-800 rounded-none bg-white dark:bg-slate-900">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <Robot size={16} weight="bold" className="text-blue-500" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">CI Runs</h2>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          {runs ? `${runs.length} most recent` : 'loading…'}
        </span>
        <span className="ml-auto text-[10px] font-mono text-slate-400 dark:text-slate-500">via bastion assessment</span>
      </div>

      {error && import.meta.env.VITE_APP_MODE !== 'production' && (
        <div className="px-4 py-3 text-[11px] text-rose-500">Failed to load: {error}</div>
      )}
      {error && import.meta.env.VITE_APP_MODE === 'production' && (
        <div className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">No CI runs yet. Trigger <code className="font-mono">bastion assessment</code> from your CI to populate this panel.</div>
      )}

      {!runs && !error && (
        <div className="px-4 py-6 text-[11px] text-slate-500 dark:text-slate-400">Loading…</div>
      )}

      {runs && runs.length > 0 && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="grid grid-cols-[1fr_120px_120px_90px_100px_60px] gap-3 px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-800/40">
            <span>Repo / scope</span>
            <span>Branch</span>
            <span>Commit</span>
            <span>Findings</span>
            <span>When</span>
            <span></span>
          </div>
          {runs.map((r) => {
            const sev = r.critical_count > 0 ? 'critical' : r.high_count > 0 ? 'high' : 'ok';
            const sevStyle = sev === 'critical'
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
              : sev === 'high'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
            return (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_120px_120px_90px_100px_60px] gap-3 px-4 py-2.5 items-center text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800/30"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-slate-800 dark:text-slate-200" title={r.repo_url || ''}>
                    {shortRepo(r.repo_url)}
                  </div>
                  <div className="truncate text-slate-500 dark:text-slate-400 text-[10px]" title={r.scope_path || ''}>
                    {r.scope_path || '—'}
                  </div>
                </div>
                <div className="flex items-center gap-1 truncate text-slate-600 dark:text-slate-300">
                  <GitBranch size={11} weight="bold" className="text-slate-400 shrink-0" />
                  <span className="font-mono truncate">{r.branch || '—'}</span>
                </div>
                <div className="flex items-center gap-1 truncate text-slate-600 dark:text-slate-300">
                  <GitCommit size={11} weight="bold" className="text-slate-400 shrink-0" />
                  <span className="font-mono">{r.commit_sha ? r.commit_sha.slice(0, 7) : '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sevStyle}`}>
                    {r.finding_count ?? 0}
                  </span>
                  {r.critical_count > 0 && (
                    <span title={`${r.critical_count} critical`}>
                      <Warning size={11} weight="fill" className="text-rose-500" />
                    </span>
                  )}
                </div>
                <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                  {relativeTime(r.created_at)}
                </span>
                <span className="text-slate-400">
                  <ArrowSquareOut size={12} weight="bold" className="opacity-40" />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
