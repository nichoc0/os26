import { Phone, ClockCounterClockwise } from '@phosphor-icons/react';
import LiveVoiceView from './LiveVoiceView';
import VoiceRunsPanel from './VoiceRunsPanel';

// CallsPanel — single consolidated view for the Voice Testing surface.
// Live Voice gets the full width — the WebSockets pane was redundant
// for the demo audience (their voice is over voice, not WS targets)
// and visually cluttered the row. Spawn Probe is in the top-right of
// the parent VoiceTestingView as a modal trigger.
//
//   ┌──────────────────────────────────────┐
//   │ LIVE CALLS                           │
//   │ ┌──────────────────────────────────┐ │
//   │ │ Live Voice (full-width)          │ │
//   │ └──────────────────────────────────┘ │
//   │ PAST RUNS                            │
//   │ <VoiceRunsPanel>                     │
//   └──────────────────────────────────────┘

export default function CallsPanel() {
  return (
    <div className="flex flex-col gap-6 px-6 py-5">
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">Live calls</h2>
        </div>
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-none">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Phone size={12} weight="bold" className="text-slate-500 dark:text-slate-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Live voice</span>
          </div>
          <div className="h-[360px]">
            <LiveVoiceView embedded />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <ClockCounterClockwise size={14} weight="bold" className="text-slate-500 dark:text-slate-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">Past runs</h2>
        </div>
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-none">
          <VoiceRunsPanel embedded />
        </div>
      </section>
    </div>
  );
}
