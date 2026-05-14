import { useState } from 'react';
import { Wrench, CaretDown, CaretRight } from '@phosphor-icons/react';

export function ToolCallCard({ name, input, result }) {
  const [open, setOpen] = useState(true);

  const formatInput = (inp) => {
    if (!inp) return null;
    try {
      return typeof inp === 'string' ? inp : JSON.stringify(inp, null, 2);
    } catch {
      return String(inp);
    }
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500 p-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left cursor-pointer bg-transparent border-none p-0"
      >
        <Wrench size={16} weight="bold" className="text-blue-500 shrink-0" />
        <span className="text-xs font-bold text-blue-700 dark:text-blue-300 font-mono">{name}</span>
        {open ? (
          <CaretDown size={12} className="text-blue-400 ml-auto" />
        ) : (
          <CaretRight size={12} className="text-blue-400 ml-auto" />
        )}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {input && (
            <pre className="text-[10px] font-mono text-blue-800 dark:text-blue-200 bg-blue-100/50 dark:bg-blue-900/30 p-2 overflow-x-auto whitespace-pre-wrap">
              {formatInput(input)}
            </pre>
          )}
          {result && (
            <div className="bg-blue-100/30 dark:bg-blue-900/10 p-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">Result</span>
              <pre className="text-[10px] font-mono text-slate-700 dark:text-slate-300 mt-1 whitespace-pre-wrap">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
