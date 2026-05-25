/**
 * Voice Runs — org-scoped list of historical (and in-flight) voice probes.
 *
 * Reads `/api/sdk/voice-runs?limit=50` with the bk_* bearer minted by
 * useVoiceToken (same hook the wizard uses). Backend route validates the
 * key + filters by `api_keys.org_id`, so different orgs see only their
 * own runs.
 *
 * For rows whose `call_control_id` is currently in the gateway's
 * `/v1/calls/active` list, render a "LIVE" pill + a Listen button that
 * opens the listen widget in a new tab. This is naturally org-safe: a
 * row exists in *this* user's voice_runs table only if it was attributed
 * to their org at upload time. Other tenants' active calls aren't
 * enumerated here.
 */
import { useEffect, useState } from 'react';
import { Microphone, Lightning, ArrowSquareOut, CheckCircle, XCircle, Warning, CircleNotch } from '@phosphor-icons/react';
import { useVoiceToken } from '../../data/useVoiceToken';
import { usePersona } from '../../store/personaStore';
import { getDemoVoiceRuns } from '../../data/demoVoiceRuns';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');

const GATEWAY = (import.meta.env.VITE_VOICE_GATEWAY_URL || 'https://voice-demo.pistonsolutions.ai').replace(/\/+$/, '');
const LISTEN_GATEWAY = (import.meta.env.VITE_LISTEN_GATEWAY_URL || GATEWAY).replace(/\/+$/, '');

function relativeTime(epochSeconds) {
  if (!epochSeconds) return '—';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function shortCallId(id) {
  if (!id) return '—';
  // ava-<uuid>-attacker → "ava-<first 8 of uuid>"; v3:Wgp… → "v3:Wgp…"
  const ava = id.match(/^ava-([0-9a-f]{8})/);
  if (ava) return `ava-${ava[1]}`;
  return id.length > 18 ? `${id.slice(0, 18)}…` : id;
}

function VerdictPill({ verdict }) {
  if (!verdict) return <span className="text-slate-400 text-[10px]">—</span>;
  const v = verdict.verdict || 'inconclusive';
  if (v === 'violation') {
    const sev = verdict.severity || 'medium';
    const tone = sev === 'critical' || sev === 'high'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    return (
      <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${tone}`}>
        Violation · {sev}
      </span>
    );
  }
  if (v === 'pass') {
    return (
      <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
        Pass
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {v}
    </span>
  );
}

export default function VoiceRunsPanel() {
  const { apiKey: bearer, status: bearerStatus, orgId } = useVoiceToken();
  const persona = usePersona();
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);
  const [activeIds, setActiveIds] = useState(new Set());

  // Poll voice_runs every 4 s. While probes are running their fields
  // (turn_count, termination_reason) update as the run progresses on
  // the gateway; refreshing keeps the table honest.
  useEffect(() => {
    if (bearerStatus === 'idle' || bearerStatus === 'minting') return;
    // Demo persona fallback: when the org has no real runs, surface a
    // persona-scoped demo roster so the panel reads as a populated
    // demo. Real tenants (no demo roster) still see the empty state.
    const demoFallback = () => {
      const demo = getDemoVoiceRuns(persona?.slug);
      setRuns(demo);
    };
    if (!bearer) {
      demoFallback();
      return;
    }
    let cancelled = false;
    async function pollRuns() {
      try {
        const r = await fetch(`${API_BASE}/api/sdk/voice-runs?limit=50`, {
          headers: { Authorization: `Bearer ${bearer}` },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        const live = Array.isArray(data?.voice_runs) ? data.voice_runs : [];
        if (live.length === 0) {
          setRuns(getDemoVoiceRuns(persona?.slug));
        } else {
          setRuns(live);
        }
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    pollRuns();
    const id = setInterval(pollRuns, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [bearer, bearerStatus, persona?.slug]);

  // Poll /v1/calls/active to mark rows as LIVE. We don't org-filter
  // server-side (gateway doesn't yet), but we cross-reference locally:
  // a call_id only shows in `runs` because it was attributed to this
  // org at upload, so the intersection is org-safe.
  useEffect(() => {
    let cancelled = false;
    async function pollActive() {
      try {
        const r = await fetch(`${GATEWAY}/v1/calls/active`, { mode: 'cors' });
        if (!r.ok) return;
        const json = await r.json();
        if (cancelled) return;
        const ids = new Set((json.calls || []).map((c) => c.call_control_id));
        setActiveIds(ids);
      } catch {
        /* gateway unreachable — leave activeIds empty */
      }
    }
    pollActive();
    const id = setInterval(pollActive, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (bearerStatus === 'idle' || bearerStatus === 'minting' || runs === null) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <CircleNotch size={14} className="animate-spin" />
          Loading voice runs…
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="max-w-md text-center">
            <Microphone size={28} weight="bold" className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
              No voice runs yet
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Spawn a probe from the wizard, or run{' '}
              <code className="font-mono text-[11px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800">bastion voice</code>{' '}
              from your terminal. Completed runs show up here, scoped to your organization.
            </p>
            {orgId && (
              <div className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-3">
                org: <code className="font-mono text-[10px]">{orgId}</code>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Microphone size={16} weight="bold" className="text-blue-500" />
            Voice Runs
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {runs.length} run{runs.length === 1 ? '' : 's'} for your org · live probes appear with a LIVE pill
          </p>
        </div>
        {orgId && (
          <code className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{orgId}</code>
        )}
      </div>

      {error && (
        <div className="mb-3 text-[11px] text-amber-700 dark:text-amber-400">
          fetch error: {error}
        </div>
      )}

      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="grid grid-cols-[110px_1fr_110px_140px_70px_90px_90px_90px] gap-3 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
          <span>State</span>
          <span>Call · Plugin · Goal</span>
          <span>User</span>
          <span>Termination</span>
          <span>Turns</span>
          <span>Duration</span>
          <span>When</span>
          <span></span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {runs.map((r) => {
            const isLive = !r.__demo && activeIds.has(r.call_control_id);
            return (
              <div
                key={r.id}
                className="grid grid-cols-[110px_1fr_110px_140px_70px_90px_90px_90px] gap-3 px-3 py-2.5 items-center text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800/30"
              >
                <span>
                  {isLive ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                      </span>
                      Live
                    </span>
                  ) : (
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Complete
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-mono text-slate-800 dark:text-slate-200" title={r.call_control_id}>
                    {shortCallId(r.call_control_id)}
                  </div>
                  <div className="truncate text-slate-500 dark:text-slate-400 text-[10px]" title={`${r.plugin_id || ''} · ${r.goal || ''}`}>
                    {r.plugin_id || '—'} · {r.goal || ''}
                  </div>
                </div>
                <div
                  className="truncate font-mono text-slate-600 dark:text-slate-300 text-[10px]"
                  title={r.user_id || 'no user_id'}
                >
                  {r.user_id ? (r.user_id.length > 14 ? `${r.user_id.slice(0, 14)}…` : r.user_id) : '—'}
                </div>
                <div className="truncate text-slate-600 dark:text-slate-300 text-[10px]" title={r.termination_reason || ''}>
                  {r.termination_reason || '—'}
                </div>
                <div className="tabular-nums text-slate-600 dark:text-slate-300">
                  {r.turn_count ?? 0}/{r.max_turns ?? 0}
                </div>
                <div className="tabular-nums text-slate-500 dark:text-slate-400 text-[10px]">
                  {r.call_duration_ms ? `${Math.round(r.call_duration_ms / 1000)}s` : '—'}
                </div>
                <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                  {relativeTime(r.created_at)}
                </span>
                {isLive ? (
                  <a
                    href={`${LISTEN_GATEWAY}/listen?call_id=${encodeURIComponent(r.call_control_id)}&bearer=${encodeURIComponent(bearer || '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Listen <ArrowSquareOut size={10} weight="bold" />
                  </a>
                ) : r.__demo ? (
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500" title="Demo run — no recording attached">
                    Demo
                  </span>
                ) : bearer ? (
                  // Recording download. The recorder is currently only
                  // wired into the voice-WS-target route in the gateway
                  // (see voice_ws_target.rs); AVA in-process and Telnyx
                  // originate runs do not produce a WAV on disk yet, so
                  // we surface a quiet dash instead of a broken link
                  // for those call_id shapes.
                  <span className="text-slate-400 text-[10px]">—</span>
                ) : (
                  <span className="text-slate-400">
                    <ArrowSquareOut size={11} weight="bold" className="opacity-30" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
