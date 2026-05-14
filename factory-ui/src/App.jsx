import { useEffect, useRef, useState } from 'react';
import {
  Rocket, Robot, ArrowRight, Lightning, CheckCircle, XCircle, CircleNotch,
  Pulse, Globe, ChatText, Phone, ShieldCheck, CurrencyDollar, Buildings,
} from '@phosphor-icons/react';

// Backend URL — set VITE_FACTORY_API_URL in .env.production to point at the
// Mac-mini cloudflared tunnel (e.g. https://os26-api.pistonsolutions.ai). For
// local dev this falls back to localhost:7700.
const API_BASE = (import.meta.env.VITE_FACTORY_API_URL || 'http://localhost:7700').replace(/\/+$/, '');

const STAGES = [
  { id: 'research', label: 'Research', icon: Globe,    color: 'text-blue-400' },
  { id: 'adapt',    label: 'Adapt',    icon: Robot,    color: 'text-emerald-400' },
  { id: 'deploy',   label: 'Deploy',   icon: Rocket,   color: 'text-fuchsia-400' },
  { id: 'review',   label: 'Review',   icon: ShieldCheck, color: 'text-amber-400' },
  { id: 'notify',   label: 'Notify',   icon: Phone,    color: 'text-pink-400' },
];

function StageBadge({ stage, status }) {
  const meta = STAGES.find((s) => s.id === stage) || { label: stage, icon: ChatText, color: 'text-slate-400' };
  const Icon = meta.icon;
  const cls = status === 'running'
    ? 'bg-blue-900/30 text-blue-300 border-blue-700/50'
    : status === 'done'
      ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50'
      : status === 'failed'
        ? 'bg-rose-900/30 text-rose-300 border-rose-700/50'
        : 'bg-slate-800/40 text-slate-500 border-slate-700/40';
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 border ${cls} text-[10px] font-mono uppercase tracking-widest`}>
      {status === 'running' ? <CircleNotch size={10} weight="bold" className="animate-spin" /> : <Icon size={10} weight="bold" />}
      {meta.label}
    </div>
  );
}

function EventRow({ event }) {
  const sevCls = event.flagged ? 'border-l-rose-500 bg-rose-900/10' : 'border-l-slate-700/60';
  return (
    <div className={`pl-3 py-1.5 border-l-2 ${sevCls} text-[11px]`}>
      <div className="flex items-center gap-2">
        <StageBadge stage={event.stage} status={event.flagged ? 'failed' : 'done'} />
        <span className="font-mono text-slate-500 text-[10px]">{event.tool || '—'}</span>
        {event.flagged && (
          <span className="ml-auto text-rose-400 font-bold text-[10px] uppercase tracking-widest">⚠ blocked</span>
        )}
      </div>
      {event.summary && (
        <div className="mt-0.5 text-slate-300">{event.summary}</div>
      )}
      {event.input && (
        <pre className="mt-1 font-mono text-[10px] text-slate-500 whitespace-pre-wrap max-h-32 overflow-auto">
          {JSON.stringify(event.input, null, 2).slice(0, 600)}
        </pre>
      )}
    </div>
  );
}

export default function App() {
  const [customer, setCustomer] = useState('');
  const [url, setUrl] = useState('');
  const [runId, setRunId] = useState(null);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [stagingUrl, setStagingUrl] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [runsThisSession, setRunsThisSession] = useState(0);
  const tickRef = useRef(null);
  const logRef = useRef(null);

  // Auto-scroll the event log.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events]);

  useEffect(() => {
    if (running) {
      tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [running]);

  const fire = async () => {
    if (!customer.trim()) return;
    setRunning(true);
    setEvents([]);
    setStagingUrl(null);
    setVerdict(null);
    setError(null);
    setElapsed(0);

    let response;
    try {
      response = await fetch(`${API_BASE}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: customer.trim(), url: url.trim() || null }),
      });
    } catch (e) {
      setError(`Backend unreachable: ${e.message}. Set VITE_FACTORY_API_URL.`);
      setRunning(false);
      return;
    }
    if (!response.ok) {
      setError(`POST /run HTTP ${response.status}`);
      setRunning(false);
      return;
    }
    const { runId: newRunId } = await response.json();
    setRunId(newRunId);

    // Stream events via SSE
    const es = new EventSource(`${API_BASE}/run/${newRunId}/events`);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data);
        if (ev.type === 'event') {
          setEvents((prev) => [...prev, ev.data]);
        } else if (ev.type === 'staging_url') {
          setStagingUrl(ev.data.url);
        } else if (ev.type === 'verdict') {
          setVerdict(ev.data);
        } else if (ev.type === 'done') {
          setRunning(false);
          setRunsThisSession((n) => n + 1);
          es.close();
        } else if (ev.type === 'error') {
          setError(ev.data.message);
          setRunning(false);
          es.close();
        }
      } catch {}
    };
    es.onerror = () => {
      // Best-effort: SSE may close after `done`
      es.close();
    };
  };

  const savedHours = (runsThisSession * 90) / 60;
  const savedDollars = runsThisSession * 90 * (150 / 60);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Buildings size={18} weight="bold" className="text-blue-400" />
            <span className="font-bold tracking-tight text-slate-100">OS26</span>
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 ml-1">demo factory</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <a href="https://bastion.pistonsolutions.ai" target="_blank" rel="noopener" className="hover:text-slate-200">Bastion →</a>
            <a href="https://staging.demo.pistonsolutions.ai" target="_blank" rel="noopener" className="hover:text-slate-200">staging.demo →</a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8">
        {/* Left: input + summary */}
        <section className="space-y-6">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-blue-400 mb-2">os26 · demo factory</div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight leading-tight">Ship a personalized Bastion demo in seconds.</h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Type a prospect company. We research them, classify the segment (dev / insurance / compliance), and personalize the matching demo at <code className="font-mono text-blue-400">staging.demo.pistonsolutions.ai</code>. SMS lands when it's done.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Prospect company</span>
              <input
                type="text"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Investcorp"
                disabled={running}
                className="mt-1 w-full bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">URL <span className="text-slate-600">(optional — we'll infer)</span></span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.investcorp.com"
                disabled={running}
                className="mt-1 w-full bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              />
            </label>
            <button
              onClick={fire}
              disabled={running || !customer.trim()}
              className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold uppercase tracking-widest text-[11px] py-2.5 transition-colors"
            >
              {running
                ? <><CircleNotch size={14} weight="bold" className="animate-spin" /> running… {elapsed}s</>
                : <><Lightning size={14} weight="bold" /> Fire factory run</>}
            </button>
          </div>

          {/* Run summary */}
          <div className="border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Session impact</div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-slate-100">{runsThisSession}</span>
              <span className="text-[11px] text-slate-500">demos shipped</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-xl font-bold text-emerald-400">{savedHours.toFixed(1)}h</span>
              <span className="text-[11px] text-slate-500">founder time displaced</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-xl font-bold text-emerald-400 inline-flex items-center">
                <CurrencyDollar size={16} weight="bold" />{savedDollars.toFixed(0)}
              </span>
              <span className="text-[11px] text-slate-500">opportunity savings @ $150/h</span>
            </div>
          </div>

          {/* Result panel */}
          {stagingUrl && (
            <div className="border border-emerald-700/40 bg-emerald-900/10 p-4 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">Demo live</div>
              <a href={stagingUrl} target="_blank" rel="noopener" className="block text-sm font-mono text-emerald-300 hover:underline truncate">
                {stagingUrl}
                <ArrowRight size={12} weight="bold" className="inline ml-1" />
              </a>
              {verdict && (
                <div className="text-[11px] text-slate-400">
                  <span className="font-bold text-slate-200">{verdict.verdict}</span> · {verdict.reasoning}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="border border-rose-700/40 bg-rose-900/10 p-3 text-[11px] text-rose-300">
              {error}
            </div>
          )}
        </section>

        {/* Right: live event log */}
        <section className="border border-slate-800 bg-slate-950 flex flex-col min-h-[500px]">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
            <Pulse size={14} weight="bold" className={running ? 'text-blue-400 animate-pulse' : 'text-slate-500'} />
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300">Live agent log</h2>
            {running && <span className="text-[10px] font-mono text-slate-500">run {runId?.slice(0, 12)}…</span>}
            <a
              href="https://bastion.pistonsolutions.ai"
              target="_blank"
              rel="noopener"
              className="ml-auto text-[10px] font-mono text-slate-500 hover:text-blue-400"
            >Bastion Live Activity →</a>
          </div>
          <div ref={logRef} className="flex-1 overflow-auto p-3 space-y-1.5">
            {events.length === 0 && !running && (
              <div className="text-[12px] text-slate-500 italic p-3">
                Type a prospect and click <strong>Fire factory run</strong>. Every tool call from the Research, Adapt, Deploy, Review, and Notify agents lands here in real time. Blocked tool calls (e.g. prompt injection caught by Bastion) appear in red.
              </div>
            )}
            {events.length === 0 && running && (
              <div className="text-[12px] text-slate-500 italic p-3 inline-flex items-center gap-2">
                <CircleNotch size={12} weight="bold" className="animate-spin" /> spawning agents…
              </div>
            )}
            {events.map((e, i) => <EventRow key={i} event={e} />)}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 text-[10px] text-slate-500">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <span>OS26 · Build OS26 @ Mila · 5h hackathon</span>
          <span className="font-mono">backend: {API_BASE}</span>
        </div>
      </footer>
    </div>
  );
}
