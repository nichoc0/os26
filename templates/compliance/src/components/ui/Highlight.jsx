import React from 'react';

export function Highlight({ text, highlight }) {
    if (!highlight || !highlight.trim()) return <>{text}</>;

    const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escapedHighlight})`, 'gi'));

    return (
        <span className="transition-all duration-300">
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase()
                    ? <span key={i} className="bg-indigo-300 dark:bg-indigo-500/60 text-indigo-900 dark:text-blue-50 rounded-none px-1 py-0.5 font-bold shadow-[0_0_8px_rgba(99,102,241,0.6)] transition-all duration-300">{part}</span>
                    : part
            )}
        </span>
    );
}
