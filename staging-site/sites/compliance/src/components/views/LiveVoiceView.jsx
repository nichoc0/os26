import { useState, useEffect } from 'react';
import { Phone, ArrowSquareOut, Warning } from '@phosphor-icons/react';
import { useVoiceToken } from '../../data/useVoiceToken';

// Live Voice — surfaces the voice gateway's listen widget inside the
// dashboard. The widget itself (audio replay + live transcripts +
// active-call list) lives in the voice-gateway repo and is served at
// `/listen`; we embed it as an iframe so customers can watch their
// running adversarial probes from bastion.pistonsolutions.ai without
// leaving the dashboard. WebSocket framing is preserved (Vercel
// rewrites can't proxy WS reliably; iframe sidesteps that entirely).
//
// Org-scoping: we forward the org's bk_* (minted on demand via
// useVoiceToken) to /listen as a `?bearer=` query param. The gateway
// filters /v1/calls/active and the /v1/listen/<id> WS gate by that
// bearer (registered when /v1/test/originate captured the
// Authorization header). Result: each tenant sees only their own
// in-flight Telnyx + ava calls inside the same dashboard pane.
//
// The gateway URL is configurable per-deploy via VITE_VOICE_GATEWAY_URL
// (Vite reads it at build time). Defaults to the current cloudflared
// tunnel — update the env when the tunnel rotates and redeploy.

const DEFAULT_GATEWAY = 'https://voice-demo.pistonsolutions.ai';

export default function LiveVoiceView({ embedded = false } = {}) {
  const { apiKey: bearer, status: bearerStatus } = useVoiceToken();
  const gateway = (import.meta.env.VITE_VOICE_GATEWAY_URL || DEFAULT_GATEWAY).replace(/\/+$/, '');
  const listenUrl = bearer
    ? `${gateway}/listen?bearer=${encodeURIComponent(bearer)}`
    : `${gateway}/listen`;
  const activeCallsUrl = bearer
    ? `${gateway}/v1/calls/active?bearer=${encodeURIComponent(bearer)}`
    : `${gateway}/v1/calls/active`;

  const [reachable, setReachable] = useState(null);
  const [activeCount, setActiveCount] = useState(null);

  useEffect(() => {
    // Wait for the bk_* mint before polling. Polling without it would
    // surface gateway-wide calls (cross-tenant leak); the request loop
    // will retry once the hook resolves.
    if (bearerStatus !== 'ready' || !bearer) return;
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch(activeCallsUrl, { mode: 'cors' });
        if (cancelled) return;
        if (!r.ok) {
          setReachable(false);
          return;
        }
        const json = await r.json();
        setReachable(true);
        setActiveCount(Array.isArray(json.calls) ? json.calls.length : 0);
      } catch {
        if (!cancelled) setReachable(false);
      }
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeCallsUrl, bearer, bearerStatus]);

  // Embedded mount (Calls panel): strip the section header — the parent
  // already names this panel — and replace the verbose unreachable hint
  // with a one-line empty state. Functionality identical otherwise.
  if (embedded) {
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
        <div className="px-3 py-2 flex items-center justify-end gap-2 text-[10px] uppercase tracking-widest">
          <StatusPill reachable={reachable} activeCount={activeCount} compact />
          <a
            href={listenUrl}
            target="_blank"
            rel="noreferrer"
            className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 font-semibold"
            title="Open the listen widget in a new tab"
          >
            New tab <ArrowSquareOut size={10} />
          </a>
        </div>
        <div className="flex-1 overflow-hidden">
          {reachable === false ? (
            <CompactEmpty message="No active calls" sub="Live audio + transcript will appear here when a probe is running." />
          ) : reachable === true && activeCount === 0 ? (
            <CompactEmpty message="No active calls" sub="Spawn a probe to see audio + transcript stream in here live." />
          ) : (
            <iframe
              title="Bastion live voice listen widget"
              src={listenUrl}
              className="w-full h-full border-0"
              allow="autoplay; microphone"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Phone size={22} className="text-blue-600 dark:text-blue-400" weight="duotone" />
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Live Voice</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time audio + transcript view of voice probes running against your agents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill reachable={reachable} activeCount={activeCount} />
          <a
            href={listenUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1"
            title="Open the listen widget in a new tab"
          >
            Open in new tab <ArrowSquareOut size={12} />
          </a>
        </div>
      </div>
      <div className="flex-1 bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {reachable === false ? (
          <UnreachableHint gateway={gateway} />
        ) : (
          <iframe
            title="Bastion live voice listen widget"
            src={listenUrl}
            className="w-full h-full border-0"
            allow="autoplay; microphone"
          />
        )}
      </div>
    </div>
  );
}

function CompactEmpty({ message, sub }) {
  return (
    <div className="h-full min-h-[200px] flex items-center justify-center px-6 py-10 text-center">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">{message}</div>
        {sub && <div className="text-[11px] text-slate-400 dark:text-slate-500 max-w-xs">{sub}</div>}
      </div>
    </div>
  );
}

function StatusPill({ reachable, activeCount, compact = false }) {
  const cls = compact
    ? 'text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded-none'
    : 'text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded-none';
  if (reachable === null) {
    return <span className={`${cls} bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400`}>Connecting…</span>;
  }
  if (reachable === false) {
    // Compact mode hides the gateway-offline badge entirely — the
    // CompactEmpty body already explains "no active calls" and the
    // raw offline state is noise for the operator.
    if (compact) return null;
    return <span className={`${cls} bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300`}>Gateway offline</span>;
  }
  return (
    <span className={`${cls} bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300`}>
      {activeCount === 0 ? 'No active calls' : `${activeCount} active`}
    </span>
  );
}

function UnreachableHint({ gateway }) {
  return (
    <div className="h-full flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <Warning size={28} className="mx-auto text-rose-500 mb-3" weight="duotone" />
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-2">
          Voice gateway unreachable
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Could not reach <code className="text-slate-700 dark:text-slate-300">{gateway}</code>. The
          tunnel may have rotated; update <code>VITE_VOICE_GATEWAY_URL</code> in the deploy env and
          redeploy. If you're running the gateway locally, confirm it's listening on port 8080.
        </p>
      </div>
    </div>
  );
}
