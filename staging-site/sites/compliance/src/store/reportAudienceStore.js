// Posture Report audience selector — Client / Insurance / External audit.
//
// Three target audiences for the same underlying report. Driven by a URL
// param (?audience=client|insurance|audit) so links into a particular
// audience view are shareable (Slack, email, the Trust-Center-style
// shareable link). Default on first load = 'client'.
//
// Distinct from `audienceStore.js` (the site-wide /dev vs /insurance
// path-based concept). This store is specifically the Posture Report
// reader-mode selector that lives in the TopBar pill triplet.

import { create } from 'zustand';

export const REPORT_AUDIENCES = ['client', 'insurance', 'audit'];

function readUrlAudience() {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  // Backward-compat: legacy `?share=TOKEN` links map to audience=audit
  // (Vanta Trust Center pattern — recipient lands on the external-evidence
  // view, no Bastion account needed).
  if (p.get('share')) return 'audit';
  const a = p.get('audience');
  return REPORT_AUDIENCES.includes(a) ? a : null;
}

const initial = readUrlAudience() || 'client';

export const useReportAudienceStore = create((set) => ({
  audience: initial,
  setAudience: (next) => {
    if (!REPORT_AUDIENCES.includes(next)) return;
    set({ audience: next });
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (next === 'client') url.searchParams.delete('audience');
    else url.searchParams.set('audience', next);
    // If we're moving away from audit, clear any legacy share token.
    if (next !== 'audit') url.searchParams.delete('share');
    window.history.replaceState({}, '', url.toString());
  },
}));

export const useReportAudience = () => useReportAudienceStore((s) => s.audience);
export const useSetReportAudience = () => useReportAudienceStore((s) => s.setAudience);

// Audience preset: default scopes auto-applied when the audience changes
// (operator can still edit). Per-persona because the load-bearing
// frameworks differ by vertical:
//   maple-pharmacy → HIPAA + ISO 14971 (healthcare)
//   demo-arabic-bank       → CBB Rulebook Vol 2 + AAOIFI GS (Bahraini Islamic bank)
const PRESETS_BY_PERSONA = {
  'maple-pharmacy': {
    client:    new Set(['hipaa', 'iso-14971', 'soc2', 'eu-ai-act', 'nist-ai-rmf', 'owasp-llm', 'mitre-atlas', 'insurance-risk']),
    insurance: new Set(['insurance-risk', 'hipaa']),
    audit:     new Set(['hipaa', 'iso-14971']),
  },
  'demo-arabic-bank': {
    client:    new Set(['cbb-vol2', 'aaoifi-gs', 'fatf', 'iso-42001', 'eu-ai-act', 'nist-ai-rmf', 'owasp-llm', 'mitre-atlas', 'insurance-risk']),
    insurance: new Set(['insurance-risk', 'cbb-vol2']),
    audit:     new Set(['cbb-vol2', 'aaoifi-gs']),
  },
};

const DEFAULT_PRESET_PERSONA = 'maple-pharmacy';

export function audiencePreset(audience, personaSlug = DEFAULT_PRESET_PERSONA) {
  const personaPresets = PRESETS_BY_PERSONA[personaSlug] || PRESETS_BY_PERSONA[DEFAULT_PRESET_PERSONA];
  return new Set(personaPresets[audience] || personaPresets.client);
}

// Per-audience surface flags. `isExternal` strips internal-only fields
// (owner names, management responses, attack-string excerpts, drill-in
// links) — only `audit` triggers this. `isUnderwriter` adds the
// underwriter-emphasis subtitle without stripping anything (underwriter
// wants to drill into evidence).
export function audienceFlags(audience) {
  return {
    isExternal: audience === 'audit',
    isUnderwriter: audience === 'insurance',
    isClient: audience === 'client',
    showShareCta: audience !== 'audit',
    showEditScopes: audience !== 'audit',
    showHashChainLanguage: audience === 'audit',
  };
}
