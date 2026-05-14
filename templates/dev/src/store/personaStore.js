import { useOrganization } from '@clerk/clerk-react';

// Persona resolution. Pre-2026-05-10 this was a Zustand-backed picker
// with three hardcoded demo personas. As of 2026-05-10 the source of
// truth is the user's Clerk **organization** — same identity model
// bastion.pistonsolutions.ai uses for /cli-login. Switching orgs in
// the Clerk OrganizationSwitcher (TopBar) automatically re-scopes the
// dashboard.
//
// Each Bastion customer is represented as a Clerk organization. The
// mapping from Clerk org → Bastion customer config is keyed by the
// organization's slug (case-insensitive). When the org's slug doesn't
// match anything in PERSONA_CONFIG, the default Maple Ridge Pharmacy
// persona is used as a safe demo fallback.
//
// To add a customer:
//   1. Create the org in Clerk dashboard (Organizations → New).
//   2. Set its slug to a known key (e.g. `maple-pharmacy`,
//      `acme-logistics`).
//   3. Add a matching entry below.
//   4. Publish a report.json at
//      bastion-blue/public/static-api/customers/<slug>/report.json
//      so the Posture Report has data to render.

export const PERSONA_CONFIG = {
    'maple-pharmacy': {
        slug: 'maple-pharmacy',
        label: 'Demo Pharmacy',
        vertical: 'Pharmacy',
        frameworks: ['FDA AI/ML', 'ISO 14971', 'HIPAA'],
        reportSlug: 'maple-pharmacy',
        addOns: { insurance: false, fda: true },
        targetAgent: 'Sera (pharmacy intake)',
        targetDID: '+1 450-800-0197',
        tagline: 'FDA-anchored attestation. Pharmacy intake voice agent.',
    },
    'acme-logistics': {
        slug: 'acme-logistics',
        label: 'Acme Logistics',
        vertical: 'Logistics',
        frameworks: ['NIST AI RMF', 'OWASP LLM Top 10', 'SOC 2'],
        reportSlug: 'acme-logistics',
        addOns: { insurance: true, fda: false },
        targetAgent: 'Acme Phone AI (dispatch + scheduling)',
        targetDID: '+1 555 555 0001',
        tagline: 'Insurance-anchored. Carrier coverage + risk-score add-on enabled.',
    },
    // Savio Labs — multi-tenant demo org. Savio Labs attests downstream
    // clients themselves, so this org slot showcases what a Bastion
    // *reseller* sees: their own org + the ability to switch in and
    // out of per-client engagements. No real engagement folder yet, so
    // the Posture Report renders the baseline fixture with the Savio
    // Labs label override + the "Showing baseline fixture" banner.
    'savio-labs': {
        slug: 'savio-labs',
        label: 'Savio Labs',
        vertical: 'Healthcare AI (reseller)',
        frameworks: ['FDA AI/ML', 'ISO 14971', 'HIPAA', 'SOC 2'],
        reportSlug: 'savio-labs',
        addOns: { insurance: false, fda: true, reseller: true },
        targetAgent: 'Multi-tenant client fleet',
        targetDID: null,
        tagline: 'Reseller-tenant. One Bastion subscription, N downstream client attestations.',
    },
};

// Default persona when the active Clerk org has no matching config
// (or when no org is active — e.g., during initial signed-in render).
// Picked to be Maple Ridge so the demo lands on the FDA story by
// default, matching Mathis's workflow.
const DEFAULT_PERSONA_SLUG = 'maple-pharmacy';

/**
 * Read the persona corresponding to the user's active Clerk
 * organization. Returns a stable object even before Clerk has loaded
 * the organization (uses the default persona until then) so consumers
 * don't need to handle a null state.
 */
export function usePersona() {
    const { organization, isLoaded } = useOrganization();
    if (!isLoaded) return PERSONA_CONFIG[DEFAULT_PERSONA_SLUG];

    // Match by slug first (canonical), then fall back to a normalized
    // name match so an org named "Maple Ridge Pharmacy" without a
    // configured slug still resolves cleanly.
    const slug = (organization?.slug || '').toLowerCase();
    if (slug && PERSONA_CONFIG[slug]) return PERSONA_CONFIG[slug];

    const normalizedName = (organization?.name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    if (normalizedName && PERSONA_CONFIG[normalizedName]) return PERSONA_CONFIG[normalizedName];

    return PERSONA_CONFIG[DEFAULT_PERSONA_SLUG];
}

// Back-compat: a couple of old call sites import PERSONAS as a list.
// Expose the same shape so they keep working.
export const PERSONAS = Object.values(PERSONA_CONFIG);
