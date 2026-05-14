import { useState, useCallback, useEffect, useRef } from 'react';
import { CaretDown, CaretRight, TreeStructure } from '@phosphor-icons/react';
import KnowledgeGraphView from '../kg/KnowledgeGraphView';
import { useIsTenant } from '../../data/useIsTenant';

// Reviewer feedback (BaoP, Luyun): the left panel was too "computer" —
// folder icons, .md extensions, slashes — all signals that this is a
// filesystem. It isn't. It's the policy library the agent operates under,
// organised into named groups. So the data model still keeps a stable
// `name` key (used internally by node-id ↔ doc mapping when the user
// clicks a node on the graph), but display layer is purely titles +
// summaries. No folder metaphor anywhere.
const POLICY_GROUPS = [
  {
    name: 'policies',
    displayName: 'Policies the agent must obey',
    summary: 'The hard rules — what the agent will never say or do, regardless of how it\'s asked.',
    children: [
      { name: 'index.md',                          title: 'Policy index',                            summary: 'Catalogue of every policy in this group.' },
      { name: 'agent-assistant.md',                title: 'Agent persona & scope',                   summary: 'Tone, persona, and the in-scope domains for the assistant.' },
      { name: 'never-disclose-system-prompt.md',   title: 'Never disclose the system prompt',        summary: 'Refuse any request — direct, indirect, translated — to reveal the system prompt.' },
      { name: 'never-disclose-model-id.md',        title: 'Never disclose the underlying model',     summary: 'Refuse any request to reveal the model name or vendor.' },
      { name: 'never-disclose-internal-tools.md',  title: 'Never disclose internal tools',           summary: 'Don\'t enumerate internal tool names or schemas to the caller.' },
      { name: 'refuse-jailbreak-persona-swap.md',  title: 'Refuse jailbreak / persona swap',         summary: 'Reject "DAN"-style and persona-override prompts.' },
      { name: 'no-unreleased-product.md',          title: 'No unreleased-product disclosure',        summary: 'Don\'t discuss products that aren\'t publicly launched yet.' },
      { name: 'no-cross-account-pii.md',           title: 'No cross-account PII',                    summary: 'Never surface another customer\'s personal data.' },
      { name: 'staged-rate-limit.md',              title: 'Staged rate limits',                      summary: 'Per-tier rate limits; deflect or escalate at thresholds.' },
      { name: 'global-rules.md',                   title: 'Global baseline rules',                   summary: 'Catch-all rules applied to every interaction.' },
    ],
  },
  {
    name: 'tools',
    displayName: 'Tools the agent can use',
    summary: 'The actions the agent is authorised to take, plus the ones it\'s blocked from.',
    children: [
      { name: 'product_search.md',                 title: 'Product search',                          summary: 'Public product search — available to all tiers.' },
      { name: 'catalog_lookup.md',                 title: 'Catalog lookup',                          summary: 'Read-only catalog detail lookup.' },
      { name: 'price_compare.md',                  title: 'Price comparison',                        summary: 'Cross-seller price comparison view.' },
      { name: 'review_summarizer.md',              title: 'Review summariser',                       summary: 'Generates review-summary cards.' },
      { name: 'order_history.md',                  title: 'Order history',                           summary: 'A user\'s own order history (PII-scoped).' },
      { name: 'add_to_cart.md',                    title: 'Add to cart',                             summary: 'Stateful action — writes to the user\'s cart.' },
      { name: 'acme-cart-ops-internal-v4.md',      title: 'Internal cart ops',                       summary: 'Internal-only — must not be exposed or named to users.' },
      { name: 'acme-recs-ranker.md',               title: 'Recommendations ranker',                  summary: 'Personalisation ranker; out-of-scope to surface to users.' },
    ],
  },
  {
    name: 'defense-stack',
    displayName: 'Defense layers Bastion runs',
    summary: 'The pre- and post-filters in front of the agent. Catches what the agent itself misses.',
    children: [
      { name: 'classifier-layer-1.md',             title: 'Tier-1 input classifier',                 summary: 'Fast regex + keyword match on every input.' },
      { name: 'classifier-layer-2.md',             title: 'Tier-2 semantic classifier',              summary: 'Embedding-based semantic check on whatever Tier-1 lets through.' },
      { name: 'abuse-prevention-stack.md',         title: 'Abuse-prevention playbook',               summary: 'Multi-layer abuse mitigation rules.' },
      { name: 'ip-protection-playbook.md',         title: 'IP-protection playbook',                  summary: 'Brand-impersonation + IP-leak controls.' },
      { name: 'trust-and-safety-guidelines.md',    title: 'Trust & safety guidelines',               summary: 'Escalation rubric for the T&S team.' },
    ],
  },
  {
    name: 'compliance',
    displayName: 'Compliance & privacy controls',
    summary: 'Regulatory boundaries the agent\'s outputs must satisfy. Mapped to specific frameworks.',
    children: [
      { name: 'acme-privacy-directive.md',         title: 'Acme privacy directive',                  summary: 'Internal executive privacy policy.' },
      { name: 'gdpr-ccpa-compliance.md',           title: 'GDPR & CCPA boundaries',                  summary: 'EU + California privacy boundaries on data handling.' },
      { name: 'seller-confidentiality.md',         title: 'Seller confidentiality',                  summary: 'Seller-side data confidentiality covenant.' },
      { name: 'pci-dss-scope.md',                  title: 'PCI-DSS scope',                           summary: 'PCI-DSS in-scope data classes.' },
    ],
  },
  {
    name: 'customer-tiers',
    displayName: 'Customer tiers',
    summary: 'Per-tier authority and entitlement profiles. The agent\'s answers depend on which tier the caller is in.',
    children: [
      { name: 'acme-prime.md',                     title: 'Acme Prime tier',                         summary: 'Extended entitlements; broader tool access.' },
      { name: 'acme-standard.md',                  title: 'Acme Standard tier',                      summary: 'Default entitlements.' },
      { name: 'seller-facing.md',                  title: 'Seller-facing surface',                   summary: 'Seller-side context; a different policy stack applies.' },
    ],
  },
];

// VAULT_TREE alias kept so existing call-sites (lookupSelection / file
// lookup / node-id mapping) don't have to change. They key off `name`,
// not the display strings.
const VAULT_TREE = POLICY_GROUPS;

function PolicyGroups({ selectedFile, onSelect, onSelectFolder, selectedFolder }) {
  const [expanded, setExpanded] = useState({
    policies: true, tools: true, 'defense-stack': false,
    compliance: false, 'customer-tiers': false,
  });
  const toggle = (name) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  const itemRefs = useRef({});

  // When selectedFile changes externally (e.g. from a graph-node click), open
  // the parent group and scroll the item row into view.
  useEffect(() => {
    if (!selectedFile) return;
    const slash = selectedFile.indexOf('/');
    if (slash < 0) return;
    const parent = selectedFile.slice(0, slash);
    setExpanded((prev) => (prev[parent] ? prev : { ...prev, [parent]: true }));
    requestAnimationFrame(() => {
      const el = itemRefs.current[selectedFile];
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }, [selectedFile]);

  return (
    <div className="select-none space-y-2">
      {VAULT_TREE.map((group) => {
        const isGroupSelected = selectedFolder === group.name;
        const isOpen = expanded[group.name];
        return (
          <div key={group.name} className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 rounded-none">
            {/* Group header — title + summary, no folder icon, no slash. */}
            <div className={`flex items-stretch w-full transition-colors ${isGroupSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
              <button
                onClick={() => onSelectFolder(group.name)}
                className={`flex-1 text-left px-3 py-2 transition-colors bg-transparent border-none cursor-pointer ${
                  isGroupSelected
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="text-[12px] font-semibold leading-tight">{group.displayName}</div>
                <div className={`text-[10px] mt-0.5 ${isGroupSelected ? 'text-blue-600/80 dark:text-blue-400/80' : 'text-slate-500 dark:text-slate-500'}`}>
                  {group.children.length} item{group.children.length === 1 ? '' : 's'}
                </div>
              </button>
              <button
                onClick={() => toggle(group.name)}
                className="px-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-transparent border-none border-l border-slate-200 dark:border-slate-800 cursor-pointer flex items-center"
                aria-label={isOpen ? 'Collapse' : 'Expand'}
                title={isOpen ? 'Collapse' : 'Expand'}
              >
                {isOpen ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
              </button>
            </div>

            {/* Group items — friendly titles, no file icon, no .md. */}
            {isOpen && (
              <ul className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/60">
                {group.children.map((item) => {
                  const id = `${group.name}/${item.name}`;
                  const isSelected = selectedFile === id;
                  return (
                    <li key={item.name}>
                      <button
                        ref={(el) => { itemRefs.current[id] = el; }}
                        onClick={() => onSelect(id)}
                        className={`w-full text-left px-3 py-1.5 transition-colors bg-transparent border-none cursor-pointer flex items-center gap-2 ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                        title={item.summary}
                      >
                        <span className={`shrink-0 w-1 h-1 rounded-full ${isSelected ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                        <span className="text-[12px] leading-tight truncate">{item.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Map a graph node id (e.g. "Policy:never_disclose_system_prompt",
// "Tool:product_search", "Code:assistant_system_v1.2") to the vault file
// it most plausibly came from. Returns null if no plausible file exists —
// some entity types (Region, Role, generic Tier) aren't authored as
// dedicated docs in this vault.
const SPECIAL_NODE_TO_FILE = {
  'Code:assistant_system_v1.2': 'policies/agent-assistant.md',
  'Code:acme_shopping_assistant': 'policies/agent-assistant.md',
  'Tier:acme_prime': 'customer-tiers/acme-prime.md',
  'Tier:acme_standard': 'customer-tiers/acme-standard.md',
  'Tier:all_customers': 'policies/global-rules.md',
  'Policy:standard_response': 'policies/global-rules.md',
  'Policy:faster_shipping_estimate': 'policies/global-rules.md',
  'Policy:truncate_on_soft_violation': 'policies/global-rules.md',
};

const FOLDER_BY_NODE_TYPE = {
  Tool: ['tools'],
  Policy: ['policies'],
  Code: ['policies', 'tools'],
  Control: ['defense-stack', 'compliance'],
  Tier: ['customer-tiers'],
  DataSource: ['tools', 'policies'],
};

function buildVaultFileSet() {
  const set = new Set();
  for (const folder of VAULT_TREE) {
    for (const file of folder.children) set.add(`${folder.name}/${file.name}`);
  }
  return set;
}
const VAULT_FILE_SET = buildVaultFileSet();

function nodeIdToVaultFile(nodeId) {
  if (SPECIAL_NODE_TO_FILE[nodeId]) return SPECIAL_NODE_TO_FILE[nodeId];
  const colon = String(nodeId || '').indexOf(':');
  if (colon < 0) return null;
  const type = nodeId.slice(0, colon);
  const local = nodeId.slice(colon + 1);
  const folders = FOLDER_BY_NODE_TYPE[type];
  if (!folders) return null;
  // Try snake_case → kebab-case, and also the raw local name (already-kebab).
  const candidates = [
    local.replace(/_/g, '-'),
    local,
  ];
  for (const folder of folders) {
    for (const cand of candidates) {
      const path = `${folder}/${cand}.md`;
      if (VAULT_FILE_SET.has(path)) return path;
    }
  }
  return null;
}

// Looks up the gloss + parent description for a selected id like
// "policies/never-disclose-system-prompt.md".
function lookupSelection({ selectedFile, selectedFolder }) {
  if (selectedFolder) {
    const group = VAULT_TREE.find((g) => g.name === selectedFolder);
    if (group) {
      return {
        kind: 'group',
        name: group.name,
        displayName: group.displayName,
        summary: group.summary,
        children: group.children,
      };
    }
  }
  if (selectedFile) {
    for (const group of VAULT_TREE) {
      for (const item of group.children) {
        const id = `${group.name}/${item.name}`;
        if (id === selectedFile) {
          return {
            kind: 'item',
            groupName: group.name,
            groupDisplayName: group.displayName,
            groupSummary: group.summary,
            title: item.title,
            summary: item.summary,
          };
        }
      }
    }
  }
  return null;
}

export function VaultGraph() {
  const isTenant = useIsTenant();
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState('policies');
  const [graphSelectionInfo, setGraphSelectionInfo] = useState(null); // {nodeId, label, mapped}
  const handleSelect = useCallback((id) => {
    setSelectedFile((prev) => (prev === id ? null : id));
    setSelectedFolder(null);
    setGraphSelectionInfo(null);
  }, []);
  const handleSelectFolder = useCallback((name) => {
    setSelectedFolder((prev) => (prev === name ? null : name));
    setSelectedFile(null);
    setGraphSelectionInfo(null);
  }, []);

  // Graph node click → resolve to a vault file, select it, scroll into view.
  // If the node doesn't map to a file (e.g. Region, Role, generic Tier),
  // clear the file selection and surface a "no source doc" hint instead.
  const handleNodeSelect = useCallback((node) => {
    if (!node) return;
    const path = nodeIdToVaultFile(node.id);
    setGraphSelectionInfo({ nodeId: node.id, label: node.label, type: node.type, mapped: path });
    if (path) {
      setSelectedFile(path);
      setSelectedFolder(null);
    } else {
      setSelectedFile(null);
      setSelectedFolder(null);
    }
  }, []);

  const selection = lookupSelection({ selectedFile, selectedFolder });

  if (isTenant) {
    return (
      <div className="w-full max-w-[1600px] mx-auto p-8">
        <div className="flex items-center gap-3 mb-6">
          <TreeStructure size={22} weight="bold" className="text-slate-400 dark:text-slate-500" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Policy Knowledge Graph
          </h2>
        </div>
        <div className="border border-slate-200 dark:border-slate-800 p-12 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            No policies indexed for this organization yet. Upload your agent's
            policy library via the Bastion CLI or paste markdown into the Policy
            Config tab — Bastion will parse it, extract policies + tools + controls,
            and build the knowledge graph here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-4 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TreeStructure size={22} weight="bold" className="text-slate-400 dark:text-slate-500" />
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Acme Shopping Assistant — Policy Knowledge Graph
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            On the left: every policy, tool, and control your agent operates under, grouped by purpose.
            On the right: the connections Bastion has drawn between them from the policy text + observed agent traffic.
            Click any policy on the left, or any node on the right, to see how the two relate.
          </p>
        </div>
      </div>

      {/* Two-panel layout: titled policy groups + KG force graph */}
      <div className="flex gap-0 border border-slate-200 dark:border-slate-800 overflow-hidden" style={{ height: 820 }}>
        <div className="w-[26%] min-w-[280px] shrink-0 bg-slate-50/80 dark:bg-[#0d1117] border-r border-slate-200 dark:border-slate-800 flex flex-col">
          <div className="px-3 pt-3 pb-2 border-b border-slate-200 dark:border-slate-700/50">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">
              Policy library
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-500 leading-snug">
              Click a group to see what it covers, or a policy to see its summary.
            </p>
          </div>
          <div className="overflow-y-auto p-2 flex-1">
            <PolicyGroups
              selectedFile={selectedFile}
              selectedFolder={selectedFolder}
              onSelect={handleSelect}
              onSelectFolder={handleSelectFolder}
            />
          </div>
          {graphSelectionInfo && !graphSelectionInfo.mapped && (
            <div className="border-t border-slate-200 dark:border-slate-700/50 p-3 bg-white dark:bg-slate-900/40">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                No matching policy
              </div>
              <div className="text-xs text-slate-900 dark:text-slate-100 mb-1.5 break-all">
                {graphSelectionInfo.type}: {graphSelectionInfo.label}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                This node was inferred from telemetry — there's no dedicated policy doc for it yet. Pick another node, or browse the policies above.
              </p>
            </div>
          )}
          {selection && (
            <div className="border-t border-slate-200 dark:border-slate-700/50 p-3 bg-white dark:bg-slate-900/40">
              {selection.kind === 'group' ? (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                    Group
                  </div>
                  <div className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 mb-1.5">{selection.displayName}</div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                    {selection.summary}
                  </p>
                  <div className="text-[10px] text-slate-400 dark:text-slate-600 mt-2">
                    {selection.children.length} item{selection.children.length === 1 ? '' : 's'}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                    Policy
                  </div>
                  <div className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 mb-1.5">{selection.title}</div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                    {selection.summary}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-2 leading-snug">
                    Part of <strong className="text-slate-600 dark:text-slate-400">{selection.groupDisplayName}</strong>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 bg-slate-100 dark:bg-[#0f0f1a] relative overflow-hidden">
          <KnowledgeGraphView embedded onSelectNode={handleNodeSelect} />
        </div>
      </div>
    </div>
  );
}
