import { useEffect, useState } from 'react';
import { Network, Warning, ArrowSquareOut } from '@phosphor-icons/react';
import { useIsTenant } from '../../data/useIsTenant';

// Live WebSockets — operator/observability view of every active call
// the voice gateway is currently streaming. Polls
// `${VOICE_GATEWAY_URL}/v1/calls/active` every 2 s and renders one row
// per live `call_control_id` with per-direction frame counts, history
// backlog, subscriber count, and uptime. Useful for spotting:
//   - Stalled calls (frame count not advancing)
//   - One-way audio (only inbound or only outbound advancing)
//   - Listener attached vs none (subscriber_count)
//   - Carrier disconnects (call disappears from the list)
//
// The Live Voice view (LiveVoiceView.jsx) is the customer-facing
// listen-and-watch surface; this view is the engineer-facing
// telemetry. Both share the same underlying gateway.

const DEFAULT_GATEWAY = 'https://voice-demo.pistonsolutions.ai';
const POLL_MS = 2000;

export default function LiveSocketsView() {
  const isTenant = useIsTenant();
  const gateway = (import.meta.env.VITE_VOICE_GATEWAY_URL || DEFAULT_GATEWAY).replace(/\/+$/, '');
  const url = `${gateway}/v1/calls/active`;

  const [state, setState] = useState({ status: 'connecting', calls: [], lastFetch: null });

  useEffect(() => {
    if (isTenant) return; // /v1/calls/active is gateway-wide, leaks other orgs
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(url, { mode: 'cors' });
        if (cancelled) return;
        if (!r.ok) {
          setState((s) => ({ ...s, status: 'error', error: `HTTP ${r.status}` }));
          return;
        }
        const json = await r.json();
        setState({
          status: 'ok',
          calls: Array.isArray(json.calls) ? json.calls : [],
          lastFetch: Date.now(),
        });
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, status: 'error', error: String(e.message || e) }));
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url, isTenant]);

  if (isTenant) {
    return (
      <div className="flex flex-col h-full">
        <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Network size={18} weight="bold" className="text-blue-500" /> Live WebSockets
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time call telemetry from the voice gateway, scoped to your org.
          </p>
        </header>
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="max-w-md text-center">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
              No active calls for your org
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Per-org call filtering is wired through Voice Testing → Spawn Probe.
              Probes you spawn from there render their live state here once
              the gateway exposes org-scoped /v1/calls/active.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network size={22} className="text-blue-600 dark:text-blue-400" weight="duotone" />
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Live WebSockets</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time view of every voice gateway WS — frame counts, listeners, uptime
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill state={state} />
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1"
            title="Open the raw JSON in a new tab"
          >
            JSON <ArrowSquareOut size={12} />
          </a>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {state.status === 'error' ? (
          <ErrorPanel gateway={gateway} error={state.error} />
        ) : state.calls.length === 0 ? (
          <EmptyPanel />
        ) : (
          <SocketsTable calls={state.calls} gateway={gateway} />
        )}
      </div>
    </div>
  );
}

function StatusPill({ state }) {
  if (state.status === 'connecting') {
    return (
      <span className="text-[10px] uppercase tracking-widest font-mono px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
        Connecting…
      </span>
    );
  }
  if (state.status === 'error') {
    return (
      <span className="text-[10px] uppercase tracking-widest font-mono px-2 py-1 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
        Gateway offline
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-widest font-mono px-2 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
      {state.calls.length === 0 ? 'No active sockets' : `${state.calls.length} socket${state.calls.length === 1 ? '' : 's'}`}
    </span>
  );
}

function SocketsTable({ calls, gateway }) {
  return (
    <div className="px-6 py-4">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <th className="px-3 py-2 font-semibold">Call ID</th>
            <th className="px-3 py-2 font-semibold text-right">Age</th>
            <th className="px-3 py-2 font-semibold text-right">Frames</th>
            <th className="px-3 py-2 font-semibold text-right">In</th>
            <th className="px-3 py-2 font-semibold text-right">Out</th>
            <th className="px-3 py-2 font-semibold text-right">History</th>
            <th className="px-3 py-2 font-semibold text-right">Subs</th>
            <th className="px-3 py-2 font-semibold text-right">Listen</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <SocketRow key={c.call_control_id} call={c} gateway={gateway} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SocketRow({ call, gateway }) {
  const { call_control_id, age_ms, total_frames, inbound_frames, outbound_frames, history_frames, subscriber_count } = call;
  const ageStr = formatAge(age_ms);
  const idShort = shortId(call_control_id);
  // Heuristic flow-asymmetry pill: a healthy paired probe shows both
  // inbound and outbound advancing; a one-way flow is suspicious.
  const flowOk = inbound_frames > 0 && outbound_frames > 0;
  // Deep-link to the listen widget with this call_id pre-selected.
  // The listen page reads the query param on load and auto-starts.
  const listenUrl = `${gateway}/listen?call_id=${encodeURIComponent(call_control_id)}`;
  const openListen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Open in a new tab. The page autoplays the call; AudioContext
    // gesture is satisfied because this click counts.
    window.open(listenUrl, `_listen_${call_control_id}`, 'noopener,noreferrer');
  };
  return (
    <tr
      onClick={openListen}
      className="border-b border-slate-100 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer"
      title="Drop in and listen"
    >
      <td className="px-3 py-2 text-slate-800 dark:text-slate-100" title={call_control_id}>
        <span className={`mr-2 inline-block w-2 h-2 rounded-full ${flowOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        {idShort}
      </td>
      <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{ageStr}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-800 dark:text-slate-200">{total_frames.toLocaleString()}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{inbound_frames.toLocaleString()}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{outbound_frames.toLocaleString()}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-500">{history_frames.toLocaleString()}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{subscriber_count}</td>
      <td className="px-3 py-2 text-right">
        <a
          href={listenUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          ▶
        </a>
      </td>
    </tr>
  );
}

function shortId(id) {
  if (!id) return '';
  if (id.length <= 28) return id;
  return id.slice(0, 14) + '…' + id.slice(-10);
}

function formatAge(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m${String(rs).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${String(rm).padStart(2, '0')}m`;
}

function EmptyPanel() {
  return (
    <div className="h-full flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <Network size={28} className="mx-auto text-slate-400 dark:text-slate-600 mb-3" weight="duotone" />
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-2">
          No active WebSockets
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          The gateway is reachable but no voice probes are currently streaming. Originate a call via
          <code className="mx-1 text-slate-700 dark:text-slate-300">/v1/test/originate</code> or
          <code className="mx-1 text-slate-700 dark:text-slate-300">/v1/test/agent-vs-agent</code>
          and rows will appear here within 2 seconds.
        </p>
      </div>
    </div>
  );
}

function ErrorPanel({ gateway, error }) {
  return (
    <div className="h-full flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <Warning size={28} className="mx-auto text-rose-500 mb-3" weight="duotone" />
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-2">
          Voice gateway unreachable
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Could not reach <code className="text-slate-700 dark:text-slate-300">{gateway}</code>
          {error ? <> — {error}</> : null}. Update <code>VITE_VOICE_GATEWAY_URL</code> in the deploy
          env when the cloudflared tunnel rotates.
        </p>
      </div>
    </div>
  );
}
