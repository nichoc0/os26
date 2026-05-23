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
    // GFH Bank — Bahraini Islamic investment bank (rebranded April 2026
    // from GFH Financial Group). Demo persona aimed at the digital-
    // banking + compliance buyer; the customer-facing AI fleet is
    // anchored on the real GFH AI Assistant (in-app voice + chat) plus
    // the Khaleeji Banking servicing surface and the Binance Pay
    // integration. Framework anchors are CBB Rulebook Volume 2 + AAOIFI
    // Governance Standards GS-19/20/21. Per-customer Posture Report
    // content lives at public/static-api/customers/gfh-bank/report.json
    // and the agent roster lives in src/data/agentCatalog.js under the
    // 'gfh-bank' key. Branding chip metadata below is consumed by
    // CustomerOrgBadge when a real Clerk org with this slug is active.
    'gfh-bank': {
        slug: 'gfh-bank',
        // Clerk org IDs that resolve to this persona regardless of the
        // org's slug (orgs created without a slug still match here).
        // Add more ids as additional GFH-shaped Clerk orgs are created.
        orgIds: ['org_3E8GNTJf6v1Dr9jnU5IBqq6whvo'],
        label: 'GFH Bank',
        vertical: 'Islamic Investment Banking',
        frameworks: ['CBB Rulebook Vol 2', 'AAOIFI GS', 'NIST AI RMF', 'ISO/IEC 42001'],
        reportSlug: 'gfh-bank',
        addOns: { insurance: false, fda: false },
        targetAgent: 'GFH AI Assistant (investment app)',
        targetDID: '+973 1750 8000',
        tagline: 'Sharia-compliant digital banking. CBB-anchored attestation.',
        brand: {
            name: 'GFH Bank',
            logoUrl: 'https://logo.clearbit.com/gfh.com',
            primaryColor: '#0f3a5a',
            hook: 'Bastion monitors GFH\'s customer-facing AI fleet — GFH AI Assistant, Khaleeji Banking, Binance Pay — with continuous CBB + AAOIFI attestation.',
        },
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

    // Match priority:
    //   1. orgIds[] (Clerk org ID) — survives orgs created without a
    //      configured slug, and gives the operator a way to bind a
    //      specific Clerk org to a persona without renaming it.
    //   2. slug — canonical match for orgs with a clean slug set.
    //   3. normalized org name — defensive fallback so an org named
    //      "Maple Ridge Pharmacy" without a configured slug still
    //      resolves cleanly.
    const orgId = organization?.id || null;
    if (orgId) {
        for (const persona of Object.values(PERSONA_CONFIG)) {
            if (Array.isArray(persona.orgIds) && persona.orgIds.includes(orgId)) {
                return persona;
            }
        }
    }

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
