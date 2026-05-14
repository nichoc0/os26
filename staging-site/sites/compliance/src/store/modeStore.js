// Bastion mode store — Shadow (monitoring only) vs Enforcement (inline blocking).
//
// The data layer keeps the policy's *intended* action (pass / flag / redact / block).
// What the user sees ("applied") depends on mode:
//   - Shadow: every intended action that would have stopped traffic (block, redact) is
//             surfaced as a flag — Bastion still detects, but does not enforce.
//   - Enforcement: applied === intended.
//
// Persisted to localStorage so the choice survives reloads. Shadow is the default
// because clients build trust through monitoring before flipping to inline blocking.

import { create } from 'zustand';

const STORAGE_KEY = 'bastion.mode';

function loadInitialMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'shadow' || v === 'enforcement') return v;
  } catch {}
  return 'shadow';
}

export const useModeStore = create((set) => ({
  mode: loadInitialMode(),
  setMode: (mode) => {
    if (mode !== 'shadow' && mode !== 'enforcement') return;
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
    set({ mode });
  },
  toggle: () => {
    set((s) => {
      const next = s.mode === 'shadow' ? 'enforcement' : 'shadow';
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return { mode: next };
    });
  },
}));

// Resolve the visible (applied) action for the current mode.
// In Shadow, anything that would actually stop traffic gets demoted to 'flag'
// — the detection still happens, the response still flows.
export function resolveAppliedAction(intended, mode) {
  const a = String(intended || '').toLowerCase();
  if (mode === 'enforcement') return a || 'pass';
  // Shadow mode: surface, do not enforce.
  if (a === 'block' || a === 'redact') return 'flag';
  return a || 'pass';
}

// "Would have blocked" badge counter — counts intended-block events that
// Shadow mode is letting through. Used for the TopBar toggle subtitle.
export function countSuppressedBlocks(events, mode) {
  if (mode !== 'shadow') return 0;
  return (events || []).filter((e) => {
    const a = String(e.action || '').toLowerCase();
    return a === 'block' || a === 'redact';
  }).length;
}
