// Bastion audience store — Insurance (default) vs Dev.
//
// The audience is fixed by URL once at app boot, like /cli-login and /docs:
//   /        → 'insurance'
//   /dev*    → 'dev'
// Components read `useIsDev()` to gate insurance-only sections (Underwriting
// Report, Coverage Map nav, Risk Score copy) and dev-only sections (CI Runs
// panel inside Adversarial Assessment). No toggle UI; same data, different
// framing per audience.

import { create } from 'zustand';

function detectAudience() {
  if (typeof window === 'undefined') return 'insurance';
  return window.location.pathname.startsWith('/dev') ? 'dev' : 'insurance';
}

const initial = detectAudience();

export const useAudienceStore = create(() => ({
  audience: initial,
  isDev: initial === 'dev',
}));

export const useAudience = () => useAudienceStore((s) => s.audience);
export const useIsDev = () => useAudienceStore((s) => s.isDev);
