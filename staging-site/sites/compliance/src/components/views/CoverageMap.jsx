import { useEffect, useState } from 'react';
import { Shield, ArrowRight, CheckCircle, Warning, XCircle } from '@phosphor-icons/react';
import { fetchCoverage } from '../data/api';

const STATUS_STYLE = {
  green: {
    badge: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    label: 'Healthy',
    Icon: CheckCircle,
    accent: 'border-l-blue-300 dark:border-l-blue-700',
  },
  yellow: {
    badge: 'bg-blue-100 dark:bg-blue-600/15 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
    label: 'Watch',
    Icon: Warning,
    accent: 'border-l-blue-500',
  },
  red: {
    badge: 'bg-blue-900/10 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 border-blue-800 dark:border-blue-700',
    label: 'Action Needed',
    Icon: XCircle,
    accent: 'border-l-blue-800 dark:border-l-blue-300',
  },
};

const TONE_STYLE = {
  good: 'text-blue-600 dark:text-blue-400',
  warn: 'text-slate-800 dark:text-slate-100',
  neutral: 'text-slate-600 dark:text-slate-300',
};

const VIEW_LABELS = {
  telemetry: 'Live Activity',
  risk: 'Risk Score',
  report: 'Underwriting Report',
};

export function CoverageMap({ setCurrentView }) {
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCoverage()
      .then(d => {
        setBuckets(Array.isArray(d) ? d : (d?.buckets || []));
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-12">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Shield size={24} weight="bold" className="text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Coverage Map</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Telemetry health by coverage line.
            </p>
          </div>
        </div>
      </header>

      {loading && (
        <div className="text-sm text-slate-500 dark:text-slate-400">Loading coverage map...</div>
      )}
      {error && !loading && import.meta.env.VITE_APP_MODE !== 'production' && (
        <div className="text-sm text-rose-600 dark:text-rose-400">Failed to load: {error}</div>
      )}
      {error && !loading && import.meta.env.VITE_APP_MODE === 'production' && (
        <div className="text-sm text-slate-500 dark:text-slate-400">No coverage data yet. Connect telemetry to populate this view.</div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {buckets.map((b) => {
            const style = STATUS_STYLE[b.status] || STATUS_STYLE.green;
            const Icon = style.Icon;
            return (
              <div
                key={b.id}
                className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-l-4 ${style.accent} p-5 space-y-3`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500">{b.label}</div>
                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mt-0.5">{b.longLabel || b.label}</h2>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${style.badge}`}>
                    <Icon size={10} weight="fill" />
                    {style.label}
                  </span>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1.5">
                  {(b.signals || []).map((sig, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400 truncate" title={sig.label}>{sig.label}</span>
                      <span className={`font-mono font-bold tabular-nums ${TONE_STYLE[sig.tone] || TONE_STYLE.neutral}`}>
                        {sig.value}
                      </span>
                    </div>
                  ))}
                </div>

                {b.signals?.[0]?.source_view && (
                  <button
                    onClick={() => setCurrentView(b.signals[0].source_view)}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer bg-transparent border-none p-0 mt-1"
                  >
                    View detail in {VIEW_LABELS[b.signals[0].source_view] || b.signals[0].source_view}
                    <ArrowRight size={12} weight="bold" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
