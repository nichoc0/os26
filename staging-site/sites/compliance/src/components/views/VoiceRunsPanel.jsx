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
import { Microphone, Lightning, ArrowSquareOut, CheckCircle, XCircle, Warning, CircleNotch, Trash, ChatText, X, Spinner } from '@phosphor-icons/react';
import { useVoiceToken } from '../../data/useVoiceToken';
import { usePersona } from '../../store/personaStore';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');

const GATEWAY = (import.meta.env.VITE_VOICE_GATEWAY_URL || 'https://voice-demo.pistonsolutions.ai').replace(/\/+$/, '');
const LISTEN_GATEWAY = (import.meta.env.VITE_LISTEN_GATEWAY_URL || GATEWAY).replace(/\/+$/, '');

function relativeTime(epoch) {
  if (!epoch) return '—';
  // created_at arrives as epoch MILLISECONDS from the runs backend, but
  // this helper math is in seconds. Treating ms as seconds made the diff
  // hugely negative → clamped to 0 → every row stuck at "0s ago" forever
  // (even 30s after the run). Normalize: anything that looks like ms
  // (> ~1e12) gets divided down to seconds.
  const epochSeconds = epoch > 1e12 ? epoch / 1000 : epoch;
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds));
  if (seconds < 5) return 'just now';
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

// Persona-driven filter for live voice_runs entries. The bankai demo
// org has historical internal test runs (medical:hallucination,
// pharmacy:*) that aren't representative of a real banking engagement
// — hide those specific plugin families. Anything NEW the operator
// fires (banking:*, prompt-extraction, pii:direct, custom probes)
// flows through. Use the operator-side Delete button for individual
// noise items the broad filter misses.
const BANKAI_HIDE_PLUGIN_PREFIXES = ['medical:', 'pharmacy:'];
function filterLiveForPersona(runs, personaSlug) {
  if (personaSlug !== 'demo-arabic-bank') return runs;
  return runs.filter((r) => {
    const pid = (r.plugin_id || '').toLowerCase();
    return !BANKAI_HIDE_PLUGIN_PREFIXES.some((p) => pid.startsWith(p));
  });
}

// localStorage key for the per-org deleted-row hide set. Stored as a
// JSON array of run IDs that the operator clicked Delete on. The set
// is scoped to the Clerk org so deletes don't leak across logins on
// the same browser.
function deletedIdsKey(orgId) {
  return `bastion.voiceRuns.hidden.${orgId || 'anon'}`;
}
function loadDeletedIds(orgId) {
  try {
    const raw = localStorage.getItem(deletedIdsKey(orgId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function saveDeletedIds(orgId, set) {
  try {
    localStorage.setItem(deletedIdsKey(orgId), JSON.stringify(Array.from(set)));
  } catch {}
}

export default function VoiceRunsPanel() {
  const { apiKey: bearer, status: bearerStatus, orgId } = useVoiceToken();
  const persona = usePersona();
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);
  const [activeIds, setActiveIds] = useState(new Set());
  // The run whose transcript modal is open (null = closed). Clicking a
  // row opens it; the gateway serves the persisted transcript JSON.
  const [openTranscript, setOpenTranscript] = useState(null);
  // Operator-deleted run IDs. Persisted in localStorage so they survive
  // page refresh (within the same browser). Backend DELETE endpoint is
  // a follow-up; for now the hide is client-side.
  const [deletedIds, setDeletedIds] = useState(() => new Set());
  // Rehydrate on mount + when orgId changes (e.g. org switch in Clerk).
  useEffect(() => { setDeletedIds(loadDeletedIds(orgId)); }, [orgId]);

  const deleteRun = (runId) => {
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.add(runId);
      saveDeletedIds(orgId, next);
      return next;
    });
  };

  // Poll voice_runs every 4 s. While probes are running their fields
  // (turn_count, termination_reason) update as the run progresses on
  // the gateway; refreshing keeps the table honest.
  //
  // No demo-row injection. Per the no-stubs-in-demo rule, this panel
  // only shows REAL completed probes — each row maps to a real
  // call_control_id with a real recording the WAV button can download.
  // First-time empty state is fine; the wizard's "Spawn Probe" CTA
  // points operators at the right next action.
  useEffect(() => {
    if (bearerStatus === 'idle' || bearerStatus === 'minting') return;
    const composeRuns = (liveRuns) => {
      const filteredLive = filterLiveForPersona(liveRuns, persona?.slug);
      const sorted = [...filteredLive].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      return sorted;
    };
    if (!bearer) {
      setRuns(composeRuns([]));
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
        setRuns(composeRuns(live));
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

  // Apply operator's local hide-set. Deleted rows disappear from the
  // panel; they reappear if the user clears localStorage. Backend
  // deletion is a follow-up — for now the gateway's voice_runs row
  // still exists, just hidden from this org's browser.
  const visibleRuns = runs.filter((r) => !deletedIds.has(r.id));

  if (visibleRuns.length === 0) {
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
            {visibleRuns.length} run{visibleRuns.length === 1 ? '' : 's'} for your org · live probes appear with a LIVE pill · click the trash icon to hide a row
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
        <div className="grid grid-cols-[110px_1fr_110px_140px_90px_90px_90px_40px] gap-3 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
          <span>State</span>
          <span>Call · Plugin · Goal</span>
          <span>User</span>
          <span>Termination</span>
          <span>Duration</span>
          <span>When</span>
          <span></span>
          <span></span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {visibleRuns.map((r) => {
            const isLive = !r.__demo && activeIds.has(r.call_control_id);
            return (
              <div
                key={r.id}
                className="grid grid-cols-[110px_1fr_110px_140px_90px_90px_90px_40px] gap-3 px-3 py-2.5 items-center text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800/30"
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
                <button
                  type="button"
                  onClick={() => setOpenTranscript(r)}
                  className="min-w-0 text-left bg-transparent border-none cursor-pointer group"
                  title="Open transcript"
                >
                  <div className="truncate font-mono text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 inline-flex items-center gap-1" title={r.call_control_id}>
                    {shortCallId(r.call_control_id)}
                    <ChatText size={11} weight="bold" className="opacity-0 group-hover:opacity-100 text-blue-500 shrink-0" />
                  </div>
                  {/* Plugin id only in the row — full goal text is huge
                      and bleeds the column. Goal lives in the title=
                      tooltip so it's still recoverable on hover. */}
                  <div className="truncate text-slate-500 dark:text-slate-400 text-[10px]" title={r.goal || ''}>
                    {r.plugin_id || '—'}
                  </div>
                </button>
                <div
                  className="truncate font-mono text-slate-600 dark:text-slate-300 text-[10px]"
                  title={r.user_id || 'no user_id'}
                >
                  {r.user_id ? (r.user_id.length > 14 ? `${r.user_id.slice(0, 14)}…` : r.user_id) : '—'}
                </div>
                <div className="truncate text-slate-600 dark:text-slate-300 text-[10px]" title={r.termination_reason || ''}>
                  {r.termination_reason || '—'}
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
                ) : (
                  // Real-call WAV download. Every row is a real probe
                  // (no demo-row stub path) so the link always points
                  // at the gateway's `/v1/recordings/<ccid>` endpoint.
                  // The recorder is wired for AVA + WS-target routes;
                  // Telnyx originate (v3:*) is still pending and those
                  // rows will 404 until that wiring lands.
                  <a
                    href={`${LISTEN_GATEWAY}/v1/recordings/${encodeURIComponent(r.call_control_id)}${bearer ? `?bearer=${encodeURIComponent(bearer)}` : ''}`}
                    download={`bastion-${(r.call_control_id || r.id).slice(0, 16)}.wav`}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                    title="Download stereo WAV (L = inbound, R = outbound)"
                  >
                    WAV <ArrowSquareOut size={10} weight="bold" />
                  </a>
                )}
                {/* Delete button — local-hide (localStorage-backed)
                    until backend DELETE lands. One click, no confirm
                    so the demo cadence isn't interrupted. */}
                <button
                  onClick={() => deleteRun(r.id)}
                  className="inline-flex items-center justify-center w-6 h-6 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-none transition-colors cursor-pointer border-none bg-transparent"
                  title="Hide this run (local to this browser)"
                  aria-label="Hide run"
                >
                  <Trash size={11} weight="bold" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {openTranscript && (
        <TranscriptModal
          run={openTranscript}
          bearer={bearer}
          onClose={() => setOpenTranscript(null)}
        />
      )}
    </div>
  );
}

// Past-run transcript viewer. Fetches the gateway's persisted transcript
// JSON (written at call-end) and renders it turn-grouped — consecutive
// finals from the same speaker merge into one block, partials are
// dropped, exact/growing-final duplicates collapsed. Mirrors the live
// /listen widget's rendering so a stopped run reads the same as it did
// live. WAV (audio) stays a separate download on the row.
function TranscriptModal({ run, bearer, onClose }) {
  const [state, setState] = useState('loading'); // loading | ready | empty | error
  const [turns, setTurns] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const ccid = run?.call_control_id;
    if (!ccid) { setState('empty'); return; }
    const url = `${LISTEN_GATEWAY}/v1/transcripts/${encodeURIComponent(ccid)}${bearer ? `?bearer=${encodeURIComponent(bearer)}` : ''}`;
    (async () => {
      try {
        const r = await fetch(url, { mode: 'cors' });
        if (cancelled) return;
        if (r.status === 404) { setState('empty'); return; }
        if (!r.ok) { setState('error'); return; }
        const frames = await r.json();
        if (cancelled) return;
        setTurns(groupTranscript(Array.isArray(frames) ? frames : []));
        setState(frames && frames.length ? 'ready' : 'empty');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [run, bearer]);

  // Direction → speaker label. The persisted transcript is the TARGET
  // call's view (what the live widget showed): Outbound = the target
  // agent (Sera), Inbound = the Bastion attacker.
  const labelFor = (dir) => (String(dir).toLowerCase() === 'inbound' ? 'Bastion (attacker)' : 'Target');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <ChatText size={16} weight="duotone" className="text-blue-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Transcript</h3>
          <span className="text-[10px] font-mono text-slate-400 truncate">{shortCallId(run.call_control_id)}</span>
          <button onClick={onClose} className="ml-auto p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-transparent border-none cursor-pointer" aria-label="Close">
            <X size={16} weight="bold" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {state === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-8 justify-center">
              <Spinner size={16} className="animate-spin" /> Loading transcript…
            </div>
          )}
          {state === 'error' && (
            <div className="text-sm text-amber-700 dark:text-amber-400 py-8 text-center">Couldn't load this transcript.</div>
          )}
          {state === 'empty' && (
            <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              No saved transcript for this run.<br />
              <span className="text-[11px]">Transcripts are captured for probes run after this feature shipped; older runs won't have one.</span>
            </div>
          )}
          {state === 'ready' && turns.map((t, i) => {
            const inbound = String(t.dir).toLowerCase() === 'inbound';
            return (
              <div key={i} className={`flex flex-col ${inbound ? 'items-start' : 'items-end'}`}>
                <div className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${inbound ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {labelFor(t.dir)}
                </div>
                <div className={`max-w-[85%] px-3 py-2 text-[12px] leading-snug whitespace-pre-wrap ${inbound ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200' : 'bg-blue-50 dark:bg-blue-950/40 text-slate-800 dark:text-slate-100'}`}>
                  {t.text}
                </div>
              </div>
            );
          })}
        </div>
        <div className="shrink-0 px-4 py-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
          <span>{run.plugin_id || ''}</span>
          {run.call_control_id && (
            <a
              href={`${LISTEN_GATEWAY}/v1/recordings/${encodeURIComponent(run.call_control_id)}${bearer ? `?bearer=${encodeURIComponent(bearer)}` : ''}`}
              download={`bastion-${(run.call_control_id || run.id).slice(0, 16)}.wav`}
              className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
              title="Download audio (stereo WAV)"
            >
              WAV (audio) <ArrowSquareOut size={9} weight="bold" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Turn-group a flat list of transcript frames the same way the live
// /listen widget does: keep only finals, merge consecutive same-
// direction frames into one block, collapse exact/growing-final dupes.
function groupTranscript(frames) {
  const turns = [];
  for (const f of frames) {
    if (f.is_final === false) continue; // drop partials
    const dir = f.direction || 'outbound';
    const clean = (f.text || '').trim();
    if (!clean) continue;
    const cur = turns[turns.length - 1];
    if (cur && String(cur.dir).toLowerCase() === String(dir).toLowerCase()) {
      const last = cur.segments[cur.segments.length - 1];
      if (last && (last === clean || last.includes(clean))) {
        // duplicate / shrinking re-emit — skip
      } else if (last && clean.includes(last)) {
        cur.segments[cur.segments.length - 1] = clean; // growing final
      } else {
        cur.segments.push(clean);
      }
      cur.text = cur.segments.join(' ');
    } else {
      turns.push({ dir, segments: [clean], text: clean });
    }
  }
  return turns;
}
