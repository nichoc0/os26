import React, { useState } from 'react';
import { Question } from '@phosphor-icons/react';

export function InfoTooltip({ content }) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="relative flex items-center inline-flex ml-2"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <Question size={14} className="text-slate-400 hover:text-indigo-500 transition-colors cursor-help" />

            {isHovered && (
                <div className="absolute left-1/2 -ml-32 sm:-ml-40 top-full mt-2 w-64 sm:w-80 bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-none shadow-2xl p-3 z-[100] animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
                    <div className="absolute left-1/2 -ml-2 bottom-full w-4 h-4 mb-[-8px] bg-slate-900 border-t border-l border-slate-700 transform rotate-45"></div>
                    <p className="font-medium text-white mb-1">What does this mean?</p>
                    <p className="text-slate-300 leading-relaxed font-normal normal-case tracking-normal">{content}</p>
                </div>
            )}
        </div>
    );
}
