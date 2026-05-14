import { useEffect, useRef, useState } from 'react';
import {
  Globe, Robot, Rocket, ShieldCheck, Phone, Lightning, CircleNotch,
  CheckCircle, XCircle, ArrowRight, ChatText, ArrowSquareOut, Buildings,
  CaretDown, CaretRight, Code, FileText,
} from '@phosphor-icons/react';

const API_BASE = (import.meta.env.VITE_FACTORY_API_URL || 'http://localhost:7700').replace(/\/+$/, '');

const AGENTS = [
  { id: 'research', label: 'Research',  icon: Globe,       blurb: 'Reads the prospect\'s site, classifies segment, extracts buying signals.' },
  { id: 'adapt',    label: 'Adapt',     icon: Robot,       blurb: 'Writes customer overlay (default route, brand, hook).' },
  { id: 'deploy',   label: 'Deploy',    icon: Rocket,      blurb: 'Builds + ships staging-site to staging.demo.pistonsolutions.ai.' },
  { id: 'review',   label: 'Review',    icon: ShieldCheck, blurb: 'Screenshots the staged URL, approves or sends back.' },
  { id: 'notify',   label: 'Notify',    icon: Phone,       blurb: 'SMS the staging URL.' },
];

function statusStyle(status) {
  switch (status) {
    case 'running':  return { cls: 'border-blue-400 bg-blue-50/50',    badge: 'bg-blue-100 text-blue-700 border-blue-300',       label: 'running' };
    case 'done':     return { cls: 'border-emerald-400 bg-emerald-50/50',badge: 'bg-emerald-100 text-emerald-700 border-emerald-300', label: 'done' };
    case 'failed':   return { cls: 'border-rose-400 bg-rose-50/50',     badge: 'bg-rose-100 text-rose-700 border-rose-300',       label: 'failed' };
    default:         return { cls: 'border-slate-200 bg-white',          badge: 'bg-slate-100 text-slate-500 border-slate-200',    label: 'idle' };
  }
}

function AgentCard({ agent, state, expanded, onToggle }) {
  const Icon = agent.icon;
  const s = statusStyle(state.status);
  const isRunning = state.status === 'running';
  return (
    <div className={`border ${s.cls} transition-colors`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className={`shrink-0 w-9 h-9 flex items-center justify-center border ${state.status === 'idle' ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-white border-slate-200 text-blue-600'}`}>
          {isRunning
            ? <CircleNotch size={16} weight="bold" className="animate-spin text-blue-500" />
            : state.status === 'done'
              ? <CheckCircle size={16} weight="bold" className="text-emerald-500" />
              : state.status === 'failed'
                ? <XCircle size={16} weight="bold" className="text-rose-500" />
                : <Icon size={16} weight="bold" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">{agent.label}</h3>
            <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${s.badge}`}>{s.label}</span>
            {state.elapsedMs != null && (
              <span className="text-[10px] font-mono text-slate-400 ml-auto">{(state.elapsedMs / 1000).toFixed(1)}s</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            {state.summary || agent.blurb}
          </div>
        </div>
        {expanded ? <CaretDown size={12} weight="bold" className="text-slate-400" /> : <CaretRight size={12} weight="bold" className="text-slate-400" />}
      </button>
      {expanded && (
        <div className="border-t border-slate-200 px-4 py-3 space-y-3 bg-slate-50/60">
          {state.events.length === 0 && (
            <div className="text-[11px] text-slate-400 italic">No activity yet.</div>
          )}
          {state.events.map((e, i) => (
            <div key={i} className={`text-[11px] pl-3 border-l-2 ${e.flagged ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200'} py-1`}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-500 text-[10px]">{e.tool || '—'}</span>
                {e.flagged && <span className="text-rose-600 font-bold text-[9px] uppercase tracking-widest">⚠ blocked</span>}
                {e.ts && <span className="ml-auto text-[10px] font-mono text-slate-400">{new Date(e.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>}
              </div>
              {e.summary && <div className="mt-0.5 text-slate-700">{e.summary}</div>}
              {e.input && (
                <details className="mt-1">
                  <summary className="text-[10px] text-slate-500 cursor-pointer">payload</summary>
                  <pre className="font-mono text-[10px] text-slate-600 whitespace-pre-wrap max-h-40 overflow-auto bg-white border border-slate-200 p-2 mt-1">{JSON.stringify(e.input, null, 2).slice(0, 1500)}</pre>
                </details>
              )}
            </div>
          ))}
          {state.payload && (
            <div className="border border-slate-200 bg-white p-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 flex items-center gap-1.5">
                <FileText size={10} weight="bold" /> output
              </div>
              <pre className="font-mono text-[10px] text-slate-700 whitespace-pre-wrap max-h-64 overflow-auto">{JSON.stringify(state.payload, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [customer, setCustomer] = useState('');
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(null);
  const [error, setError] = useState(null);
  const [stagingUrl, setStagingUrl] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [agentStates, setAgentStates] = useState(() =>
    Object.fromEntries(AGENTS.map((a) => [a.id, { status: 'idle', summary: null, events: [], payload: null, startedAt: null, elapsedMs: null }]))
  );
  const [expanded, setExpanded] = useState({});

  const fire = async () => {
    if (!customer.trim() || running) return;
    setRunning(true);
    setError(null);
    setStagingUrl(null);
    setVerdict(null);
    setAgentStates(Object.fromEntries(AGENTS.map((a) => [a.id, { status: 'idle', summary: null, events: [], payload: null, startedAt: null, elapsedMs: null }])));
    setExpanded({ research: true });

    let resp;
    try {
      resp = await fetch(`${API_BASE}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: customer.trim() }),
      });
    } catch (e) {
      setError(`Backend unreachable: ${e.message}.`);
      setRunning(false);
      return;
    }
    if (!resp.ok) {
      setError(`HTTP ${resp.status} from /run`);
      setRunning(false);
      return;
    }
    const { runId: id } = await resp.json();
    setRunId(id);

    const es = new EventSource(`${API_BASE}/run/${id}/events`);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data);
        if (ev.type === 'event') {
          const e = ev.data;
          setAgentStates((prev) => {
            const next = { ...prev };
            const agentKey = e.stage in next ? e.stage : null;
            if (agentKey) {
              const cur = next[agentKey];
              const startedAt = cur.startedAt || ev.ts || Date.now();
              next[agentKey] = {
                ...cur,
                status: e.flagged ? cur.status : 'running',
                summary: e.summary || cur.summary,
                events: [...cur.events, { ...e, ts: ev.ts }],
                startedAt,
                elapsedMs: (ev.ts || Date.now()) - startedAt,
              };
              // mark prior agents as done when a later agent starts
              const idx = AGENTS.findIndex((a) => a.id === agentKey);
              for (let i = 0; i < idx; i++) {
                if (next[AGENTS[i].id].status === 'running') {
                  next[AGENTS[i].id] = { ...next[AGENTS[i].id], status: 'done' };
                }
              }
            }
            return next;
          });
        } else if (ev.type === 'staging_url') {
          setStagingUrl(ev.data.url);
        } else if (ev.type === 'verdict') {
          setVerdict(ev.data);
          setAgentStates((prev) => ({
            ...prev,
            review: { ...prev.review, payload: ev.data, status: ev.data.verdict === 'APPROVED' ? 'done' : 'failed' },
          }));
        } else if (ev.type === 'done') {
          setRunning(false);
          setAgentStates((prev) => {
            const next = { ...prev };
            for (const id of Object.keys(next)) {
              if (next[id].status === 'running') next[id].status = 'done';
            }
            return next;
          });
          es.close();
        } else if (ev.type === 'error') {
          setError(ev.data?.message || 'unknown error');
          setRunning(false);
          es.close();
        }
      } catch {}
    };
    es.onerror = () => es.close();
  };

  return (
    <div className="min-h-screen tech-grid">
      {/* top bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Buildings size={18} weight="bold" className="text-blue-500" />
            <span className="font-bold tracking-tight text-slate-900">OS26</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 ml-1">demo factory</span>
          </div>
          <div className="flex items-center gap-5 text-[12px]">
            <a href="https://bastion.pistonsolutions.ai" target="_blank" rel="noopener" className="text-slate-500 hover:text-blue-600">Bastion</a>
            <a href="https://staging.demo.pistonsolutions.ai" target="_blank" rel="noopener" className="text-slate-500 hover:text-blue-600">Staging</a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* hero + input — single field, no clutter */}
        <div className="mb-10">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-blue-600 mb-2">os26 · demo factory</div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight leading-tight max-w-2xl">Spin up a personalized Bastion demo for any prospect.</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-2xl">
            Drop a LinkedIn profile URL (or a name + company). The pipeline reads their role + company, picks the segment that matches their buying lens (CTO → dev, CISO → compliance, insurance exec → insurance), customizes the matching demo at <code className="font-mono text-blue-600">staging.demo.pistonsolutions.ai</code>, and SMS-confirms when it's live.
          </p>

          <div className="mt-6 flex items-stretch gap-3 max-w-2xl">
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fire()}
              placeholder="https://www.linkedin.com/in/… (or 'Jane Doe, CTO at Investcorp')"
              disabled={running}
              className="flex-1 bg-white border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <button
              onClick={fire}
              disabled={running || !customer.trim()}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold uppercase tracking-widest text-[11px] px-5 transition-colors"
            >
              {running
                ? <><CircleNotch size={14} weight="bold" className="animate-spin" /> running</>
                : <><Lightning size={14} weight="bold" /> Fire</>}
            </button>
          </div>
          {runId && (
            <div className="mt-2 text-[11px] font-mono text-slate-400">run {runId}</div>
          )}
        </div>

        {/* result banner */}
        {(stagingUrl || error) && (
          <div className={`mb-6 border ${error ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50'} p-4`}>
            {error ? (
              <div className="text-[12px] text-rose-700"><strong>Run failed:</strong> {error}</div>
            ) : (
              <div className="flex items-center gap-3">
                <CheckCircle size={18} weight="bold" className="text-emerald-600" />
                <div className="flex-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-700">Demo live</div>
                  <a href={stagingUrl} target="_blank" rel="noopener" className="text-sm font-mono text-emerald-800 hover:underline">
                    {stagingUrl} <ArrowSquareOut size={11} weight="bold" className="inline ml-1" />
                  </a>
                  {verdict && (
                    <div className="text-[11px] text-slate-600 mt-1">
                      <span className="font-bold">{verdict.verdict}</span> · {verdict.reasoning}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* mission control — 5 agent cards */}
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700">Agents</h2>
          <span className="text-[10px] font-mono text-slate-400">click to expand</span>
          <a
            href="https://bastion.pistonsolutions.ai"
            target="_blank"
            rel="noopener"
            className="ml-auto text-[11px] text-blue-600 hover:underline flex items-center gap-1"
          >
            Bastion Live Activity <ArrowSquareOut size={10} weight="bold" />
          </a>
        </div>

        <div className="space-y-2">
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              state={agentStates[agent.id]}
              expanded={!!expanded[agent.id]}
              onToggle={() => setExpanded((e) => ({ ...e, [agent.id]: !e[agent.id] }))}
            />
          ))}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between text-[10px] text-slate-400">
          <span>OS26 · Demo Factory</span>
          <span className="font-mono">{API_BASE}</span>
        </div>
      </footer>
    </div>
  );
}
