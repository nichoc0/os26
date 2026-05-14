import { useState } from 'react';
import { Brain, CaretDown, CaretRight } from '@phosphor-icons/react';

export function ThinkingBlock({ content }) {
  const [open, setOpen] = useState(false);

  if (!content) return null;

  return (
    <div className="bg-violet-50 dark:bg-violet-900/20 border-l-2 border-violet-500 p-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left cursor-pointer bg-transparent border-none p-0"
      >
        <Brain size={16} weight="bold" className="text-violet-500 shrink-0" />
        <span className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">Thinking</span>
        {open ? (
          <CaretDown size={12} className="text-violet-400 ml-auto" />
        ) : (
          <CaretRight size={12} className="text-violet-400 ml-auto" />
        )}
      </button>
      {open && (
        <pre className="mt-3 text-[11px] font-mono text-violet-800 dark:text-violet-200 whitespace-pre-wrap leading-relaxed">
          {content}
        </pre>
      )}
    </div>
  );
}
