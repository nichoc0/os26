// Weighted-component breakdown of the fleet risk score. Lifted out of
// RiskBreakdown so the Overview page can lead with it (per Luyun: "this
// should be one of the most prominent numbers — PII, etc. should have
// breakdowns on the overview page as this is the highest-ROI thing a
// high-level officer cares about").
//
// Each row is clickable and deep-links to the relevant detail surface.
import { ArrowSquareOut } from '@phosphor-icons/react';
import { riskComponents } from '../../data/fleetReportFixture';

const CARD = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none';

function Bar({ value, max = 100 }) {
  const pct = Math.min((Math.max(0, value) / max) * 100, 100);
  return (
    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800">
      <div className="h-full bg-blue-600 dark:bg-blue-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ScoreDecomposition({ reportData, setCurrentView, persona, compact = false, title = 'Score Decomposition', subtitle = 'Per-rail control effectiveness. Higher = better. The headline risk score is residual hazard after controls — not a weighted average of these values.', hideHeaderLink = false, disableRowLinks = false }) {
  const components = reportData?.risk_assessment?.component_scores || {};
  const COMPONENTS = riskComponents(persona?.slug);
  const nav = (view) => () => setCurrentView?.(view);

  return (
    <div className={`${CARD} ${compact ? 'p-5' : 'p-6'}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">{title}</h3>
        {setCurrentView && !hideHeaderLink && (
          <button
            onClick={nav('risk')}
            className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer bg-transparent border-none inline-flex items-center gap-1 transition-colors"
          >
            Full risk breakdown <ArrowSquareOut size={10} />
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400 mb-5">{subtitle}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="text-left py-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Component</th>
            <th className="text-right py-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px] w-16">Weight</th>
            <th className="text-right py-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px] w-20" title="Per-rail control effectiveness, expressed as a percentage. Higher = better. NOT the contribution to the headline risk score — that is computed separately from hazard severity, not as a weighted average of these values.">Health %</th>
            <th className="py-2 w-28"></th>
            <th className="py-2 w-6"></th>
          </tr>
        </thead>
        <tbody>
          {COMPONENTS.map((c) => {
            const score = components[c.key] ?? 0;
            const rowClick = disableRowLinks ? undefined : nav(c.link);
            return (
              <tr
                key={c.key}
                onClick={rowClick}
                className={`border-b border-slate-100 dark:border-slate-800/50 ${rowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors' : ''}`}
              >
                <td className="py-3">
                  <div className="font-semibold text-slate-700 dark:text-slate-200">{c.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{c.desc}</div>
                </td>
                <td className="text-right font-mono text-slate-500 py-3">{c.weight}%</td>
                <td className="text-right font-bold text-slate-800 dark:text-slate-100 py-3 tabular-nums">{Number(score).toFixed(1)}</td>
                <td className="py-3 pl-3"><Bar value={score} /></td>
                {rowClick ? (
                  <td className="py-3 pl-1 text-slate-300 dark:text-slate-600"><ArrowSquareOut size={11} /></td>
                ) : (
                  <td className="py-3 pl-1"></td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
