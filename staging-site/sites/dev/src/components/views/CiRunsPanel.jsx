/**
 * Assessment Runs panel — shows reports from /api/sdk/runs, org-scoped to the
 * active Clerk tenant.
 *
 * Covers two flow shapes:
 *  - **CI runs** uploaded by `bastion run` / `bastion assessment` from a repo
 *    (have repo_url / branch / commit_sha populated).
 *  - **Thin-client runs** kicked off by `bastion run` against a target — the
 *    SDK is a pure HTTP client, the probe engine runs on Piston infra, and
 *    server-side updates the row through status transitions (queued →
 *    running → completed/failed). These rows have no repo metadata; the
 *    panel renders the target endpoint + status badge instead.
 *
 * Auth: fetches `/api/sdk/runs` with the user's Bastion bk_* Bearer
 * (minted via useVoiceToken from the Clerk session). Falls back to
 * `/api/sdk/runs-public` ONLY when no Bearer is available.
 */
import { useEffect, useState } from 'react';
import { GitBranch, GitCommit, Robot, Warning, ArrowSquareOut, CircleNotch, CheckCircle, XCircle, Globe, CaretDown, CaretRight, Terminal } from '@phosphor-icons/react';
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

function shortTarget(url) {
  if (!url) return '—';
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url.slice(0, 60);
  }
}

function StatusBadge({ status }) {
  if (!status) return null;
  const map = {
    queued: ['bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200', null],
    running: ['bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', CircleNotch],
    completed: ['bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', CheckCircle],
    failed: ['bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300', XCircle],
  };
  const [cls, Icon] = map[status] || ['bg-slate-100 text-slate-600', null];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
      {Icon && <Icon size={9} weight="bold" className={status === 'running' ? 'animate-spin' : ''} />}
      {status}
    </span>
  );
}

function RunDetail({ runId, bearer }) {
  const [report, setReport] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('findings');

  useEffect(() => {
    let cancelled = false;
    const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
    Promise.all([
      fetch(`${API_BASE}/api/sdk/runs/${runId}`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/api/sdk/runs/${runId}/transcript`, { headers }).then((r) => r.json()),
    ]).then(([rep, tr]) => {
      if (cancelled) return;
      setReport(rep);
      setTranscript(tr);
    }).catch((e) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [runId, bearer]);

  if (err) return <div className="px-4 py-3 text-[11px] text-rose-500">Failed to load detail: {err}</div>;
  if (!report) return <div className="px-4 py-3 text-[11px] text-slate-500">Loading detail…</div>;

  const probes = report.report?.probes || [];

  return (
    <div className="bg-slate-50 dark:bg-slate-800/40 border-l-2 border-blue-500">
      <div className="flex gap-3 px-4 pt-2 text-[10px] font-bold uppercase tracking-wider">
        <button
          onClick={() => setTab('findings')}
          className={`pb-1.5 ${tab === 'findings' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400'}`}
        >Findings ({probes.reduce((n, p) => n + (p.findings?.findings?.length || 0), 0)})</button>
        <button
          onClick={() => setTab('transcript')}
          className={`pb-1.5 flex items-center gap-1 ${tab === 'transcript' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400'}`}
        ><Terminal size={10} weight="bold" /> Transcript ({transcript?.chat?.length || 0})</button>
        <button
          onClick={() => setTab('raw')}
          className={`pb-1.5 ${tab === 'raw' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400'}`}
        >Raw JSON</button>
      </div>

      {tab === 'findings' && (
        <div className="px-4 py-3 space-y-3">
          {probes.length === 0 && <div className="text-[11px] text-slate-500">No probes recorded.</div>}
          {probes.map((p, i) => {
            const items = p.findings?.findings || [];
            return (
              <div key={i} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">{p.label || `${p.category}-${p.strategy}`}</span>
                  <span className="text-slate-400">exit {p.exit_code ?? 0}</span>
                  {p.findings?.status === 'no_findings' && (
                    <span className="text-slate-400 italic">no findings parsed</span>
                  )}
                </div>
                {items.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {items.map((f, j) => {
                      const sev = (f.severity || 'info').toLowerCase();
                      const sevCls = sev === 'critical'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                        : sev === 'high'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          : sev === 'medium'
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
                      return (
                        <div key={j} className="text-[11px] border-l-2 border-slate-300 dark:border-slate-700 pl-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase ${sevCls}`}>{sev}</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">{f.technique || f.category || '—'}</span>
                            {typeof f.confidence === 'number' && (
                              <span className="text-slate-400 text-[10px]">conf {f.confidence.toFixed(2)}</span>
                            )}
                          </div>
                          {f.evidence && (
                            <div className="mt-1 text-slate-600 dark:text-slate-300">
                              <div className="text-[9px] uppercase tracking-wider text-slate-400">evidence (target said):</div>
                              <pre className="whitespace-pre-wrap font-mono text-[10px] bg-slate-50 dark:bg-slate-800 p-1.5 mt-0.5">{String(f.evidence).slice(0, 1200)}</pre>
                            </div>
                          )}
                          {f.extracted_content && (
                            <div className="mt-1 text-slate-600 dark:text-slate-300">
                              <div className="text-[9px] uppercase tracking-wider text-slate-400">extracted:</div>
                              <pre className="whitespace-pre-wrap font-mono text-[10px] bg-slate-50 dark:bg-slate-800 p-1.5 mt-0.5">{String(f.extracted_content).slice(0, 1200)}</pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'transcript' && (
        <div className="px-4 py-3">
          {!transcript && <div className="text-[11px] text-slate-500">Loading transcript…</div>}
          {transcript?.note && (
            <div className="text-[11px] text-slate-500 italic mb-2">{transcript.note}</div>
          )}
          {transcript?.chat?.length > 0 && (
            <div className="space-y-2 max-h-[520px] overflow-auto">
              {transcript.chat.map((c, i) => {
                const isBastion = c.speaker === 'bastion';
                const bubbleCls = isBastion
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 ml-0 mr-8'
                  : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 ml-8 mr-0';
                const label = isBastion ? 'BASTION' : 'TARGET';
                return (
                  <div key={i} className={`border ${bubbleCls} p-2`}>
                    <div className="flex items-center gap-2 text-[9px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400">
                      <span>{label}</span>
                      {c.source && <span className="text-[8px] italic text-slate-400">({c.source})</span>}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{c.text}</div>
                  </div>
                );
              })}
            </div>
          )}
          {transcript && (transcript.chat?.length ?? 0) === 0 && (
            <div className="text-[11px] text-slate-500 italic">No probe exchanges captured yet for this run.</div>
          )}
        </div>
      )}

      {tab === 'raw' && (
        <div className="px-4 py-3">
          <pre className="font-mono text-[10px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-[480px] overflow-auto bg-slate-100 dark:bg-slate-800 p-2">{JSON.stringify(report, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default function CiRunsPanel({ title = 'Assessment Runs', subtitle = 'via bastion run / bastion assessment' } = {}) {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  // Bk_* minted from the active Clerk session; lets us hit the auth'd
  // `/api/sdk/runs` so the user only sees runs from their own org.
  const { apiKey: bearer, status: bearerStatus } = useVoiceToken();

  useEffect(() => {
    let cancelled = false;
    if (bearerStatus === 'idle' || bearerStatus === 'minting') return;

    const url = bearer
      ? `${API_BASE}/api/sdk/runs?limit=20`
      : `${API_BASE}/api/sdk/runs-public?limit=20`;
    const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};

    const load = () => fetch(url, { headers })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data) => { if (!cancelled) setRuns(Array.isArray(data?.runs) ? data.runs : []); })
      .catch((e) => { if (!cancelled) setError(e.message); });

    load();
    // Thin-client runs flip status queued → running → completed/failed
    // on the server side; poll so the panel reflects the lifecycle
    // without forcing a manual refresh while a probe is executing.
    const id = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [bearer, bearerStatus]);

  return (
    <section className="border border-slate-200 dark:border-slate-800 rounded-none bg-white dark:bg-slate-900">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <Robot size={16} weight="bold" className="text-blue-500" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">{title}</h2>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          {runs ? `${runs.length} most recent` : 'loading…'}
        </span>
        <span className="ml-auto text-[10px] font-mono text-slate-400 dark:text-slate-500">{subtitle}</span>
      </div>

      {error && (
        <div className="px-4 py-3 text-[11px] text-rose-500">Failed to load: {error}</div>
      )}

      {!runs && !error && (
        <div className="px-4 py-6 text-[11px] text-slate-500 dark:text-slate-400">Loading…</div>
      )}

      {runs && runs.length === 0 && !error && (
        <div className="px-4 py-6 text-[11px] text-slate-500 dark:text-slate-400">
          No assessment runs yet. Trigger one with{' '}
          <code className="font-mono px-1 py-0.5 bg-slate-100 dark:bg-slate-800">bastion run --scope SCOPE.md</code>{' '}
          (probes execute on Piston infra and stream into this panel).
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="grid grid-cols-[1fr_90px_110px_90px_100px_60px] gap-3 px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-800/40">
            <span>Target / scope</span>
            <span>Status</span>
            <span>Branch / commit</span>
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
            // Thin-client rows have no repo metadata but DO have a `target`
            // recorded on the report; pull from the report once it's hydrated.
            const target = r.target || r.report?.target;
            const hasRepo = !!r.repo_url;
            const status = r.status || (r.finding_count != null ? 'completed' : null);
            const showFindings = !status || status === 'completed';
            const isExpanded = expandedId === r.id;
            return (
              <div key={r.id}>
              <div
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                className="grid grid-cols-[1fr_90px_110px_90px_100px_60px] gap-3 px-4 py-2.5 items-center text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate font-mono text-slate-800 dark:text-slate-200" title={hasRepo ? r.repo_url : target || ''}>
                    {isExpanded
                      ? <CaretDown size={11} weight="bold" className="text-slate-400 shrink-0" />
                      : <CaretRight size={11} weight="bold" className="text-slate-400 shrink-0" />}
                    {hasRepo
                      ? <Robot size={11} weight="bold" className="text-slate-400 shrink-0" />
                      : <Globe size={11} weight="bold" className="text-slate-400 shrink-0" />}
                    <span className="truncate">{hasRepo ? shortRepo(r.repo_url) : shortTarget(target)}</span>
                  </div>
                  <div className="truncate text-slate-500 dark:text-slate-400 text-[10px]" title={r.scope_path || ''}>
                    {r.scope_path || (r.user_id ? `user ${r.user_id.slice(0, 16)}…` : '—')}
                  </div>
                </div>
                <div className="min-w-0">
                  <StatusBadge status={status} />
                </div>
                <div className="min-w-0 leading-tight">
                  {hasRepo ? (
                    <>
                      <div className="flex items-center gap-1 truncate text-slate-600 dark:text-slate-300">
                        <GitBranch size={10} weight="bold" className="text-slate-400 shrink-0" />
                        <span className="font-mono truncate">{r.branch || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1 truncate text-slate-500 dark:text-slate-400 text-[10px]">
                        <GitCommit size={10} weight="bold" className="text-slate-400 shrink-0" />
                        <span className="font-mono">{r.commit_sha ? r.commit_sha.slice(0, 7) : '—'}</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 text-[10px] italic">SDK direct</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {showFindings ? (
                    <>
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sevStyle}`}>
                        {r.finding_count ?? 0}
                      </span>
                      {r.critical_count > 0 && (
                        <span title={`${r.critical_count} critical`}>
                          <Warning size={11} weight="fill" className="text-rose-500" />
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400 text-[10px]">—</span>
                  )}
                </div>
                <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                  {relativeTime(r.created_at)}
                </span>
                <span className="text-slate-400">
                  <ArrowSquareOut size={12} weight="bold" className="opacity-40" />
                </span>
              </div>
              {isExpanded && <RunDetail runId={r.id} bearer={bearer} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
