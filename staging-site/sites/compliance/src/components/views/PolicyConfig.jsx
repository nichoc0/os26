import { useState, useRef, useEffect } from 'react';
import { Gear, ShieldCheck, Wrench, Plus, Prohibit, CheckCircle, UploadSimple, FileText, Spinner, X, ArrowRight, Clock, Graph } from '@phosphor-icons/react';
import { AgentBadge } from '../ui/AgentBadge';
import { useSessionStore } from '../../store/sessionStore';
import { usePersona } from '../../store/personaStore';

// localStorage-backed history of uploaded policies. Survives page navigation
// (KG view → back) so the user has visible proof of past uploads, not just an
// in-component callout that resets on unmount.
const HISTORY_KEY = 'bastion.policy-upload-history.v1';
const HISTORY_LIMIT = 20;

function loadHistory() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch { /* quota exceeded or storage disabled, non-fatal */ }
}

function appendHistory(entry) {
  const next = [entry, ...loadHistory().filter((e) => e.source !== entry.source)];
  saveHistory(next);
  return next;
}

function removeHistory(source) {
  const next = loadHistory().filter((e) => e.source !== source);
  saveHistory(next);
  return next;
}

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

// Policy upload endpoint resolution:
//   - VITE_API_URL env wins (manual override)
//   - localhost: hit bastion_blue_server on :8444 directly (CORS allowed)
//   - everything else: use the BASE_URL prefix and rely on the Vercel
//     /bastion-blue/api rewrite to bastion-blue.pistonsolutions.ai
const API_BASE = (() => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') {
      return 'http://127.0.0.1:8444';
    }
  }
  return import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '';
})();

// Per-persona sample upload entries seeded on first mount when the
// user's history is empty. Each entry points at a `policy-upload:<file>`
// source tag that has matching triples in the persona's kg-triples.json
// so clicking "View" opens a non-empty Knowledge Graph instead of an
// empty filter. Add new personas here as their KG fixtures land.
const SAMPLE_POLICY_BY_PERSONA = {
  'demo-arabic-bank': {
    source: 'policy-upload:scope_v1.md',
    filename: 'scope_v1.md',
    policyId: 'POL-BANK-2026-001',
    tripleCount: 18,
  },
};

function PolicyUploadCard({ setCurrentView, navigate }) {
  const persona = usePersona();
  const personaSlug = persona?.slug || null;
  const [stage, setStage] = useState('idle');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [history, setHistory] = useState(() => loadHistory());
  const inputRef = useRef(null);
  const refreshKg = useSessionStore((s) => s.fetchKg);

  useEffect(() => { setHistory(loadHistory()); }, []);

  // Seed the persona's sample entry on first mount (or if the user
  // cleared all uploads). Skip if a sample already exists. This makes
  // the demo flow "scroll to Previously uploaded → click View → see
  // KG filtered to the sample policy" work without requiring the user
  // to upload a file first.
  useEffect(() => {
    if (!personaSlug) return;
    const sample = SAMPLE_POLICY_BY_PERSONA[personaSlug];
    if (!sample) return;
    const current = loadHistory();
    if (current.some((h) => h.source === sample.source)) return;
    const next = appendHistory({ ...sample, uploadedAt: Date.now() });
    setHistory(next);
  }, [personaSlug]);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    setFile(f);
    setStage('uploading');
    setError(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const resp = await fetch(`${API_BASE}/api/policies/upload`, { method: 'POST', body: fd });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setPreview(data);
      setStage('preview');
    } catch (e) {
      setError(e.message);
      setStage('error');
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    setStage('committing');
    try {
      // Tag every triple with the uploaded-source provenance so the KG view
      // can render uploaded policies in their own colour + filter bucket.
      // Backend may already set this, but tagging client-side guarantees
      // older bastion_blue_server builds also produce identifiable rows.
      const filename = file?.name || preview.policy_id || 'unknown';
      const taggedPreview = {
        ...preview,
        triples: (preview.triples || []).map((t) => ({
          ...t,
          source_category: 'uploaded',
          source: t.source && t.source.startsWith('policy-upload')
            ? t.source
            : `policy-upload:${filename}`,
        })),
      };
      const resp = await fetch(`${API_BASE}/api/policies/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taggedPreview),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const tripleCount = taggedPreview.triples?.length ?? 0;
      const sourceTag = `policy-upload:${filename}`;
      setHistory(appendHistory({
        source: sourceTag,
        filename,
        policyId: preview.policy_id || null,
        tripleCount,
        uploadedAt: Date.now(),
      }));
      setStage('committed');
      // Refresh the KG view so the just-uploaded triples appear with the
      // emerald `uploaded` ring without the user having to navigate away.
      try { refreshKg?.(); } catch (_) { /* non-fatal */ }
    } catch (e) {
      setError(e.message);
      setStage('error');
    }
  };

  const removeFromHistory = (source) => {
    setHistory(removeHistory(source));
  };

  const handleReset = () => {
    setStage('idle');
    setFile(null);
    setPreview(null);
    setError(null);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
        <UploadSimple size={16} weight="bold" className="text-blue-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Upload Policy Document</h3>
        <span className="ml-auto text-[10px] text-slate-500">.md · .txt · .pdf</span>
      </div>

      <div className="p-5 space-y-4">
        {stage === 'idle' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-none p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-500/5'
                : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/30'
            }`}
          >
            <UploadSimple size={28} weight="bold" className="text-slate-400 mx-auto mb-2" />
            <p className="text-[12px] text-slate-700 dark:text-slate-300 font-semibold">Drop a policy document here</p>
            <p className="text-[11px] text-slate-500 mt-1">or click to browse — we'll extract the structure and link it to your knowledge graph</p>
            <input
              ref={inputRef}
              type="file"
              accept=".md,.txt,.pdf"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        )}

        {stage === 'uploading' && (
          <div className="border border-slate-200 dark:border-slate-700 p-5 flex items-center gap-3">
            <Spinner size={18} className="text-blue-500 animate-spin" />
            <div className="flex-1">
              <div className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Extracting structure from {file?.name}...</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Mapping content to policy schema and existing knowledge graph entities</div>
            </div>
          </div>
        )}

        {stage === 'preview' && preview && (
          <PolicyPreview file={file} preview={preview} onCommit={handleCommit} onCancel={handleReset} />
        )}

        {stage === 'committing' && (
          <div className="border border-slate-200 dark:border-slate-700 p-5 flex items-center gap-3">
            <Spinner size={18} className="text-blue-500 animate-spin" />
            <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">Saving policy and linking to knowledge graph...</span>
          </div>
        )}

        {stage === 'committed' && (
          <div className="border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 p-5 flex items-center gap-3">
            <CheckCircle size={18} weight="fill" className="text-emerald-500" />
            <div className="flex-1">
              <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">Policy saved and linked.</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {preview?.triples?.length ?? 0} new connections added to the knowledge graph
                <span className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 border border-emerald-400/60 bg-emerald-50 dark:bg-emerald-500/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Uploaded</span>
                </span>
                <span className="ml-1">— filter by this in the Knowledge Graph view.</span>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer bg-transparent"
            >
              Upload another
            </button>
          </div>
        )}

        {stage === 'error' && (
          <div className="border border-blue-300 dark:border-blue-700 bg-blue-900/5 dark:bg-blue-900/10 p-5 flex items-center gap-3">
            <X size={18} weight="bold" className="text-slate-700 dark:text-slate-300" />
            <div className="flex-1">
              <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">Upload failed</div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-mono">{error}</div>
            </div>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer bg-transparent"
            >
              Try again
            </button>
          </div>
        )}

        {history.length > 0 && (
          <div className="pt-1">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={12} className="text-slate-500" />
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Previously uploaded ({history.length})
              </h4>
            </div>
            <ul className="border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/50">
              {history.map((entry) => (
                <li key={entry.source} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Uploaded source" />
                  <FileText size={14} className="text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {entry.filename}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-500 flex items-center gap-2">
                      <span>{entry.tripleCount} {entry.tripleCount === 1 ? 'connection' : 'connections'}</span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span>{formatRelative(entry.uploadedAt)}</span>
                      {entry.policyId && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="font-mono">{entry.policyId}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {(navigate || setCurrentView) && (
                    <button
                      onClick={() => {
                        // Write the policy's source tag into the URL so
                        // KnowledgeGraphView's mount effect can seed its
                        // source filter and the user lands on a KG that's
                        // already filtered to nodes derived from THIS
                        // uploaded policy. Previous behaviour
                        // (`setCurrentView('vault')`) silently fell
                        // through to the default Overview view because
                        // 'vault' isn't a real App-level view name.
                        if (typeof window !== 'undefined' && entry.source) {
                          const url = new URL(window.location.href);
                          url.searchParams.set('kgSource', entry.source);
                          window.history.replaceState({}, '', url.toString());
                        }
                        if (navigate) navigate('fleet', 'graph');
                        else setCurrentView?.('fleet');
                      }}
                      className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer bg-transparent rounded-none transition-colors flex items-center gap-1"
                      title="Open in Knowledge Graph — pre-filtered to triples from this policy."
                    >
                      <Graph size={11} weight="bold" />
                      View
                    </button>
                  )}
                  <button
                    onClick={() => removeFromHistory(entry.source)}
                    className="text-slate-400 hover:text-rose-500 cursor-pointer bg-transparent border-0 p-1"
                    title="Remove from history"
                  >
                    <X size={12} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function PolicyPreview({ file, preview, onCommit, onCancel }) {
  const triples = preview.triples || [];
  return (
    <div className="border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-800">
      <div className="px-4 py-3 flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40">
        <FileText size={14} className="text-blue-500" />
        <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200">{file?.name}</span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Preview</span>
      </div>

      {/* Generated policy markdown */}
      <div className="px-4 py-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Generated policy ({preview.policy_id || 'unnamed'})</div>
        <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 max-h-[280px] overflow-y-auto">
          {preview.markdown || '(no markdown returned)'}
        </pre>
      </div>

      {/* Proposed KG triples */}
      <div className="px-4 py-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
          Proposed knowledge-graph links · {triples.length} {triples.length === 1 ? 'connection' : 'connections'}
        </div>
        {triples.length === 0 ? (
          <div className="text-[11px] italic text-slate-400">No links extracted.</div>
        ) : (
          <ul className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {triples.map((t, i) => (
              <li key={i} className="text-[11px] font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center gap-2 flex-wrap">
                <span className="text-slate-600 dark:text-slate-400 break-all">{t.h}</span>
                <ArrowRight size={10} weight="bold" className="text-blue-500" />
                <span className="text-blue-600 dark:text-blue-400">{t.r}</span>
                <ArrowRight size={10} weight="bold" className="text-blue-500" />
                <span className="text-slate-600 dark:text-slate-400 break-all">{t.t}</span>
                {t.matched_existing && (
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">existing</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer bg-transparent"
        >
          Cancel
        </button>
        <button
          onClick={onCommit}
          className="px-5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer border-none"
        >
          Save & Link
        </button>
      </div>
    </div>
  );
}

function ActionBadge({ action }) {
  if (action === 'block') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-200 dark:bg-blue-900/30 text-blue-200 dark:text-blue-200 border border-blue-800 dark:border-blue-800">
        <Prohibit size={10} weight="bold" /> Block
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-blue-50 dark:bg-blue-300/30 text-blue-500 dark:text-blue-300 border border-blue-300 dark:border-blue-300">
      <CheckCircle size={10} weight="bold" /> Allow
    </span>
  );
}

function StatusBadge({ status }) {
  if (status === 'blocked') {
    return (
      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 dark:bg-blue-900/20 text-blue-200 dark:text-blue-200 border border-blue-800 dark:border-blue-800">
        Blocked
      </span>
    );
  }
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-blue-50 dark:bg-blue-300/20 text-blue-500 dark:text-blue-300 border border-blue-300 dark:border-blue-300">
      Allowed
    </span>
  );
}

export function PolicyConfig({ data, setCurrentView, navigate }) {
  const [formAgent, setFormAgent] = useState('*');
  const [formTool, setFormTool] = useState('');
  const [formAction, setFormAction] = useState('block');
  const [policies, setPolicies] = useState(data.policies);

  const handleAdd = () => {
    if (!formTool.trim()) return;
    const newPolicy = {
      id: policies.length + 1,
      agent: formAgent,
      tool_name: formTool.trim(),
      action: formAction,
    };
    setPolicies([...policies, newPolicy]);
    setFormTool('');
  };

  const agentOptions = ['*', ...Object.keys(data.agentMeta)];

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3 mb-6">
        <Gear size={24} weight="bold" className="text-slate-400" />
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Policy Configuration</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage tool access policies and monitor usage</p>
        </div>
      </div>

      <PolicyUploadCard setCurrentView={setCurrentView} navigate={navigate} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Policies */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
            <ShieldCheck size={16} weight="bold" className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Active Policies</h3>
            <span className="ml-auto text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5">
              {policies.length} rules
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_1fr_80px] gap-3 px-5 py-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
              <span>Agent</span>
              <span>Tool</span>
              <span>Action</span>
            </div>
            {policies.map((policy) => (
              <div key={policy.id} className="grid grid-cols-[1fr_1fr_80px] gap-3 px-5 py-3 items-center hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div>
                  {policy.agent === '*' ? (
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">All Agents</span>
                  ) : (
                    <AgentBadge agent={policy.agent} agentMeta={data.agentMeta} />
                  )}
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200">{policy.tool_name}</span>
                <ActionBadge action={policy.action} />
              </div>
            ))}
          </div>
        </div>

        {/* Tool Usage Stats */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
            <Wrench size={16} weight="bold" className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tool Usage Stats</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {/* Header */}
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-3 px-5 py-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
              <span>Tool</span>
              <span>Agent</span>
              <span className="text-right">Calls</span>
              <span>Status</span>
            </div>
            {data.tool_stats.map((tool) => {
              const maxCount = Math.max(...data.tool_stats.map((t) => t.count));
              const barWidth = maxCount > 0 ? (tool.count / maxCount) * 100 : 0;
              return (
                <div key={tool.name} className="grid grid-cols-[1fr_80px_80px_80px] gap-3 px-5 py-3 items-center hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div>
                    <span className="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200">{tool.name}</span>
                    <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 mt-1.5 overflow-hidden">
                      <div
                        className={`h-full ${tool.status === 'blocked' ? 'bg-blue-800' : 'bg-blue-400'}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold">{tool.agent}</span>
                  <span className="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 text-right">{tool.count}</span>
                  <StatusBadge status={tool.status} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Policy Form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
          <Plus size={16} weight="bold" className="text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add Policy</h3>
        </div>
        <div className="p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            {/* Agent Select */}
            <div className="flex-1 w-full sm:w-auto">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Agent</label>
              <select
                value={formAgent}
                onChange={(e) => setFormAgent(e.target.value)}
                className="w-full px-3 py-2 text-[11px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer rounded-none"
              >
                {agentOptions.map((a) => (
                  <option key={a} value={a}>
                    {a === '*' ? 'All Agents (*)' : data.agentMeta[a]?.label || a}
                  </option>
                ))}
              </select>
            </div>

            {/* Tool Name Dropdown */}
            <div className="flex-1 w-full sm:w-auto">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Tool Name</label>
              <select
                value={formTool}
                onChange={(e) => setFormTool(e.target.value)}
                className="w-full px-3 py-2 text-[11px] font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-none cursor-pointer"
              >
                <option value="">Select tool...</option>
                {['search_products', 'get_order_status', 'get_customer_profile', 'escalate_to_human',
                  'read_file', 'extract_fields', 'classify_document', 'write_to_db',
                  'query_knowledge_graph', 'draft_email', 'send_email', 'delete_file',
                  'database_write', 'query_external_api', 'drop_table', 'delete_record'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Action Toggle */}
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Action</label>
              <div className="flex">
                <button
                  onClick={() => setFormAction('block')}
                  className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider border cursor-pointer transition-colors rounded-none ${
                    formAction === 'block'
                      ? 'bg-blue-800 text-white border-blue-800'
                      : 'bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Block
                </button>
                <button
                  onClick={() => setFormAction('allow')}
                  className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider border border-l-0 cursor-pointer transition-colors rounded-none ${
                    formAction === 'allow'
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Allow
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleAdd}
              disabled={!formTool.trim()}
              className={`px-5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer rounded-none border-none ${
                formTool.trim()
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              Add Rule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
