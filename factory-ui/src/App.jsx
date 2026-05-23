import { useEffect, useRef, useState } from 'react';
import {
  Globe, Robot, GithubLogo, ShieldCheck, Phone, Lightning, CircleNotch,
  CheckCircle, XCircle, ArrowSquareOut, Buildings, CaretRight, CaretDown,
  FileText, Eye, Pulse, ArrowRight, Code,
} from '@phosphor-icons/react';

const API_BASE = (import.meta.env.VITE_FACTORY_API_URL || 'http://localhost:7700').replace(/\/+$/, '');

const AGENTS = [
  { id: 'research', label: 'Research',   icon: Globe, desc: '~10 web searches · classifies prospect into dev/insurance/compliance · pulls brand + logo' },
  { id: 'frontend', label: 'Frontend',   icon: Robot, desc: 'Picks segment · writes customer.json · adapts seed data · vercel --prod · self-QA' },
  { id: 'notify',   label: 'Notify',     icon: Phone, desc: 'SMS via Telnyx with the staging URL' },
];

const STATUS_STYLES = {
  idle:    { dot: 'bg-slate-300',   text: 'text-slate-400',  border: 'border-slate-200', badge: 'bg-slate-100 text-slate-500' },
  running: { dot: 'bg-blue-500',    text: 'text-blue-700',   border: 'border-blue-400',  badge: 'bg-blue-100 text-blue-700' },
  done:    { dot: 'bg-emerald-500', text: 'text-emerald-700',border: 'border-emerald-400', badge: 'bg-emerald-100 text-emerald-700' },
  failed:  { dot: 'bg-rose-500',    text: 'text-rose-700',   border: 'border-rose-400',  badge: 'bg-rose-100 text-rose-700' },
};

function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function AgentRow({ agent, state, expanded, onToggle, position }) {
  const Icon = agent.icon;
  const s = STATUS_STYLES[state.status] || STATUS_STYLES.idle;
  const isRunning = state.status === 'running';
  return (
    <div className={`border ${s.border} bg-white transition-colors`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60">
        <span className="text-[10px] font-mono text-slate-400 tabular-nums w-5">{String(position).padStart(2,'0')}</span>
        <div className={`w-2 h-2 rounded-full ${s.dot} ${isRunning ? 'animate-pulse' : ''}`} />
        <div className={`shrink-0 w-8 h-8 flex items-center justify-center bg-white border ${s.border}`}>
          {isRunning
            ? <CircleNotch size={14} weight="bold" className="animate-spin text-blue-500" />
            : state.status === 'done'
              ? <CheckCircle size={14} weight="bold" className="text-emerald-500" />
              : state.status === 'failed'
                ? <XCircle size={14} weight="bold" className="text-rose-500" />
                : <Icon size={14} weight="bold" className="text-slate-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-slate-800">{agent.label}</h3>
            <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 ${s.badge}`}>{state.status}</span>
            {state.elapsedMs != null && state.elapsedMs > 0 && (
              <span className="ml-auto text-[10px] font-mono text-slate-400 tabular-nums">{(state.elapsedMs / 1000).toFixed(1)}s</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            {state.lastSummary || agent.desc}
          </div>
        </div>
        {expanded ? <CaretDown size={11} weight="bold" className="text-slate-400" /> : <CaretRight size={11} weight="bold" className="text-slate-400" />}
      </button>
      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50/40 px-4 py-3 space-y-2">
          {state.events.length === 0
            ? <div className="text-[11px] text-slate-400 italic">No activity yet.</div>
            : state.events.map((e, i) => (
                <div key={i} className={`pl-3 py-1 border-l-2 ${e.flagged ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300'}`}>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="font-mono text-slate-500">{e.tool || '—'}</span>
                    {e.flagged && <span className="text-rose-600 font-bold uppercase tracking-widest">⚠ blocked</span>}
                    <span className="ml-auto font-mono text-slate-400">{fmtTs(e.ts)}</span>
                  </div>
                  {e.summary && <div className="mt-0.5 text-[11px] text-slate-700">{e.summary}</div>}
                  {e.input && Object.keys(e.input).length > 0 && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-slate-500 cursor-pointer select-none">payload</summary>
                      <pre className="font-mono text-[10px] text-slate-600 whitespace-pre-wrap max-h-40 overflow-auto bg-white border border-slate-200 p-2 mt-1">{JSON.stringify(e.input, null, 2).slice(0, 1400)}</pre>
                    </details>
                  )}
                </div>
              ))}
        </div>
      )}
    </div>
  );
}

function OutputBlock({ title, content, icon: Icon }) {
  return (
    <div className="border border-slate-200 bg-white">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
        {Icon && <Icon size={12} weight="bold" className="text-slate-500" />}
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{title}</span>
      </div>
      <pre className="px-3 py-3 font-mono text-[10px] text-slate-700 whitespace-pre-wrap max-h-72 overflow-auto">{content}</pre>
    </div>
  );
}

/**
 * PipelineGraph — vertical 3-node flow chart. Each node = a Factory agent.
 * Status drives visuals: idle (dim outline), running (pulsing ring + animated
 * dot flowing along incoming edge), done (filled green check), failed (red X).
 * The edge between two nodes animates a traveling dot whenever the upstream
 * node has finished and the downstream is running.
 */
function PipelineGraph({ agents, agentStates }) {
  return (
    <div className="px-5 py-6 select-none">
      <div className="relative flex flex-col items-stretch">
        {agents.map((agent, i) => {
          const state = agentStates[agent.id];
          const prev = i > 0 ? agentStates[agents[i - 1].id] : null;
          const Icon = agent.icon;
          const isRunning = state.status === 'running';
          const isDone = state.status === 'done';
          const isFailed = state.status === 'failed';
          const isIdle = state.status === 'idle';
          // edge is "active" (flowing) when upstream is done AND this node is running
          const edgeActive = prev && prev.status === 'done' && isRunning;
          const edgeDone = prev && prev.status === 'done' && (isDone || isFailed);

          return (
            <div key={agent.id} className="relative">
              {/* Incoming edge (skip for first node) */}
              {i > 0 && (
                <div className="relative h-7 ml-6 flex items-center">
                  <div className={`w-0.5 h-full ${edgeDone ? 'bg-emerald-400' : edgeActive ? 'bg-blue-300' : 'bg-slate-200'} relative overflow-hidden`}>
                    {edgeActive && (
                      <div
                        className="absolute left-0 right-0 h-2 bg-blue-500"
                        style={{
                          animation: 'edgeFlow 1.4s linear infinite',
                          top: '-8px',
                        }}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Node */}
              <div className="flex items-stretch gap-3">
                {/* Node circle */}
                <div className="relative shrink-0 w-12 flex items-start justify-center">
                  {/* outer pulse ring when running */}
                  {isRunning && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-blue-400/30 animate-ping" />
                  )}
                  <div
                    className={`relative z-10 w-12 h-12 rounded-full border-2 flex items-center justify-center transition-colors
                      ${isDone ? 'bg-emerald-500 border-emerald-500 text-white' :
                        isFailed ? 'bg-rose-500 border-rose-500 text-white' :
                        isRunning ? 'bg-white border-blue-500 text-blue-600' :
                        'bg-white border-slate-300 text-slate-400'}`}
                  >
                    {isDone
                      ? <CheckCircle size={22} weight="fill" />
                      : isFailed
                        ? <XCircle size={22} weight="fill" />
                        : isRunning
                          ? <CircleNotch size={18} weight="bold" className="animate-spin" />
                          : <Icon size={18} weight="bold" />}
                  </div>
                </div>
                {/* Label + status */}
                <div className="flex-1 min-w-0 pt-1.5 pb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-bold ${isIdle ? 'text-slate-400' : 'text-slate-800'}`}>{agent.label}</span>
                    {isRunning && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-blue-600">
                        <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                        in flight
                      </span>
                    )}
                    {isDone && state.elapsedMs != null && (
                      <span className="text-[10px] font-mono text-emerald-600 tabular-nums">{(state.elapsedMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                  <div className={`text-[11px] mt-0.5 leading-snug ${isIdle ? 'text-slate-400' : 'text-slate-500'}`}>
                    {state.lastSummary || agent.desc}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Inject edge-flow keyframes once. */}
      <style>{`
        @keyframes edgeFlow {
          0%   { transform: translateY(-8px); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateY(28px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default function App() {
  const [customer, setCustomer] = useState('');
  const [company, setCompany] = useState('');
  const FORCED_SEGMENT = 'dev'; // hardcoded — every run goes to /dev
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(null);
  const [error, setError] = useState(null);
  const [stagingUrl, setStagingUrl] = useState(null);
  const [allEvents, setAllEvents] = useState([]); // for the timeline
  const [agentStates, setAgentStates] = useState(() =>
    Object.fromEntries(AGENTS.map((a) => [a.id, { status: 'idle', lastSummary: null, events: [], startedAt: null, elapsedMs: null }]))
  );
  const [expanded, setExpanded] = useState({});
  const [outputs, setOutputs] = useState({ research: null, frontend: null });

  // Poll factory-server health.
  const [backendUp, setBackendUp] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(`${API_BASE}/healthz`, { cache: 'no-store' });
        if (!cancelled) setBackendUp(r.ok);
      } catch { if (!cancelled) setBackendUp(false); }
    };
    check();
    const id = setInterval(check, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const fire = async () => {
    if (!customer.trim() || running) return;
    setRunning(true); setError(null); setStagingUrl(null);
    setAllEvents([]);
    setOutputs({ research: null, frontend: null });
    setAgentStates(Object.fromEntries(AGENTS.map((a) => [a.id, { status: 'idle', lastSummary: null, events: [], startedAt: null, elapsedMs: null }])));
    setExpanded({ research: true });

    let resp;
    try {
      resp = await fetch(`${API_BASE}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: customer.trim(),
          company: company.trim() || undefined,
          segment: FORCED_SEGMENT,
        }),
      });
    } catch (e) { setError(`Backend unreachable: ${e.message}`); setRunning(false); return; }
    if (!resp.ok) { setError(`HTTP ${resp.status} from /run`); setRunning(false); return; }
    const { runId: id } = await resp.json();
    setRunId(id);

    const es = new EventSource(`${API_BASE}/run/${id}/events`);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data);
        if (ev.type === 'event') {
          const e = { ...ev.data, ts: ev.ts };
          setAllEvents((prev) => [...prev, e]);
          setAgentStates((prev) => {
            const next = { ...prev };
            const key = AGENTS.find((a) => a.id === e.stage) ? e.stage : null;
            if (key) {
              const cur = next[key];
              const startedAt = cur.startedAt || ev.ts || Date.now();
              next[key] = {
                ...cur,
                status: e.flagged ? cur.status : 'running',
                lastSummary: e.summary || cur.lastSummary,
                events: [...cur.events, e],
                startedAt,
                elapsedMs: (ev.ts || Date.now()) - startedAt,
              };
              const idx = AGENTS.findIndex((a) => a.id === key);
              for (let i = 0; i < idx; i++) {
                if (next[AGENTS[i].id].status === 'running') {
                  next[AGENTS[i].id] = { ...next[AGENTS[i].id], status: 'done' };
                }
              }
            }
            return next;
          });
          // Capture outputs (last event with input.input bigger payload)
          if (e.stage === 'research' && e.tool === 'classify') {
            setOutputs((o) => ({ ...o, research: JSON.stringify(e.input, null, 2) }));
          }
          if (e.stage === 'frontend' && e.tool === 'vercel') {
            setOutputs((o) => ({ ...o, frontend: JSON.stringify(e.input, null, 2) }));
          }
        } else if (ev.type === 'staging_url') {
          setStagingUrl(ev.data.url);
        } else if (ev.type === 'done') {
          setRunning(false);
          setAgentStates((p) => {
            const next = { ...p };
            for (const id of Object.keys(next)) if (next[id].status === 'running') next[id].status = 'done';
            return next;
          });
          es.close();
        } else if (ev.type === 'error') {
          setError(ev.data?.message || 'unknown'); setRunning(false); es.close();
        }
      } catch {}
    };
    es.onerror = () => es.close();
  };

  return (
    <div className="min-h-screen tech-grid">
      {/* top bar */}
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Buildings size={18} weight="bold" className="text-blue-500" />
            <span className="font-bold tracking-tight text-slate-900">OS26</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 ml-1">demo factory · mission control</span>
          </div>
          <div className="flex items-center gap-4 text-[12px]">
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest ${backendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${backendUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {backendUp ? 'backend live' : 'backend down'}
            </span>
            <a href="https://staging.demo.pistonsolutions.ai" target="_blank" rel="noopener" className="text-slate-500 hover:text-blue-600">staging</a>
            <a href="https://github.com/nichoc0/os26" target="_blank" rel="noopener" className="text-slate-500 hover:text-blue-600">github</a>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Hero — single input, no fluff */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Demo factory</h1>
          <p className="mt-1.5 text-[13px] text-slate-600 max-w-3xl leading-relaxed">
            Drop a prospect's name and their company. Two agents — Research and Frontend — coordinate to ship a personalized Bastion demo at <code className="font-mono text-blue-600 text-[12px]">staging.demo.pistonsolutions.ai</code>, then SMS the URL.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] items-stretch gap-3 max-w-3xl">
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fire()}
              placeholder="Name"
              disabled={running}
              className="bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fire()}
              placeholder="Company"
              disabled={running}
              className="bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <button
              onClick={fire}
              disabled={running || !customer.trim()}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold uppercase tracking-widest text-[11px] px-6 transition-colors"
            >
              {running ? <><CircleNotch size={14} weight="bold" className="animate-spin" /> running</> : <><Lightning size={14} weight="bold" /> Fire run</>}
            </button>
          </div>
          {runId && <div className="mt-1.5 text-[11px] font-mono text-slate-400">run {runId}</div>}
        </div>

        {/* Result banner */}
        {(stagingUrl || error) && (
          <div className={`mb-6 border ${error ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50'} p-3.5`}>
            {error
              ? <div className="text-[12px] text-rose-700"><strong>Run failed:</strong> {error}</div>
              : (
                <div className="flex items-center gap-3">
                  <CheckCircle size={18} weight="bold" className="text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-700">Demo live</div>
                    <a href={stagingUrl} target="_blank" rel="noopener" className="text-sm font-mono text-emerald-800 hover:underline truncate block">
                      {stagingUrl} <ArrowSquareOut size={11} weight="bold" className="inline ml-1" />
                    </a>
                  </div>
                </div>
              )}
          </div>
        )}

        {/* 3-column mission control: Agents, Timeline, Outputs */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr_1fr] gap-5">
          {/* Agents column */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Pulse size={13} weight="bold" className={running ? 'text-blue-500 animate-pulse' : 'text-slate-400'} />
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700">Agents</h2>
              <span className="text-[10px] text-slate-400">click to expand</span>
            </div>
            <div className="space-y-2">
              {AGENTS.map((agent, i) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  state={agentStates[agent.id]}
                  expanded={!!expanded[agent.id]}
                  position={i + 1}
                  onToggle={() => setExpanded((e) => ({ ...e, [agent.id]: !e[agent.id] }))}
                />
              ))}
            </div>
          </section>

          {/* Pipeline graph column */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700">Pipeline</h2>
              <span className="text-[10px] text-slate-400">{allEvents.length > 0 ? `${allEvents.length} events streamed` : 'idle'}</span>
            </div>
            <div className="border border-slate-200 bg-white min-h-[500px]">
              <PipelineGraph agents={AGENTS} agentStates={agentStates} />
            </div>
          </section>

          {/* Outputs column */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Eye size={13} weight="bold" className="text-slate-500" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700">Outputs</h2>
            </div>
            <div className="space-y-3">
              {outputs.research && <OutputBlock title="Research findings" content={outputs.research} icon={Globe} />}
              {outputs.frontend && <OutputBlock title="Frontend agent report" content={outputs.frontend} icon={Code} />}
              {!outputs.research && !outputs.frontend && (
                <div className="border border-slate-200 bg-white text-[11px] text-slate-400 italic px-4 py-8 text-center">
                  Agent outputs land here as the run progresses — research facts, deploy URL, self-QA result.
                </div>
              )}
              {stagingUrl && (
                <a href={stagingUrl} target="_blank" rel="noopener" className="block border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 transition-colors p-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-700 mb-1">Open staging</div>
                  <div className="text-[12px] font-mono text-emerald-800 truncate">{stagingUrl} <ArrowRight size={10} weight="bold" className="inline" /></div>
                </a>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white/60 mt-10">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between text-[10px] text-slate-400">
          <span>OS26 · Demo Factory mission control</span>
          <span className="font-mono">backend: {API_BASE}</span>
        </div>
      </footer>
    </div>
  );
}
