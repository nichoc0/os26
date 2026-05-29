// Operator disposition store — when a reviewer approves or rejects a
// flagged/blocked event via the EventDrilldown banner, the decision is
// persisted here so:
//
//   1. The Inspector's "Needs Attention" list filters the event out
//      (it's been actioned).
//   2. A separate "Recently resolved" list surfaces the same event with
//      its destination ("→ Resolved queue" / "→ Incident register") so
//      the operator can see where it went.
//   3. The decision survives a page reload — feedback from Yousuf
//      (GCC) 2026-05-27: "when an item is approved of blocked it
//      should be reflected in the in the INSPECTOR section."
//
// Scoped per persona slug so a reviewer testing across multiple demo
// orgs doesn't see crossover. localStorage-backed; this is a demo
// surface, no backend yet.

import { create } from 'zustand';

const KEY_PREFIX = 'bastion.dispositions.v1';
function storageKey(persona) { return `${KEY_PREFIX}.${persona || 'default'}`; }

function loadFromStorage(persona) {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(persona));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToStorage(persona, map) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(persona), JSON.stringify(map));
  } catch {
    /* quota or disabled — ignore */
  }
}

// Destination labels — what the banner tells the operator on Approve /
// Reject, kept in lockstep with EventDrilldown's success-banner copy.
export const DISPOSITION_DESTINATION = {
  approved: 'Resolved queue',
  rejected: 'Incident register',
};

export const useDispositionStore = create((set, get) => ({
  // map: { [eventId]: { state: 'approved'|'rejected', decidedAt: iso, destination: string } }
  byPersona: {},

  hydrate: (persona) => {
    const byPersona = { ...get().byPersona };
    if (!byPersona[persona]) byPersona[persona] = loadFromStorage(persona);
    set({ byPersona });
  },

  setDisposition: (persona, eventId, state) => {
    if (!eventId || (state !== 'approved' && state !== 'rejected')) return;
    const byPersona = { ...get().byPersona };
    const current = { ...(byPersona[persona] || {}) };
    current[String(eventId)] = {
      state,
      decidedAt: new Date().toISOString(),
      destination: DISPOSITION_DESTINATION[state],
    };
    byPersona[persona] = current;
    set({ byPersona });
    saveToStorage(persona, current);
  },

  clearDisposition: (persona, eventId) => {
    const byPersona = { ...get().byPersona };
    const current = { ...(byPersona[persona] || {}) };
    delete current[String(eventId)];
    byPersona[persona] = current;
    set({ byPersona });
    saveToStorage(persona, current);
  },
}));

// Convenience selectors. Components that only need to *read* should use
// these so they re-render only when their slice changes.
export function useDispositionMap(persona) {
  return useDispositionStore((s) => s.byPersona[persona] || {});
}

export function useDispositionFor(persona, eventId) {
  return useDispositionStore((s) => (s.byPersona[persona] || {})[String(eventId)] || null);
}
