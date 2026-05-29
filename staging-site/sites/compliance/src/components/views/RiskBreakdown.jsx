import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowLeft, CurrencyDollar, ShieldCheck, ArrowSquareOut } from '@phosphor-icons/react';
import { ScoreDecomposition } from '../common/ScoreDecomposition';
import { riskComponents, agentLabels as agentLabelsForPersona, stableJitter } from '../../data/fleetReportFixture';
import { useLiveRiskPulse } from '../../data/useLiveRiskPulse';

// Live-pulse data + jitter hash now live in `data/useLiveRiskPulse.js`
// and `data/fleetReportFixture.js` so the Overview Posture Report card
// renders the same numbers from the same hook.

const CARD = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none';

function Bar({ value, max = 100 }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800">
      <div className="h-full bg-blue-600 dark:bg-blue-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function LinkText({ onClick, children }) {
  return (
    <button onClick={onClick} className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer bg-transparent border-none inline-flex items-center gap-1 transition-colors">
      {children}
      <ArrowSquareOut size={10} />
    </button>
  );
}

function ClickableStat({ label, value, sub, onClick, linkLabel }) {
  return (
    <div
      onClick={onClick}
      className={`${onClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors' : ''} p-3 border border-slate-100 dark:border-slate-700`}
    >
      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mb-1">{label}</div>
      <div className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
      {onClick && linkLabel && (
        <div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
          {linkLabel} <ArrowSquareOut size={9} />
        </div>
      )}
    </div>
  );
}

export function RiskBreakdown({ reportData, setCurrentView, persona }) {
  const risk = reportData?.risk_assessment || {};
  const fleet = reportData?.fleet_summary || {};
  const metrics = reportData?.metrics || {};
  const exposure = reportData?.exposure || {};

  const pii = metrics.pii || {};
  const tools = metrics.tool_calls || {};
  const anomalies = metrics.anomalies || {};
  const components = risk.component_scores || {};
  const agentExposure = exposure.exposure_by_agent || [];
  const severities = fleet.incidents_by_severity || {};

  // Live pulse — shared hook ticks every 4 s and returns the live-
  // jittered risk numbers. Overview's Posture Report card reads the
  // SAME hook, so the two surfaces never drift visually.
  const { grossRisk, netRisk, reductionPct, liveStats, pulseBucket } = useLiveRiskPulse(reportData);

  const nav = (view) => () => setCurrentView?.(view);

  const personaSlug = persona?.slug || 'maple-pharmacy';
  const agentLabels = agentLabelsForPersona(personaSlug);

  const sevList = [
    { name: 'SEV-1', count: severities.sev1_critical ?? 0, desc: 'Critical' },
    { name: 'SEV-2', count: severities.sev2_major ?? 0, desc: 'Major' },
    { name: 'SEV-3', count: severities.sev3_moderate ?? 0, desc: 'Moderate' },
    { name: 'SEV-4', count: severities.sev4_minor ?? 0, desc: 'Minor' },
    { name: 'SEV-5', count: severities.sev5_info ?? 0, desc: 'Info' },
  ];
  const totalIncidents = sevList.reduce((s, d) => s + d.count, 0);

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-12">

      {/* Summary */}
      <div className={`${CARD} p-6`}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={18} weight="bold" className="text-slate-600 dark:text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Fleet Risk Assessment</h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {fleet.total_transactions?.toLocaleString() || 0} transactions across {fleet.agents_monitored || 0} agents over {fleet.monitoring_hours?.toLocaleString() || 0} hours
            </p>
          </div>
          {risk.risk_classification ? (
            <div className="text-right">
              <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {risk.risk_classification}
              </span>
            </div>
          ) : null}
        </div>

        {/* With Controls (lead) → reduction → Without Controls (counterfactual) */}
        <div className="grid grid-cols-3 gap-6 items-center">
          <div className="text-center py-4 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">With Controls</div>
            <div className="text-4xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{netRisk.toFixed(1)}</div>
            <div className="text-[10px] text-slate-400 mt-1">Net risk score</div>
          </div>
          <div className="text-center py-4">
            <ArrowLeft size={20} className="text-slate-300 mx-auto mb-2" />
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">-{reductionPct.toFixed(0)}%</div>
            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-1">with Bastion Blue</div>
          </div>
          <div className="text-center py-4 border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Without Controls</div>
            <div className="text-4xl font-bold text-slate-800 dark:text-slate-100 tabular-nums">{grossRisk.toFixed(1)}</div>
            <div className="text-[10px] text-slate-400 mt-1">Gross risk score</div>
          </div>
        </div>

        {/* Key stats — live-jittered from sweep activity */}
        <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100 dark:border-slate-700">
          <ClickableStat
            label="PII Remediation"
            value={`${((fleet.pii_remediation_rate ?? 0) * 100 - stableJitter('piiRem', pulseBucket) * 0.4).toFixed(1)}%`}
            sub={`${(pii.total_detections ?? 0) + Math.floor(liveStats.findings * 0.3)} detected, ${pii.residual_exposures ?? 0} residual`}
          />
          <ClickableStat
            label="Actions Blocked"
            value={(tools.total_blocked ?? 0) + Math.floor(liveStats.findings * 0.4)}
            sub={`of ${((tools.total_attempted ?? 0) + liveStats.runs * 6).toLocaleString()} attempted`}
          />
          <ClickableStat
            label="Anomalies Flagged"
            value={(anomalies.total_anomalies ?? 0) + Math.floor(liveStats.findings * 0.2)}
            sub={`${(((fleet.anomaly_rate ?? 0) * 100) + stableJitter('anom', pulseBucket) * 0.3).toFixed(2)}% anomaly rate`}
          />
          <ClickableStat
            label="Total Incidents"
            value={(totalIncidents + Math.floor(liveStats.findings * 0.6)).toLocaleString()}
            sub={`${severities.sev1_critical ?? 0} critical, ${(severities.sev2_major ?? 0) + Math.floor(liveStats.findings * 0.1)} major`}
          />
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Component Scores — shared component, also rendered prominently
            on the Overview page so the same breakdown is the lead surface. */}
        <ScoreDecomposition reportData={reportData} setCurrentView={setCurrentView} persona={persona} hideHeaderLink disableRowLinks />


        {/* Control Effectiveness — replaces the prior Financial Exposure
            card. We don't have a PII-liability / class-action settlement
            dataset, so the previous "$180/record" framing was made up.
            This card reports only data we actually observe: PHI rail
            detections, tool-call enforcement attempts, anomaly rate,
            monitoring throughput. Buyer-facing claim is "Bastion catches
            and blocks" not "Bastion saves X dollars". */}
        <div className={`${CARD} p-6`}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Control Effectiveness</h3>
          </div>
          <p className="text-[11px] text-slate-400 mb-5">What Bastion observed and what it stopped during this period</p>

          <div className="space-y-4">
            {/* Detection + enforcement */}
            <div className="border border-slate-100 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Detection & Enforcement</span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 text-slate-500">PHI rail detections</td>
                    <td className="py-2 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums">{(pii.total_detections ?? 0).toLocaleString()}</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 text-slate-500">Redacted at-rest by Bastion</td>
                    <td className="py-2 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums">{Math.max(0, (pii.total_detections ?? 0) - (pii.residual_exposures ?? 0)).toLocaleString()}</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 text-slate-500">Residual (review queue)</td>
                    <td className="py-2 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums">{pii.residual_exposures ?? 0}</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 text-slate-500">Tool calls attempted</td>
                    <td className="py-2 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums">{(tools.total_attempted ?? 0).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500 font-semibold">Blocked by policy</td>
                    <td className="py-2 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums">{(tools.total_blocked ?? 0).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Operating throughput */}
            <div className="border border-slate-100 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Operating Throughput</div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Transactions observed</span><span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{(fleet.total_transactions ?? 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Monitoring hours</span><span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{(fleet.monitoring_hours ?? 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Anomaly rate</span><span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{((fleet.anomaly_rate ?? 0) * 100).toFixed(2)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Avg latency</span><span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{((fleet.avg_latency_ms ?? 0) / 1000).toFixed(1)}s</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Severity */}
        <div className={`${CARD} p-6`}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Severity Distribution</h3>
          </div>
          <p className="text-[11px] text-slate-400 mb-4">{totalIncidents.toLocaleString()} incidents over 6 months</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-2 text-slate-500 font-semibold text-[10px] uppercase tracking-wider">Level</th>
                <th className="text-right py-2 text-slate-500 font-semibold text-[10px] uppercase tracking-wider">Count</th>
                <th className="text-right py-2 text-slate-500 font-semibold text-[10px] uppercase tracking-wider w-16">%</th>
                <th className="py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {sevList.map((s) => {
                const pct = totalIncidents > 0 ? (s.count / totalIncidents * 100) : 0;
                return (
                  <tr key={s.name} className="border-b border-slate-100 dark:border-slate-800/50">
                    <td className="py-2.5">
                      <span className="font-bold text-slate-700 dark:text-slate-200">{s.name}</span>
                      <span className="text-slate-400 ml-2">{s.desc}</span>
                    </td>
                    <td className="py-2.5 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums">{s.count.toLocaleString()}</td>
                    <td className="py-2.5 text-right text-slate-400 tabular-nums">{pct.toFixed(1)}%</td>
                    <td className="py-2.5 pl-3"><Bar value={pct} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Per-Agent */}
        <div className={`${CARD} p-6`}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Agent Risk Contribution</h3>
          </div>
          <p className="text-[11px] text-slate-400 mb-4">Proportion of fleet risk attributed to each agent</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-2 text-slate-500 font-semibold text-[10px] uppercase tracking-wider">Agent</th>
                <th className="text-right py-2 text-slate-500 font-semibold text-[10px] uppercase tracking-wider">Txns</th>
                <th className="text-right py-2 text-slate-500 font-semibold text-[10px] uppercase tracking-wider">PII</th>
                <th className="text-right py-2 text-slate-500 font-semibold text-[10px] uppercase tracking-wider">Tools</th>
                <th className="text-right py-2 text-slate-500 font-semibold text-[10px] uppercase tracking-wider">Risk %</th>
                <th className="py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {agentExposure.map((a) => (
                <tr key={a.agent_id} className="border-b border-slate-100 dark:border-slate-800/50">
                  <td className="py-2.5 font-semibold text-slate-700 dark:text-slate-200">{agentLabels[a.agent_id] || a.agent_id}</td>
                  <td className="py-2.5 text-right text-slate-800 dark:text-slate-100 tabular-nums">{a.transactions.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-slate-800 dark:text-slate-100 tabular-nums">{a.pii_records}</td>
                  <td className="py-2.5 text-right text-slate-800 dark:text-slate-100 tabular-nums">{a.tool_calls.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums">{a.risk_contribution.toFixed(1)}%</td>
                  <td className="py-2.5 pl-3"><Bar value={a.risk_contribution} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
