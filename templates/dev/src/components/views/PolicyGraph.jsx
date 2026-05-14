import { useState } from 'react';
import { Graph, Shield, Warning, UploadSimple } from '@phosphor-icons/react';

const DEFAULT_POLICY = {
  client: 'Bastion Blue',
  version: '2.1',
  agents: [
    { id: 'client_advisor', label: 'Client Advisor', risk: 'HIGH', color: '#2563eb', model: 'gemini-2.5-flash',
      approved: ['check_portfolio', 'get_account_balance', 'market_lookup', 'escalate_to_human'],
      blocked: ['execute_trade', 'transfer_funds'] },
    { id: 'doc_analyst', label: 'Doc Analyst', risk: 'MEDIUM', color: '#1e40af', model: 'gemini-2.5-flash',
      approved: ['read_document', 'extract_fields', 'classify_risk_profile', 'write_to_crm'],
      blocked: ['write_compliance_db', 'delete_document'] },
    { id: 'research_analyst', label: 'Research Analyst', risk: 'MEDIUM-HIGH', color: '#3b82f6', model: 'gemini-2.5-flash',
      approved: ['query_knowledge_graph', 'draft_memo', 'draft_email', 'search_filings'],
      blocked: ['send_email', 'query_external_api'] },
    { id: 'compliance_monitor', label: 'Compliance Monitor', risk: 'MEDIUM', color: '#475569', model: 'gemini-2.5-flash',
      approved: ['check_compliance_calendar', 'audit_trail_query', 'flag_overdue_kyc', 'generate_compliance_report'],
      blocked: ['modify_compliance_record', 'delete_audit_log'] },
    { id: 'onboarding_bot', label: 'Onboarding Bot', risk: 'MEDIUM', color: '#1d4ed8', model: 'gemini-2.5-flash',
      approved: ['verify_identity', 'collect_kyc_info', 'create_account', 'schedule_advisor_meeting'],
      blocked: ['approve_account', 'transfer_funds'] },
    { id: 'portfolio_rebalancer', label: 'Portfolio Rebalancer', risk: 'HIGH', color: '#0f172a', model: 'gemini-2.5-flash',
      approved: ['analyze_portfolio', 'suggest_rebalance', 'calculate_tax_impact', 'generate_trade_list'],
      blocked: ['execute_trade', 'wire_transfer'] },
  ],
  globalBlocked: ['drop_table', 'delete_record', 'execute_trade_direct', 'wire_transfer'],
  globalRules: [
    { rule: 'Max Chain Depth', value: '5 tool calls' },
    { rule: 'Session Timeout', value: '30 minutes' },
    { rule: 'PII Patterns', value: 'SIN, Account #, Credit Card, Email, Phone' },
    { rule: 'Rate Limit', value: '10 calls / 5 seconds' },
    { rule: 'Fallback Action', value: 'Block + Log + Notify CCO' },
    { rule: 'Compliance Framework', value: 'CIRO 3400 / AMF / NI 81-101' },
  ],
};

function riskBadgeClass(risk) {
  if (risk === 'HIGH') return 'bg-slate-200 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-800 dark:border-blue-800';
  if (risk === 'MEDIUM-HIGH') return 'bg-blue-100 dark:bg-blue-600/30 text-blue-700 dark:text-blue-400 border-blue-500 dark:border-blue-500';
  return 'bg-blue-50 dark:bg-blue-300/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-300';
}

export function PolicyGraph({ data }) {
  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');
      const resp = await fetch(`${API_BASE}/api/policy/upload`, { method: 'POST', body: formData });
      const parsed = await resp.json();
      if (parsed.agents) setPolicy(parsed);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-12">
      {/* Upload + Header */}
      <div className="flex items-center gap-4 mb-2">
        <Graph size={24} weight="bold" className="text-slate-400" />
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Policy Configuration</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {policy.client} — v{policy.version}
          </p>
        </div>
        <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold cursor-pointer hover:bg-blue-700 transition-colors shrink-0">
          <UploadSimple size={16} weight="bold" />
          Upload Policy Document
          <input type="file" accept=".docx,.pdf" onChange={handleUpload} className="hidden" />
        </label>
        {uploading && <span className="text-sm text-blue-400">Parsing document...</span>}
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Per-Agent Policy Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
            <Shield size={16} weight="bold" className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Per-Agent Policy</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            <div className="grid grid-cols-[1fr_80px_1fr_1fr_100px] gap-3 px-5 py-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
              <span>Agent</span>
              <span>Risk</span>
              <span>Approved Tools</span>
              <span>Blocked Tools</span>
              <span>Enforcement</span>
            </div>
            {policy.agents.map(agent => (
              <div key={agent.id} className="grid grid-cols-[1fr_80px_1fr_1fr_100px] gap-3 px-5 py-3 items-start hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: agent.color }} />
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{agent.label}</span>
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border inline-flex items-center w-fit ${riskBadgeClass(agent.risk)}`}>
                  {agent.risk}
                </span>
                <div className="flex flex-wrap gap-1">
                  {(agent.approved || []).map(t => (
                    <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 bg-blue-50 dark:bg-blue-300/20 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-300">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(agent.blocked || []).map(t => (
                    <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-200 dark:bg-blue-900/30 text-slate-700 dark:text-blue-300 border border-slate-400 dark:border-blue-700">
                      {t}
                    </span>
                  ))}
                </div>
                <span className="text-[9px] text-slate-700 dark:text-slate-400">T1 + T2</span>
              </div>
            ))}
          </div>
        </div>

        {/* Global Rules Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
            <Warning size={16} weight="bold" className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Global Rules</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            <div className="grid grid-cols-[1fr_1fr] gap-3 px-5 py-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
              <span>Rule</span>
              <span>Value</span>
            </div>
            {(policy.globalRules || []).map(({ rule, value }) => (
              <div key={rule} className="grid grid-cols-[1fr_1fr] gap-3 px-5 py-3 items-center hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{rule}</span>
                <span className="text-[11px] font-mono text-slate-700 dark:text-slate-400">{value}</span>
              </div>
            ))}
            {/* Global blocked tools */}
            <div className="grid grid-cols-[1fr_1fr] gap-3 px-5 py-3 items-start hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">Globally Blocked</span>
              <div className="flex flex-wrap gap-1">
                {(policy.globalBlocked || []).map(t => (
                  <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-200 dark:bg-blue-900/30 text-slate-700 dark:text-blue-300 border border-slate-400 dark:border-blue-700">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
