// Policy vault knowledge graph — Bastion Demo v1.0
// 2D force-directed view of the Acme Shopping Assistant policy vault: 6-agent
// fleet, tool authorities, data-access grants, policies, regulatory controls,
// client tiers, supervision roles, and agent-scoped secret codes.

import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Graph, ArrowsClockwise } from '@phosphor-icons/react';
import { useSessionStore } from '../../store/sessionStore';
import { getAgentById } from '../../data/agentCatalog';
import { usePersona } from '../../store/personaStore';

const ENTITY_TYPES = [
  'Agent', 'Tool', 'Policy', 'Control', 'DataSource',
  'Role', 'Client', 'Region', 'Credential', 'Code', 'Finding',
];

// High-contrast categorical palette — each entity type gets a visually
// distinct hue, with enough spread between siblings that they never blur
// into each other. Picked from the bright end of the Tailwind palette so
// every dot pops against both light and dark backgrounds.
const COLOR_BY_TYPE = {
  Agent: '#2563eb',        // blue-600  (saturated blue)
  Code: '#06b6d4',         // cyan-500  (bright cyan — clearly not Agent blue)
  Policy: '#a855f7',       // purple-500 (bright purple)
  Control: '#4f46e5',      // indigo-600 (deep indigo — different family from Policy)
  Tool: '#16a34a',         // green-600
  DataSource: '#14b8a6',   // teal-500   (clearly not Tool green)
  Role: '#f97316',         // orange-500
  Client: '#facc15',       // yellow-400 (gold)
  Region: '#ec4899',       // pink-500   (no longer amber — needs separation from Role/Client)
  Credential: '#64748b',   // slate-500
  Finding: '#ef4444',      // red-500
};

function entityType(name) {
  const colon = String(name || '').indexOf(':');
  return colon > 0 ? name.slice(0, colon) : 'Unknown';
}
function entityLabel(name) {
  const colon = String(name || '').indexOf(':');
  return colon > 0 ? name.slice(colon + 1) : String(name || '');
}

// Source provenance — four high-contrast hues paired with dash patterns
// so they read at a glance even when adjacent to similarly-tinted entity
// fills. Stroke pattern is the colorblind-safe backup signal.
//   log/telemetry   → bright blue,    solid ring
//   policy/general  → amber,          dashed ring
//   finding         → red,            dotted ring
//   uploaded        → emerald,        dash-dot ring  (user-uploaded policy docs)
//
// Uploaded gets its own bucket because customers need to instantly see
// what THEY contributed to the graph vs preloaded knowledge / Red findings.
const SOURCE_CATEGORIES = ['log', 'policy', 'finding', 'uploaded'];
const SOURCE_RING_COLOR = {
  log: '#1d4ed8',      // blue-700 — observed from agent telemetry
  policy: '#f59e0b',   // amber-500 — preloaded from policy docs / general knowledge
  finding: '#dc2626',  // red-600 — written back from Red runs
  uploaded: '#10b981', // emerald-500 — user-uploaded via Settings → Upload Policy Document
};
// Canvas dash patterns for the provenance ring: solid / long-dash / dotted /
// dash-dot. Kept readable at a 6-8px node radius. Dash-dot for `uploaded`
// because alternating long+short reads as "newly contributed" against the
// uniform patterns of the inherited categories.
const SOURCE_RING_DASH = {
  log: [],             // solid
  policy: [4, 3],      // dashed
  finding: [1, 2],     // dotted
  uploaded: [6, 2, 1, 2], // dash-dot
};
const SOURCE_LABEL = {
  log: 'Log / telemetry',
  policy: 'Policy / general knowledge',
  finding: 'Red finding',
  uploaded: 'Uploaded policy',
};

function tripleSourceCategory(t) {
  if (t.source_category) return t.source_category;
  const s = String(t.source || '');
  if (s.startsWith('probe-finding')) return 'finding';
  if (s.startsWith('log')) return 'log';
  // Uploaded policy docs — match before the generic 'policy' branch so
  // they don't get swallowed into the inherited-knowledge bucket.
  if (s.startsWith('policy-upload') || s.startsWith('upload')) return 'uploaded';
  if (s.startsWith('policy')) return 'policy';
  return 'policy';
}

function buildGraph(triples, filterTypes, filterSources) {
  const nodeMap = new Map();
  const links = [];
  for (const t of triples) {
    const ht = entityType(t.h);
    const tt = entityType(t.t);
    const src = tripleSourceCategory(t);
    if (filterTypes && filterTypes.size > 0) {
      if (!filterTypes.has(ht) && !filterTypes.has(tt)) continue;
    }
    if (filterSources && filterSources.size > 0) {
      if (!filterSources.has(src)) continue;
    }
    if (!nodeMap.has(t.h)) nodeMap.set(t.h, { id: t.h, type: ht, label: entityLabel(t.h), sources: new Set() });
    if (!nodeMap.has(t.t)) nodeMap.set(t.t, { id: t.t, type: tt, label: entityLabel(t.t), sources: new Set() });
    nodeMap.get(t.h).sources.add(src);
    nodeMap.get(t.t).sources.add(src);
    links.push({ source: t.h, target: t.t, relation: t.r, sourceCategory: src });
  }
  return { nodes: Array.from(nodeMap.values()), links };
}

export default function KnowledgeGraphView({ embedded = false, onSelectNode, agentId = null, agentLabel = null } = {}) {
  const persona = usePersona();
  const personaSlug = persona?.slug || 'maple-pharmacy';
  const baseTriples = useSessionStore((s) => s.kgTriples);
  const findingTriples = useSessionStore((s) => s.findingTriples);
  const allTriples = useMemo(() => [...baseTriples, ...findingTriples], [baseTriples, findingTriples]);

  // Agent-scoped subgraph: when an agent id is provided, restrict
  // triples to those whose head/tail/relation mention the agent id or
  // label (substring match). If the natural match yields a thin
  // subgraph (< 5 distinct nodes), synthesize a per-agent skeleton
  // showing channel + allowed/restricted tools + scope file + the
  // load-bearing frameworks so the graph is never one disconnected
  // dot per agent. Empty agentId = full graph (no filter, no synth).
  const triples = useMemo(() => {
    if (!agentId) return allTriples;
    const needles = [agentId, agentLabel].filter(Boolean).map((s) => String(s).toLowerCase());
    const hit = (s) => {
      if (!s) return false;
      const v = String(s).toLowerCase();
      return needles.some((n) => v.includes(n));
    };
    const natural = allTriples.filter((t) => hit(t.h) || hit(t.t) || hit(t.r));
    const distinctNodes = new Set();
    for (const t of natural) { distinctNodes.add(t.h); distinctNodes.add(t.t); }
    if (distinctNodes.size >= 5) return natural;
    // Synthesize a per-agent skeleton (>= 7 edges) so the subgraph is
    // always readable. Uses the canonical AGENT_CATALOG entry.
    const a = getAgentById(personaSlug, agentId);
    if (!a) return natural;
    const head = `Agent:${a.label}`;
    const synth = [
      { h: head, t: `Channel:${a.channel}`,        r: 'serves_on',       source: 'agent_catalog' },
      { h: head, t: 'ScopeFile:demo_pharmacy.md', r: 'scoped_by',       source: 'agent_catalog' },
      { h: head, t: 'Framework:HIPAA',            r: 'aligns_to',       source: 'agent_catalog' },
      { h: head, t: 'Framework:ISO_14971',        r: 'aligns_to',       source: 'agent_catalog' },
      ...a.tools.allowed.slice(0, 3).map((tool) => ({ h: head, t: `Tool:${tool}`, r: 'may_call',         source: 'agent_catalog' })),
      ...a.tools.restricted.slice(0, 2).map((tool) => ({ h: head, t: `Tool:${tool}`, r: 'restricted_from', source: 'agent_catalog' })),
    ];
    return [...natural, ...synth];
  }, [allTriples, agentId, agentLabel, personaSlug]);
  const loading = useSessionStore((s) => s.kgLoading);
  const error = useSessionStore((s) => s.kgError);
  const fetchKg = useSessionStore((s) => s.fetchKg);

  const [selectedNode, setSelectedNode] = useState(null);
  const [filterTypes, setFilterTypes] = useState(new Set());
  const [filterSources, setFilterSources] = useState(new Set());
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  useEffect(() => {
    fetchKg(personaSlug);
  }, [fetchKg, personaSlug]);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setDims({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const graph = useMemo(() => buildGraph(triples, filterTypes, filterSources), [triples, filterTypes, filterSources]);

  // Push the d3-force simulation toward more node spacing — defaults pack
  // them tightly which made labels overlap and obscured source rings.
  // Stronger negative charge = more repulsion; bigger link distance = longer
  // edges. Re-fire when the graph changes so re-renders honour the spacing.
  useEffect(() => {
    if (!fgRef.current) return;
    const charge = fgRef.current.d3Force?.('charge');
    const link = fgRef.current.d3Force?.('link');
    if (charge?.strength) charge.strength(-140);
    if (link?.distance) link.distance(45);
    if (typeof fgRef.current.d3ReheatSimulation === 'function') {
      fgRef.current.d3ReheatSimulation();
    }
  }, [graph]);

  const detailTriples = useMemo(() => {
    if (!selectedNode) return [];
    return triples.filter((t) => t.h === selectedNode.id || t.t === selectedNode.id);
  }, [triples, selectedNode]);

  const sourcesInData = useMemo(() => {
    const seen = new Set();
    for (const t of triples) seen.add(tripleSourceCategory(t));
    return SOURCE_CATEGORIES.filter((s) => seen.has(s));
  }, [triples]);

  const toggleSource = (source) => {
    setFilterSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  // Tiny inline SVG showing the source's stroke style (solid / dashed /
  // dotted) — used in filter chips and the detail panel as a visual key
  // matching what gets drawn on the canvas.
  const SourceGlyph = ({ source }) => {
    const stroke = SOURCE_RING_COLOR[source] || '#64748b';
    const dash = (SOURCE_RING_DASH[source] || []).join(' ');
    return (
      <svg width="18" height="10" viewBox="0 0 18 10" className="shrink-0">
        <line x1="1" y1="5" x2="17" y2="5" stroke={stroke} strokeWidth="1.5" strokeDasharray={dash || 'none'} />
      </svg>
    );
  };

  const typesInData = useMemo(() => {
    const seen = new Set();
    for (const t of triples) {
      seen.add(entityType(t.h));
      seen.add(entityType(t.t));
    }
    return ENTITY_TYPES.filter((t) => seen.has(t));
  }, [triples]);

  const toggleType = (type) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {!embedded && (
        <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 px-6 md:px-8 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
              <Graph size={24} weight="bold" className="text-blue-500 dark:text-blue-400" />
              Policy Knowledge Graph
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {triples.length} facts about your agents, tools, and policies
              {loading && ' · refreshing…'}
            </p>
          </div>
          <button
            onClick={() => fetchKg(personaSlug)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors rounded-none cursor-pointer"
          >
            <ArrowsClockwise size={14} weight="bold" className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </header>
      )}

      <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 px-6 md:px-8 py-3 space-y-2">
        {/* Source provenance filter — answers "which of these came from logs vs policy docs?" */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mr-2">
            Filter by source:
          </span>
          {sourcesInData.map((source) => {
            const active = filterSources.has(source);
            return (
              <button
                key={source}
                onClick={() => toggleSource(source)}
                className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1 border rounded-none transition-colors cursor-pointer flex items-center gap-2 ${
                  active
                    ? 'border-slate-700 dark:border-slate-200 text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800/60'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                }`}
              >
                <SourceGlyph source={source} />
                {SOURCE_LABEL[source] || source}
              </button>
            );
          })}
          {filterSources.size > 0 && (
            <button
              onClick={() => setFilterSources(new Set())}
              className="text-[11px] font-mono text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline ml-2 cursor-pointer"
            >
              clear
            </button>
          )}
          <span className="ml-auto text-[10px] font-mono text-slate-400 dark:text-slate-600">
            ring (color + pattern) = source · fill = entity type
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mr-2">
            Filter by category:
          </span>
          {typesInData.map((type) => {
            const active = filterTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1 border rounded-none transition-colors cursor-pointer ${
                  active
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                }`}
                style={
                  active
                    ? undefined
                    : { boxShadow: `inset 4px 0 0 ${COLOR_BY_TYPE[type] || '#94a3b8'}` }
                }
              >
                {type}
              </button>
            );
          })}
          {filterTypes.size > 0 && (
            <button
              onClick={() => setFilterTypes(new Set())}
              className="text-[11px] font-mono text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline ml-2 cursor-pointer"
            >
              clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div ref={containerRef} className="flex-1 bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
          {error && import.meta.env.VITE_APP_MODE !== 'production' && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-red-500">
              Failed to load KG: {error}
            </div>
          )}
          {error && import.meta.env.VITE_APP_MODE === 'production' && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Knowledge graph is empty. Upload a policy or run a scope to populate it.
            </div>
          )}
          {!error && graph.nodes.length > 0 && (
            <ForceGraph2D
              ref={fgRef}
              graphData={graph}
              width={dims.w}
              height={dims.h}
              nodeLabel={(n) => {
                const srcs = Array.from(n.sources || []);
                const srcStr = srcs.length === 0 ? '' : `\nsource: ${srcs.map((s) => SOURCE_LABEL[s] || s).join(' + ')}`;
                return `${n.type}: ${n.label}${srcStr}`;
              }}
              // Custom renderer: fill = entity type, ring = source provenance.
              // Multi-source node → concentric rings, one per source, each with
              // its own dash pattern (solid=log, dashed=policy, dotted=finding).
              nodeCanvasObject={(node, ctx) => {
                const r = 6;
                const fill = COLOR_BY_TYPE[node.type] || '#94a3b8';
                const sources = Array.from(node.sources || []);
                // Filled circle (entity type)
                ctx.beginPath();
                ctx.fillStyle = fill;
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                ctx.fill();
                // Provenance ring(s) — each source gets its own concentric ring
                // so multi-source nodes are read as a stack of provenance, not
                // a multicolour halo.
                ctx.lineWidth = 1.5;
                sources.forEach((s, i) => {
                  const ringR = r + 2 + i * 2.5;
                  ctx.beginPath();
                  ctx.strokeStyle = SOURCE_RING_COLOR[s] || '#94a3b8';
                  ctx.setLineDash(SOURCE_RING_DASH[s] || []);
                  ctx.arc(node.x, node.y, ringR, 0, 2 * Math.PI);
                  ctx.stroke();
                });
                ctx.setLineDash([]);
              }}
              nodePointerAreaPaint={(node, color, ctx) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(node.x, node.y, 9, 0, 2 * Math.PI);
                ctx.fill();
              }}
              linkLabel={(l) => l.relation}
              linkColor={() => 'rgba(100, 116, 139, 0.4)'}
              linkDirectionalArrowLength={4}
              linkDirectionalArrowRelPos={0.92}
              cooldownTicks={120}
              onNodeClick={(node) => {
                setSelectedNode(node);
                if (onSelectNode) onSelectNode(node);
              }}
              backgroundColor="rgba(0,0,0,0)"
            />
          )}
          {!error && !loading && graph.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              Nothing to display yet.
            </div>
          )}
        </div>

        <aside className="w-80 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto">
          {selectedNode ? (
            <div className="p-5 space-y-4">
              <header>
                <div
                  className="text-[10px] font-bold uppercase tracking-widest mb-1"
                  style={{ color: COLOR_BY_TYPE[selectedNode.type] || '#94a3b8' }}
                >
                  {selectedNode.type}
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono break-all">
                  {selectedNode.label}
                </h2>
                {selectedNode.sources && selectedNode.sources.size > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Source:</span>
                    {Array.from(selectedNode.sources).map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-mono px-1.5 py-0.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-none flex items-center gap-1.5"
                      >
                        <SourceGlyph source={s} />
                        {SOURCE_LABEL[s] || s}
                      </span>
                    ))}
                  </div>
                )}
              </header>
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
                  Facts about this item
                </h3>
                <ul className="space-y-2">
                  {detailTriples.map((t, idx) => {
                    const src = tripleSourceCategory(t);
                    return (
                      <li
                        key={idx}
                        className="text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 border-l-2 border-l-slate-400 dark:border-l-slate-600 rounded-none p-2"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <SourceGlyph source={src} />
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            {SOURCE_LABEL[src] || src}
                          </span>
                          {t.source && (
                            <span className="text-[9px] text-slate-400 dark:text-slate-600">
                              · {t.source}
                            </span>
                          )}
                        </div>
                        <div className="text-slate-600 dark:text-slate-400 break-all">{t.h}</div>
                        <div className="text-blue-600 dark:text-blue-400 my-0.5">— {t.r} —</div>
                        <div className="text-slate-600 dark:text-slate-400 break-all">{t.t}</div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          ) : (
            <div className="p-5 space-y-3 text-sm text-slate-500 dark:text-slate-400">
              <p className="font-bold text-slate-700 dark:text-slate-300">Click a node to see its facts.</p>
              <p>Each connection shows how agents, tools, and policies relate to each other. The <strong className="text-slate-700 dark:text-slate-300">ring</strong> shows where the fact came from — solid blue for log/telemetry, dashed yellow for policy/general knowledge, dotted red for Red findings, dash-dot emerald for uploaded policy docs. The <strong className="text-slate-700 dark:text-slate-300">fill</strong> shows the entity type — blue=Agent, sky=Code, violet=Policy/Control, green=Tool, teal=DataSource, orange=Role, yellow=Client, pink=Region, red=Finding.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
