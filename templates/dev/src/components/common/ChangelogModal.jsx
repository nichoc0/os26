import { useEffect, useState } from 'react';
import { X, Sparkle } from '@phosphor-icons/react';
import { fetchChangelog } from '../data/api';

const STORAGE_KEY = 'bastion.changelog.lastSeen';
const MAX_ENTRIES = 3;

function formatDate(iso) {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function ChangelogModal({ open, onClose, autoOpen = false }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchChangelog()
      .then(d => {
        if (cancelled) return;
        const list = Array.isArray(d) ? d : (d?.entries || []);
        setEntries(list.slice(0, MAX_ENTRIES));
      })
      .catch(() => setEntries([]));
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const latestDate = entries[0]?.date;

  const handleClose = () => {
    if (autoOpen && latestDate) {
      try { localStorage.setItem(STORAGE_KEY, latestDate); } catch {}
    }
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkle size={18} weight="fill" className="text-blue-500" />
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">What's New</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {entries.length === 0 && (
            <div className="text-sm text-slate-500 dark:text-slate-400">No recent updates.</div>
          )}
          {entries.map((entry, idx) => (
            <section key={idx} className="space-y-2">
              <header className="flex items-baseline justify-between gap-3 pb-1 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{entry.title}</h3>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">
                  {formatDate(entry.date)}
                </span>
              </header>
              <ul className="space-y-1.5">
                {(entry.items || []).map((item, i) => (
                  <li key={i} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex gap-2">
                    <span className="text-blue-500 dark:text-blue-400 shrink-0 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function shouldAutoOpenChangelog(latestDate) {
  if (!latestDate) return false;
  try {
    const seen = localStorage.getItem(STORAGE_KEY);
    return seen !== latestDate;
  } catch {
    return true;
  }
}
