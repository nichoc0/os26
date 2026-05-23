// Red — live adversarial probes backed by the persistent tmux Claude REPL
// (bastion-runner-service.mjs). Click a launch button → POST /v1/probe/start
// returns a uuid, the persistent REPL receives a small trigger that tells
// Claude to read the full prompt file and execute. Every curl Claude fires
// appends `probe_request` + `probe_response` JSON events to
// /tmp/bastion-events-<uuid>.jsonl which the runner streams back via
// GET /v1/probe/:uuid/events?offset=N. No claude -p spawn-per-probe — one
// persistent REPL serves every probe.
// v2 — pair responses to earliest open turn (fixes openTurnRef race)

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair, Target, Warning, CheckCircle, FileText, User, Robot,
  Spinner, Stop, Play, ArrowsClockwise, ArrowRight, X,
} from '@phosphor-icons/react';
import { useSessionStore } from '../../store/sessionStore';
import { useModeStore } from '../../store/modeStore';
import { useIsDev } from '../../store/audienceStore';
import CiRunsPanel from './CiRunsPanel';
import PostureAssessmentModal from '../marketing/PostureAssessmentModal';

// Runner endpoint resolution:
//   - VITE_RUNNER_URL env wins if set (manual override)
//   - localhost / 127.0.0.1: hit the runner directly on :18790 (CORS allowed)
//   - everything else (Vercel prod or staging): use the relative /api/runner
//     path, which vercel.json rewrites to bastion-runner.pistonsolutions.ai
const RUNNER_BASE = (() => {
  if (import.meta.env.VITE_RUNNER_URL) return import.meta.env.VITE_RUNNER_URL;
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') {
      return 'http://127.0.0.1:18790';
    }
  }
  // Vercel-hosted: use BASE_URL prefix so the /bastion-blue/api/runner
  // rewrite in vercel.json catches it. Without the prefix, Vercel returns
  // the SPA index.html (catch-all) and the JSON parse fails.
  const prefix = import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/'
    ? import.meta.env.BASE_URL.replace(/\/$/, '')
    : '';
  return `${prefix}/api/runner`;
})();
const REDVIEW_BUILD = 'v6-dual-agent';  // bump when pairing or formatter changes — if you don't see this in the panel footer, you're on a stale bundle

const SEV_STYLE = {
  critical: { ring: 'border-slate-900 dark:border-slate-200', text: 'text-slate-900 dark:text-slate-100', Icon: Warning },
  high:     { ring: 'border-blue-600',                        text: 'text-blue-700 dark:text-blue-300',   Icon: Warning },
  medium:   { ring: 'border-slate-500',                        text: 'text-slate-700 dark:text-slate-300', Icon: Target },
  low:      { ring: 'border-slate-300 dark:border-slate-700',  text: 'text-slate-500 dark:text-slate-400', Icon: CheckCircle },
  info:     { ring: 'border-slate-300 dark:border-slate-700',  text: 'text-slate-500 dark:text-slate-400', Icon: FileText },
};

export function RedView() {
  const isDev = useIsDev();
  const [scopes, setScopes] = useState([]);
  const [runs, setRuns] = useState([]);
  const [archived, setArchived] = useState([]);
  const [serverHealthy, setServerHealthy] = useState(null);
  const [launching, setLaunching] = useState(null);
  const [activeUuids, setActiveUuids] = useState([]); // uuids the user has launched in this session
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [loops, setLoops] = useState({}); // scope -> { running, intervalSec, runCount, ... }
  const [frozen, setFrozen] = useState(false);
  const [rufusMode, setRufusMode] = useState(null);
  const globalMode = useModeStore((s) => s.mode);

  // Derive Assistant's defense state from the global Monitoring/Enforcement
  // toggle. Enforcement = defended by Bastion; Monitoring = undefended
  // (Bastion observes but does not block — probes can leak canaries).
  const desiredRufusMode = globalMode === 'enforcement' ? 'defended' : 'undefended';

  // Whenever the global mode changes (or the runner first reports its
  // current state), push the desired Assistant mode to the runner so the
  // mock target's defense layer matches the dashboard's posture.
  useEffect(() => {
    if (rufusMode === null) return; // wait for first health poll
    if (rufusMode === desiredRufusMode) return;
    fetch(`${RUNNER_BASE}/v1/assistant-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: desiredRufusMode }),
    })
      .then((r) => r.json())
      .then((j) => { if (j.mode) setRufusMode(j.mode); })
      .catch((e) => console.warn('assistant mode sync failed', e));
  }, [desiredRufusMode, rufusMode]);

  // Poll health + scope catalog + runs list + loop status + assistant mode every 2s (unless frozen).
  useEffect(() => {
    if (frozen) return;
    let mounted = true;
    const tick = async () => {
      try {
        const [sc, ru, lp, rm] = await Promise.all([
          fetch(`${RUNNER_BASE}/v1/scopes`).then((r) => r.json()),
          fetch(`${RUNNER_BASE}/v1/runs`).then((r) => r.json()),
          fetch(`${RUNNER_BASE}/v1/loop/status`).then((r) => r.json()).catch(() => ({ loops: {} })),
          fetch(`${RUNNER_BASE}/v1/assistant-mode`).then((r) => r.json()).catch(() => null),
        ]);
        if (!mounted) return;
        setScopes(sc.scopes || []);
        setRuns(ru.runs || []);
        setLoops(lp.loops || {});
        if (rm) setRufusMode(rm.mode || null);
        setServerHealthy(true);
      } catch {
        if (mounted) setServerHealthy(false);
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { mounted = false; clearInterval(id); };
  }, [frozen]);

  // Auto-subscribe to ALL 24/7 auto-sweep runs (current + prior) — pulls
  // uuids from /v1/runs filtered by mode=dual-agent-loop so history stays
  // visible across page refreshes.
  useEffect(() => {
    const loopRunUuids = runs
      .filter((r) => r.mode === 'dual-agent-loop')
      .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))
      .slice(0, 20)
      .map((r) => r.uuid);
    if (loopRunUuids.length === 0) return;
    setActiveUuids((prev) => {
      const missing = loopRunUuids.filter((u) => !prev.includes(u));
      if (missing.length === 0) return prev;
      const next = [...prev, ...missing];
      return next.slice(-25);
    });
  }, [runs]);



  // Load archived canned fixtures once.
  useEffect(() => {
    let mounted = true;
    const fixtures = [
      { id: 'acme-assistant', label: 'Acme Shopping Assistant (canned 2026-04-13)', fixture: 'red-runs/acme-assistant.json' },
    ];
    (async () => {
      const base = import.meta.env.BASE_URL || '/';
      const loaded = await Promise.all(
        fixtures.map(async (m) => {
          try {
            const r = await fetch(`${base}${m.fixture}`);
            if (!r.ok) throw new Error(`${m.fixture} ${r.status}`);
            return { ...m, data: await r.json(), error: null };
          } catch (e) {
            return { ...m, data: null, error: e.message };
          }
        }),
      );
      if (mounted) setArchived(loaded);
    })();
    return () => { mounted = false; };
  }, []);

  // Any run the user launched in this browser session stays in the active
  // panel list — even after it completes — so the transcript remains visible
  // instead of vanishing the moment the probe finishes.
  const activeRuns = useMemo(
    () => activeUuids
      .map((uuid) => runs.find((r) => r.uuid === uuid))
      .filter(Boolean),
    [runs, activeUuids],
  );
  const recentRuns = useMemo(
    () => runs.filter((r) => !activeUuids.includes(r.uuid) && r.status !== 'running').slice(0, 6),
    [runs, activeUuids],
  );

  const toggleLoop = async (scope) => {
    const isRunning = !!loops[scope]?.running;
    const endpoint = isRunning ? `${RUNNER_BASE}/v1/loop/stop` : `${RUNNER_BASE}/v1/loop/start`;
    const body = isRunning ? { scope } : { scope, intervalSec: 60, maxTurns: 6 };
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.warn('loop toggle failed', e);
    }
  };

  const launch = async (scope, mode = 'standard') => {
    setLaunching(`${scope}-${mode}`);
    const endpoint = mode === 'dual'
      ? `${RUNNER_BASE}/v1/dual-probe/start`
      : `${RUNNER_BASE}/v1/probe/start`;
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, maxTurns: 12 }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const j = await r.json();
      setActiveUuids((prev) => [...prev, j.uuid]);
      // Seed local runs so it shows up before the next poll
      setRuns((prev) => [
        { uuid: j.uuid, scope, label: j.label, status: 'running', started_at: j.started_at, finding_count: 0 },
        ...prev.filter((x) => x.uuid !== j.uuid),
      ]);
    } catch (e) {
      alert(`Failed to launch: ${e.message}`);
    } finally {
      setLaunching(null);
    }
  };

  return (
    <div className="flex flex-col h-full gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
          <Crosshair size={24} weight="bold" className="text-blue-500" />
          Adversarial Assessment
        </h1>
      </header>

      <div className="relative flex-1 min-h-[640px]">
        {/* Blurred preview of the actual assessment view */}
        <div className="flex flex-col gap-6 blur-md pointer-events-none select-none" aria-hidden="true">
        {isDev && <CiRunsPanel />}

      {/* Launch bar */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-none bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">
            Launch probe
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setFrozen((f) => !f)}
              className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 border rounded-none cursor-pointer transition-colors ${
                frozen
                  ? 'border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10'
                  : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:border-blue-500 hover:text-blue-500'
              }`}
              title={frozen ? 'Resume live updates' : 'Pause frontend polling — snapshot freezes until you unfreeze'}
            >
              {frozen ? '▶ Resume Display' : '⏸ Freeze Display'}
            </button>
            <ServerStatus healthy={serverHealthy} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {scopes.map(({ scope, label, target, display_target, available }) => {
            const loop = loops[scope];
            const looping = !!loop?.running;
            const showRufusToggle = scope === 'acme-vrp';
            return (
              <div key={scope} className={`border ${looping ? 'border-blue-500' : 'border-slate-200 dark:border-slate-800'} bg-slate-50 dark:bg-slate-950 p-3 rounded-none`}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-2">
                    <span>{label}</span>
                    {showRufusToggle && (
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${desiredRufusMode === 'defended' ? 'border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50/40 dark:bg-blue-500/10' : 'border-slate-400 text-slate-600 dark:text-slate-400'}`}>
                        {desiredRufusMode === 'defended' ? 'defended by Bastion' : 'undefended'}
                      </span>
                    )}
                  </div>
                  {looping && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono text-blue-700 dark:text-blue-300 px-1.5 py-0.5 border border-blue-500/40 bg-blue-50/40 dark:bg-blue-500/10 shrink-0">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                      </span>
                      24/7 · {loop.runCount} runs
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate mb-2">{display_target || target || '(no target)'}</div>
                {showRufusToggle && (
                  <div className="w-full mb-1.5 text-[9px] font-mono text-slate-500 dark:text-slate-400 px-1">
                    Posture follows the {' '}
                    <span className="font-bold text-blue-600 dark:text-blue-400">{globalMode === 'enforcement' ? 'Enforcement' : 'Monitoring'}</span>
                    {' '}toggle in the top bar.
                  </div>
                )}
                <div className="space-y-1.5">
                  <button
                    onClick={() => launch(scope, 'dual')}
                    disabled={!available || serverHealthy === false || launching === `${scope}-dual`}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-[10px] font-mono px-2 py-1.5 border border-slate-700 dark:border-slate-300 text-slate-900 dark:text-slate-100 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Opus strategist + Haiku executor — one-shot adaptive probe"
                  >
                    {launching === `${scope}-dual`
                      ? <Spinner size={10} weight="bold" className="animate-spin" />
                      : <Play size={10} weight="bold" />}
                    dual-agent architecture
                  </button>
                  <button
                    onClick={() => toggleLoop(scope)}
                    disabled={!available || serverHealthy === false}
                    className={`w-full inline-flex items-center justify-center gap-1.5 text-[10px] font-mono px-2 py-1.5 border rounded-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                      looping
                        ? 'border-blue-500 bg-blue-500 text-white hover:bg-blue-600 hover:border-blue-600'
                        : 'border-slate-400 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-blue-500 hover:text-blue-500'
                    }`}
                    title={looping ? 'Stop the 24/7 auto-sweep' : 'Re-probe this scope every 60s, continuously'}
                  >
                    {looping ? <Stop size={10} weight="bold" /> : <Play size={10} weight="bold" />}
                    {looping ? 'stop 24/7 sweep' : '24/7 auto-sweep'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {serverHealthy === false && (
          <div className="mt-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Runner offline at {RUNNER_BASE}. Start with: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded-none">bash bastion-red/runner/start-service.sh</code>
          </div>
        )}
      </section>

      {/* Active sessions — split user-launched from auto-sweep */}
      {(() => {
        const loopRuns = activeRuns.filter((r) => r.mode === 'dual-agent-loop');
        const oneShotRuns = activeRuns.filter((r) => r.mode !== 'dual-agent-loop');
        // Group loop runs by scope so each scope gets one merged feed panel.
        const loopsByScope = loopRuns.reduce((acc, r) => {
          const s = r.scope || 'unknown';
          if (!acc[s]) acc[s] = [];
          acc[s].push(r);
          return acc;
        }, {});
        return (
          <>
            {oneShotRuns.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3">
                  Active sessions ({oneShotRuns.length})
                </h2>
                <div className={`grid gap-4 ${oneShotRuns.length === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                  {oneShotRuns.map((run) => (
                    <ActiveRunPanel key={run.uuid} run={run} />
                  ))}
                </div>
              </section>
            )}
            {Object.entries(loopsByScope).map(([scope, runs]) => (
              <section key={`sweep-${scope}`}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3">
                  24/7 auto-sweep · {scope === 'demo' ? 'Sera (Intake)' : scope === 'acme-vrp' ? 'Acme Shopping Assistant' : scope} · {runs.length} probe{runs.length === 1 ? '' : 's'}
                </h2>
                <SweepFeedPanel runs={runs} scope={scope} />
              </section>
            ))}
          </>
        );
      })()}

      {/* Recent completed */}
      {recentRuns.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3">
            Recent sessions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentRuns.map((r) => <RecentRunCard key={r.uuid} run={r} />)}
          </div>
        </section>
      )}

      {/* Archived canned runs */}
      {archived.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3">
            Archived runs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {archived.map((a) => <ArchivedRunCard key={a.id} a={a} />)}
          </div>
        </section>
      )}
        </div>

        {/* Centered CTA overlay */}
        <div className="absolute inset-0 flex items-center justify-center z-10 p-6 pointer-events-none">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-8 text-center pointer-events-auto">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500 mb-3">
              Adversarial Assessment
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3 leading-tight">
              Stress-test your AI agents on demand.
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              Bastion runs adversarial probes against your agents and surfaces
              every disclosure, refusal, and rule violation in the Vault. Available
              once you onboard with us.
            </p>
            <button
              type="button"
              onClick={() => setAssessmentOpen(true)}
              className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest px-5 py-3 border border-blue-500 text-white bg-blue-500 hover:bg-blue-600 hover:border-blue-600 rounded-none cursor-pointer transition-colors"
            >
              Start Assessment
              <ArrowRight size={12} weight="bold" />
            </button>
            <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-4">
              7 questions · ~2 minutes
            </div>
          </div>
        </div>
      </div>
      <PostureAssessmentModal open={assessmentOpen} onClose={() => setAssessmentOpen(false)} />
    </div>
  );
}

// =========================================================================
// ActiveRunPanel — polls /v1/probe/:uuid/events every 1s.
// Only `probe_request` and `probe_response` events are rendered as turns.
// =========================================================================

function useAddFindingToKg() {
  return useSessionStore((s) => s.addFindingToKg);
}

function ActiveRunPanel({ run }) {
  const [turns, setTurns] = useState([]);     // [{id, request, response, started_at}]
  const [status, setStatus] = useState('running');
  const [findings, setFindings] = useState([]);
  const addFindingToKg = useAddFindingToKg();
  const [claudeThinking, setClaudeThinking] = useState(false);
  const [lastEventAt, setLastEventAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef(null);
  const offsetRef = useRef(0);

  // Heartbeat to drive the "waiting for next turn" timer so the UI re-renders
  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [status]);
  // Pending request index queue — FIFO of turn indices awaiting a response.
  // Decouples pairing from the turns-state read so we don't rely on
  // findIndex racing against in-flight setTurns commits.
  const pendingQueueRef = useRef([]);
  // Mirror of turns.length that updates synchronously inside the poll loop
  // (React state commits are batched and deferred).
  const turnsCountRef = useRef(0);
  useEffect(() => { turnsCountRef.current = turns.length; }, [turns.length]);

  useEffect(() => {
    let mounted = true;
    // Real-time stream via Server-Sent Events. Each event the runner writes
    // hits onmessage within ~5ms — no polling delay.
    const es = new EventSource(`${RUNNER_BASE}/v1/probe/${run.uuid}/stream`);
    const applyEvents = (events) => {
        if (!mounted) return;
        if (events.length > 0) setLastEventAt(Date.now());
        // Local index counter that survives batched React updates. Starts
        // at turns.length (committed count) and increments per req in this
        // cycle — independent of pending React state commits.
        let cycleAppends = 0;
        for (const evt of events) {
          if (evt.type === 'probe_request') {
            let technique = evt.technique;
            let payload = evt.payload;
            const techIsLong = typeof technique === 'string' && technique.length > 60 && /\s/.test(technique);
            const payloadIsIndex = typeof payload === 'string' && /^\d+$/.test(payload);
            if (techIsLong && payloadIsIndex) {
              [technique, payload] = [payload, technique];
            }
            const idx = turnsCountRef.current + cycleAppends;
            cycleAppends++;
            // Prefer probe_id pairing — FIFO fallback for events missing it
            if (!evt.probe_id) pendingQueueRef.current.push(idx);
            setTurns((t) => [...t, {
              id: `t${idx}`,
              probe_id: evt.probe_id,
              request: {
                technique,
                payload,
                payload_index: evt.payload_index,
                total_payloads: evt.total_payloads,
              },
              response: null,
              started_at: evt.ts || Date.now(),
            }]);
          } else if (evt.type === 'probe_response') {
            const looksStub = (evt.status == null || evt.status === 0)
              && evt.body == null
              && (evt.evidence_match === 'pending');
            if (looksStub) continue;
            // Pair by probe_id when available — this is robust against
            // concurrent direct-burst + Claude probe streams. Fallback to
            // FIFO queue only for events missing probe_id.
            if (evt.probe_id) {
              setTurns((t) => {
                const match = t.findIndex((x) => x.probe_id === evt.probe_id && !x.response);
                if (match === -1) return t;
                const copy = [...t];
                copy[match] = {
                  ...copy[match],
                  response: {
                    status: evt.status,
                    body: evt.body,
                    tokens: evt.tokens,
                    refusal: evt.refusal,
                    evidence_match: evt.evidence_match,
                    received_at: evt.ts || Date.now(),
                  },
                };
                return copy;
              });
            } else {
              const idx = pendingQueueRef.current.shift();
              if (idx === undefined) continue;
              setTurns((t) => {
                if (idx >= t.length) return t;
                const copy = [...t];
                copy[idx] = {
                  ...copy[idx],
                  response: {
                    status: evt.status,
                    body: evt.body,
                    tokens: evt.tokens,
                    refusal: evt.refusal,
                    evidence_match: evt.evidence_match,
                    received_at: evt.ts || Date.now(),
                  },
                };
                return copy;
              });
            }
          } else if (evt.type === 'finding') {
            setFindings((f) => [...f, evt]);
            try { addFindingToKg(evt); } catch {}
          } else if (evt.type === 'claude_thinking') {
            setClaudeThinking(true);
          } else if (evt.type === 'dual_strategist_thinking') {
            setClaudeThinking(true);
          } else if (evt.type === 'dual_executor_firing') {
            setClaudeThinking(false);
          } else if (evt.type === 'completed') {
            setClaudeThinking(false);
            setStatus(evt.exit_code === 0 ? 'completed' : 'errored');
          }
          // When a fresh probe_request arrives, Claude's thinking is over
          if (evt.type === 'probe_request') setClaudeThinking(false);
        }
    };
    es.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data);
        applyEvents([evt]);
      } catch {}
    };
    es.onerror = () => {
      // SSE will auto-reconnect; nothing to do. If the probe is done the
      // runner closes the stream and we stop here.
    };
    return () => { mounted = false; es.close(); };
  }, [run.uuid]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length, findings.length]);

  return (
    <div className="border border-blue-500/50 dark:border-blue-500/40 rounded-none bg-white dark:bg-slate-900 flex flex-col min-h-[420px] max-h-[72vh]">
      <header className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-blue-50/40 dark:bg-blue-500/10 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            {status === 'running' && (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </>
            )}
            {status !== 'running' && <span className="inline-flex rounded-full h-2 w-2 bg-slate-400" />}
          </span>
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{run.label || run.scope}</span>
          <span className="text-[10px] font-mono text-slate-400 shrink-0">{run.uuid}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-mono text-slate-400">
            {turns.length} turn{turns.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-[12px]">
        {turns.length === 0 && status === 'running' && (
          <div className="text-slate-400 italic text-center py-12">
            <Spinner size={18} weight="bold" className="inline animate-spin text-blue-500 mr-2" />
            Waiting for Bastion to warm up — persistent REPL composing first curl…
          </div>
        )}
        {turns.map((t, i) => <TurnBubble key={i} turn={t} index={i + 1} />)}
        {status === 'running' && (() => {
          const idleMs = now - lastEventAt;
          // Only show continuity indicator if the last turn has a response
          // (don't double up with "awaiting target response" inside TurnBubble)
          const lastTurn = turns[turns.length - 1];
          const lastAwaiting = lastTurn && !lastTurn.response;
          if (lastAwaiting) return null;
          const elapsed = Math.floor(idleMs / 1000);
          const label = claudeThinking
            ? `Bastion is composing the next adaptive probe based on the previous responses… (${elapsed}s)`
            : turns.length === 0
            ? `Waiting for Bastion to warm up… (${elapsed}s)`
            : `Awaiting next probe from Bastion… (${elapsed}s)`;
          return (
            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 italic px-1 py-2 border-l-2 border-blue-500 pl-3 bg-blue-50/30 dark:bg-blue-500/5">
              <Spinner size={14} weight="bold" className="animate-spin text-blue-500 shrink-0" />
              <span>{label}</span>
            </div>
          );
        })()}
        {findings.length > 0 && (
          <div className="mt-4 border-t border-slate-200 dark:border-slate-800 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
              Findings emitted ({findings.length})
            </div>
            <ul className="space-y-1">
              {findings.map((f, i) => {
                const sev = (f.severity || 'info').toLowerCase();
                const s = SEV_STYLE[sev] ?? SEV_STYLE.info;
                return (
                  <li key={i} className={`text-[11px] inline-flex items-center gap-1 px-2 py-0.5 border rounded-none ${s.ring} ${s.text}`}>
                    <s.Icon size={10} weight="bold" />
                    {sev.toUpperCase()} · {f.technique || '?'}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <footer className="px-4 py-1.5 border-t border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between">
        <span>{turns.length} turn{turns.length === 1 ? '' : 's'} · {findings.length} finding{findings.length === 1 ? '' : 's'} · <span className="text-blue-500">build={REDVIEW_BUILD}</span></span>
        <span className={status === 'running' ? 'text-blue-500' : status === 'completed' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}>
          {status}
        </span>
      </footer>
    </div>
  );
}

// One continuous merged feed across all 24/7 auto-sweep runs for a scope.
// Each run opens its own EventSource; turns are appended to a single flat
// chronological array so older probes stay scrollable above new ones.
function SweepFeedPanel({ runs, scope }) {
  const addFindingToKg = useAddFindingToKg();
  const [feed, setFeed] = useState([]); // [{runUuid, turnIdx, kind, request?, response?, startedAt}]
  const [findings, setFindings] = useState([]);
  const sourcesRef = useRef(new Map()); // uuid -> EventSource
  const scrollRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    // Open SSE for any run we don't have yet; close SSE for runs no longer
    // in the list (rare — loop runs never disappear but safety net).
    const sources = sourcesRef.current;
    const currentUuids = new Set(runs.map((r) => r.uuid));
    for (const uuid of [...sources.keys()]) {
      if (!currentUuids.has(uuid)) {
        try { sources.get(uuid).close(); } catch {}
        sources.delete(uuid);
      }
    }
    for (const run of runs) {
      if (sources.has(run.uuid)) continue;
      const es = new EventSource(`${RUNNER_BASE}/v1/probe/${run.uuid}/stream`);
      const pendingByRun = [];
      es.addEventListener('message', (msg) => {
        try {
          const evt = JSON.parse(msg.data);
          if (evt.type === 'probe_request') {
            setFeed((f) => [...f, {
              runUuid: run.uuid, runStartedAt: run.started_at,
              turnIdx: evt.payload_index || f.filter((x) => x.runUuid === run.uuid).length + 1,
              kind: 'probe',
              technique: evt.technique,
              payload: evt.payload,
              startedAt: evt.ts || Date.now(),
              response: null,
            }]);
          } else if (evt.type === 'probe_response') {
            setFeed((f) => {
              // Match the most recent probe entry for this run without a response.
              const copy = [...f];
              for (let i = copy.length - 1; i >= 0; i--) {
                if (copy[i].runUuid === run.uuid && copy[i].kind === 'probe' && !copy[i].response) {
                  copy[i] = { ...copy[i], response: { status: evt.status, body: evt.body, defense_layer: evt.defense_layer, received_at: evt.ts || Date.now() } };
                  return copy;
                }
              }
              return copy;
            });
          } else if (evt.type === 'finding') {
            setFindings((ff) => [...ff, evt]);
            try { addFindingToKg(evt); } catch {}
          }
        } catch {}
      });
      es.onerror = () => { try { es.close(); } catch {} sources.delete(run.uuid); };
      sources.set(run.uuid, es);
    }
    return () => {
      // Don't close on unmount — let feed persist across re-renders. Cleanup
      // only when run disappears above.
    };
  }, [runs, addFindingToKg]);

  // Auto-scroll to bottom when new items arrive, unless user scrolled up.
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [feed, autoScroll]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(atBottom);
  };

  // Group feed items by runUuid for visual separators.
  const grouped = useMemo(() => {
    const groups = [];
    let current = null;
    for (const item of feed) {
      if (!current || current.runUuid !== item.runUuid) {
        current = { runUuid: item.runUuid, runStartedAt: item.runStartedAt, items: [] };
        groups.push(current);
      }
      current.items.push(item);
    }
    return groups;
  }, [feed]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">
            live · {feed.length} turn{feed.length === 1 ? '' : 's'} across {runs.length} probe{runs.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <span>{findings.length} finding{findings.length === 1 ? '' : 's'}</span>
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }}
              className="text-blue-500 hover:text-blue-600 cursor-pointer bg-transparent border-none underline"
            >
              jump to bottom
            </button>
          )}
        </div>
      </header>
      <div ref={scrollRef} onScroll={onScroll} className="max-h-[560px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/50">
        {grouped.length === 0 && (
          <div className="p-6 text-[11px] italic text-slate-400 text-center">Waiting for Bastion to warm up…</div>
        )}
        {grouped.map((g, gi) => (
          <div key={`${g.runUuid}-${gi}`}>
            <div className="px-4 py-1.5 bg-slate-50 dark:bg-slate-900/70 text-[9px] font-mono text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/50">
              probe {g.runUuid} · {g.runStartedAt ? new Date(g.runStartedAt).toLocaleTimeString() : ''}
            </div>
            {g.items.map((item, ii) => (
              <SweepTurn key={`${g.runUuid}-${item.turnIdx}-${ii}`} item={item} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SweepTurn({ item }) {
  const status = item.response?.status;
  const defenseLayer = item.response?.defense_layer;
  const layerColor = defenseLayer?.startsWith('L3') ? 'text-slate-700 dark:text-slate-300'
    : defenseLayer?.startsWith('L4') ? 'text-slate-600 dark:text-slate-400'
    : defenseLayer?.startsWith('L5') ? 'text-slate-500 dark:text-slate-500'
    : 'text-blue-600 dark:text-blue-400';
  return (
    <div className="px-4 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] font-mono">
        <span className="text-slate-400 dark:text-slate-600">T{item.turnIdx}</span>
        <span className="text-slate-700 dark:text-slate-300">{item.technique}</span>
        {defenseLayer && <span className={`${layerColor} uppercase`}>· {defenseLayer}</span>}
        {status === 0 && <span className="text-slate-500">· pending</span>}
      </div>
      <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono break-words whitespace-pre-wrap bg-slate-50 dark:bg-slate-950 border-l-2 border-blue-500 pl-2 py-1">
        <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">REPL → </span>
        {item.payload}
      </div>
      {item.response ? (
        <div className="text-[11px] text-slate-700 dark:text-slate-300 font-mono break-words whitespace-pre-wrap bg-slate-50 dark:bg-slate-950 border-l-2 border-slate-400 dark:border-slate-600 pl-2 py-1">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider"> → TARGET ({status}) </span>
          {(item.response.body || '').slice(0, 500)}
        </div>
      ) : (
        <div className="text-[10px] italic text-slate-400 pl-2">awaiting target response…</div>
      )}
    </div>
  );
}

function TurnBubble({ turn, index }) {
  const req = turn.request;
  const resp = turn.response;
  const latencyMs = resp && turn.started_at ? (resp.received_at - turn.started_at) : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
        <span>turn {index}</span>
        {req?.technique && <span className="text-slate-500 dark:text-slate-400 font-mono normal-case truncate">{req.technique}</span>}
        {latencyMs !== null && <span className="text-slate-400 font-mono normal-case">· {latencyMs}ms</span>}
      </div>
      {req && (
        <div className="flex items-start gap-2">
          <div className="shrink-0 mt-0.5 h-5 w-5 flex items-center justify-center border border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-none">
            <ArrowRight size={12} weight="bold" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300 mb-0.5">REPL → target</div>
            <pre className="text-[11px] text-slate-800 dark:text-slate-200 bg-blue-50/40 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/30 rounded-none p-2 whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
{String(req.payload ?? '(no payload captured)')}
            </pre>
          </div>
        </div>
      )}
      {!resp && req && (
        <div className="flex items-center gap-2 pl-7 text-[10px] italic text-slate-400">
          <Spinner size={10} weight="bold" className="animate-spin text-blue-500" />
          awaiting target response…
        </div>
      )}
      {resp && <ResponseBubble resp={resp} />}
    </div>
  );
}

// Extract just the Assistant assistant reply from the SSE body. Strips all UI
// chrome (carousel pills, feedback controls, feedback submission, error
// widgets). Returns only what Assistant actually said.
function summarizeResponse(body) {
  if (!body) return { summary: '(empty response body)', isSse: false };
  const s = String(body);

  if (/\bevent:/.test(s) && /\bdata:/.test(s)) {
    const replyChunks = [];
    let hadSoftError = false;

    // Skip ONLY pure UI chrome. TextSubsections, Carousel, RelatedQuestions
    // all contain real response data (deflections + suggestions are still
    // Assistant's actual answer to the query).
    const pureChromeRe = /(feedback_controls|error_soft_landing)/i;
    const pureChromeClassRe = /^(FeedbackControls|ErrorSoftLanding|CustomerText)$/i;

    for (const line of s.split('\n')) {
      const m = line.match(/^data:(.*)$/);
      if (!m) continue;
      const payload = m[1].trim();
      if (!payload) continue;
      let obj;
      try { obj = JSON.parse(payload); } catch { continue; }

      if (/error_soft_landing|Sorry, something went wrong/.test(JSON.stringify(obj))) {
        hadSoftError = true;
      }

      // Look at sections[] — Assistant wraps each piece of content in a section
      const sections = obj.sections || (obj.content ? [obj] : []);
      for (const section of sections) {
        const groupId = String(section?.target?.groupId || section?.groupId || '');
        const sectionClass = String(section?.content?.sectionClass || '');
        // The data-section-class attr inside the HTML is the authoritative
        // class — parse it out since content.sectionClass is often empty.
        const html = section?.content?.data || section?.data || section?.html || '';
        const htmlClassMatch = html.match(/data-section-class="([^"]+)"/);
        const htmlClass = htmlClassMatch ? htmlClassMatch[1] : '';
        const anyClass = sectionClass || htmlClass;
        if (pureChromeRe.test(groupId) || pureChromeClassRe.test(anyClass)) continue;
        if (!html) continue;
        const text = html
          .replace(/<script[\s\S]*?<\/script>/g, '')
          .replace(/<style[\s\S]*?<\/style>/g, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
        // Filter out UI placeholder phrases that occasionally slip through
        if (!text || text.length < 6) continue;
        if (/^(Take a look at these suggested questions|What types of things can I ask|How can I help|What do you need help with today|Your feedback has been submitted|Select All That Apply|Dismiss|Submit)\b/i.test(text)) continue;
        replyChunks.push(text);
      }

      // Some Assistant payloads also put conversational text in a top-level
      // "response" or "messages" field — pick it up if present.
      if (typeof obj.response === 'string' && obj.response.length > 5) replyChunks.push(obj.response);
      if (Array.isArray(obj.messages)) {
        for (const msg of obj.messages) {
          if (msg?.content && typeof msg.content === 'string') replyChunks.push(msg.content);
        }
      }
    }

    // Dedupe by normalized prefix (strip markdown bold/underscore markers,
    // collapse whitespace, lowercase). Assistant streams progressively-extended
    // chunks but the markdown resolution between chunks breaks naive prefix
    // checks — normalization makes them comparable.
    const normalize = (s) => s.replace(/\*\*/g, '').replace(/__/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const deduped = Array.from(new Set(replyChunks));
    const withNorm = deduped.map((c) => ({ c, n: normalize(c) }));
    const maximal = withNorm.filter(({ c, n }) => !withNorm.some((other) => other.c !== c && other.n.length > n.length && other.n.startsWith(n))).map((x) => x.c);
    const reply = maximal.join('\n\n').trim();
    if (reply) return { summary: reply.slice(0, 5000), isSse: true };
    if (hadSoftError) {
      return { summary: 'No reply — Assistant returned a soft error (inference suppressed).', isSse: true };
    }
    return { summary: 'No reply — Assistant returned UI widgets only, no assistant generation.', isSse: true };
  }

  // JSON with a "response" or "content" field?
  try {
    const obj = JSON.parse(s);
    if (obj.response) return { summary: String(obj.response).slice(0, 2000), isSse: false };
    if (obj.content) return { summary: String(obj.content).slice(0, 2000), isSse: false };
    if (obj.choices?.[0]?.message?.content) {
      return { summary: String(obj.choices[0].message.content).slice(0, 2000), isSse: false };
    }
  } catch {}

  // HTML error page? Strip and show.
  if (/<!doctype\s+html|<html/i.test(s)) {
    const titleMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : 'HTML error page';
    return { summary: `⟨${title}⟩ — HTML body, ${s.length} chars (expand raw to view)`, isSse: false };
  }

  return { summary: s.slice(0, 2000), isSse: false };
}

function ResponseBubble({ resp }) {
  const [showRaw, setShowRaw] = useState(false);
  const { summary, isSse } = useMemo(() => summarizeResponse(resp.body), [resp.body]);
  return (
    <div className="flex items-start gap-2">
      <div className="shrink-0 mt-0.5 h-5 w-5 flex items-center justify-center border border-slate-400 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-none">
        <Robot size={12} weight="bold" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-0.5 flex items-center gap-2">
          <span>target → REPL</span>
          {resp.status ? <span className="font-mono normal-case text-slate-400">status {resp.status}</span> : null}
          {isSse ? <span className="font-mono normal-case text-slate-400">· sse parsed</span> : null}
          {resp.refusal ? <span className="font-mono normal-case text-slate-500">· refusal</span> : null}
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="ml-auto text-[9px] font-mono text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 rounded-none cursor-pointer normal-case"
          >
            {showRaw ? 'hide raw' : 'show raw'}
          </button>
        </div>
        <pre className="text-[11px] text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-none p-2 whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
{summary}
        </pre>
        {showRaw && (
          <pre className="mt-1 text-[10px] text-slate-500 dark:text-slate-500 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-none p-2 whitespace-pre-wrap break-words max-h-96 overflow-y-auto font-mono">
{String(resp.body ?? '(empty response body)')}
          </pre>
        )}
      </div>
    </div>
  );
}

function ServerStatus({ healthy }) {
  if (healthy === null) {
    return <span className="text-[10px] font-mono text-slate-400">checking runner…</span>;
  }
  if (healthy) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-blue-700 dark:text-blue-300 px-2 py-0.5 border border-blue-500/40 bg-blue-50/40 dark:bg-blue-500/10 rounded-none">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
        </span>
        LIVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 rounded-none">
      <X size={10} weight="bold" />
      runner offline
    </span>
  );
}

function RecentRunCard({ run }) {
  return (
    <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-none p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{run.label || run.scope}</span>
        <span className={`text-[10px] font-mono ${run.status === 'completed' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>
          {run.status}
        </span>
      </div>
      <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between">
        <span>{run.uuid}</span>
        <span>{run.finding_count ?? 0} finding{(run.finding_count ?? 0) === 1 ? '' : 's'}</span>
      </div>
      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
        {run.started_at && new Date(run.started_at).toLocaleTimeString()}
        {run.completed_at && ` → ${new Date(run.completed_at).toLocaleTimeString()}`}
      </div>
    </div>
  );
}

function ArchivedRunCard({ a }) {
  const [open, setOpen] = useState(false);
  const data = a.data;
  if (a.error || !data) {
    return (
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-none p-3">
        <div className="text-[11px] font-mono text-red-500">{a.label}: {a.error}</div>
      </div>
    );
  }
  // Bucket fine-grained severities into the five canonical tiers so multi-
  // word labels like "low-medium" get shown as "medium" in the header.
  const bucket = (sev) => {
    const s = (sev || 'info').toLowerCase();
    if (/critical/.test(s)) return 'critical';
    if (/high/.test(s)) return 'high';
    if (/medium/.test(s)) return 'medium';
    if (/low/.test(s)) return 'low';
    return 'info';
  };
  const counts = {};
  for (const f of data.findings ?? []) {
    const sev = bucket(f.severity);
    counts[sev] = (counts[sev] || 0) + 1;
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-500/5 rounded-none p-3 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Target size={14} weight="bold" className="text-slate-400" />
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{a.label}</span>
        </div>
        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1.5 truncate">
          {data.target_url || data.target || 'target'}
        </div>
        <div className="flex flex-wrap gap-1">
          {['critical', 'high', 'medium', 'low', 'info'].map((sev) => {
            const c = counts[sev] || 0;
            if (c === 0) return null;
            const s = SEV_STYLE[sev];
            return (
              <span key={sev} className={`inline-flex items-center gap-1 px-1.5 py-0.5 border rounded-none text-[9px] font-bold uppercase tracking-widest ${s.ring} ${s.text}`}>
                {sev} {c}
              </span>
            );
          })}
        </div>
        <div className="text-[10px] font-mono text-slate-400 mt-1.5 flex items-center justify-between">
          <span>{data.findings?.length ?? 0} finding{(data.findings?.length ?? 0) === 1 ? '' : 's'} — click to inspect</span>
          {data.timestamp && <span>{new Date(data.timestamp).toLocaleDateString()}</span>}
        </div>
      </button>
      {open && <ArchivedRunModal a={a} onClose={() => setOpen(false)} bucket={bucket} />}
    </>
  );
}

function ArchivedRunModal({ a, onClose, bucket }) {
  const [severityFilter, setSeverityFilter] = useState('all');
  const [query, setQuery] = useState('');
  const data = a.data;
  const findings = data.findings || [];
  const filtered = findings.filter((f) => {
    if (severityFilter !== 'all' && bucket(f.severity) !== severityFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (f.technique || '').toLowerCase().includes(q)
      || (f.evidence || '').toLowerCase().includes(q)
      || (f.owasp || '').toLowerCase().includes(q)
    );
  });
  const counts = {};
  for (const f of findings) {
    const sev = bucket(f.severity);
    counts[sev] = (counts[sev] || 0) + 1;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-none w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{a.label}</div>
            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              {data.target_url || data.target} · {findings.length} findings ·
              {data.timestamp ? ` ${new Date(data.timestamp).toLocaleString()}` : ''}
              {typeof data.duration_s === 'number' ? ` · ${data.duration_s}s run` : ''}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 p-1">
            <X size={18} weight="bold" />
          </button>
        </header>
        <div className="px-5 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 flex-wrap">
          {['all', 'critical', 'high', 'medium', 'low', 'info'].map((sev) => {
            const active = severityFilter === sev;
            const c = sev === 'all' ? findings.length : (counts[sev] || 0);
            if (sev !== 'all' && c === 0) return null;
            return (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border rounded-none cursor-pointer ${active ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-500'}`}
              >
                {sev} · {c}
              </button>
            );
          })}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter technique / evidence / owasp…"
            className="ml-auto text-[11px] font-mono px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-none outline-none focus:border-blue-500 min-w-[240px]"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {filtered.map((f, i) => {
            const sev = bucket(f.severity);
            const s = SEV_STYLE[sev] || SEV_STYLE.info;
            return (
              <div key={i} className={`border ${s.ring} p-3 rounded-none bg-slate-50/50 dark:bg-slate-950/60`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${s.ring} ${s.text}`}>
                    {f.severity || 'info'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-700 dark:text-slate-200">{f.technique || '(no technique)'}</span>
                  {f.technique_family && <span className="text-[9px] font-mono text-slate-400">· {f.technique_family}</span>}
                  {f.owasp && <span className="text-[9px] font-mono text-blue-600 dark:text-blue-400">· {f.owasp}</span>}
                </div>
                {f.evidence && (
                  <div className="mt-1">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-0.5">Extracted transcript</div>
                    <pre className="text-[11px] text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-2 whitespace-pre-wrap break-words font-mono">{f.evidence}</pre>
                  </div>
                )}
                {f.extracted_content && (
                  <div className="mt-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-slate-600 dark:text-slate-300">Extracted content:</span> {f.extracted_content}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 italic text-center py-10">
              no findings match the current filter
            </div>
          )}
        </div>
        <footer className="px-5 py-2 border-t border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between">
          <span>{filtered.length} of {findings.length} findings shown</span>
          <button
            onClick={() => {
              const lines = filtered.map((f) => `[${f.severity}] ${f.technique}${f.owasp ? ' (' + f.owasp + ')' : ''}\n  ${f.evidence || ''}\n`);
              const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `${a.id || 'findings'}-${Date.now()}.txt`;
              link.click();
              URL.revokeObjectURL(url);
            }}
            className="text-[10px] font-mono text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            export filtered → .txt
          </button>
        </footer>
      </div>
    </div>
  );
}
