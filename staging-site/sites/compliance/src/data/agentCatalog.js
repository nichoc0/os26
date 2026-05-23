// Canonical agent rosters keyed by persona slug. Single source of truth
// for the Agents Directory + AgentDetailView. Per-persona numbers honour
// the canonical 30-day baseline documented in
// src/data/fleetReportFixture.js (CANONICAL_DATA block) — sum of
// actions = 805, sum of PII = 70, sum of tool blocks = 47.
//
// Adding a new customer = add a roster here keyed by the persona slug,
// AND add the same slug to PERSONA_CONFIG (src/store/personaStore.js),
// AND mirror the per-agent metrics into AGENT_LABELS_BY_PERSONA +
// exposure_by_agent in fleetReportFixture.js so the Posture Report
// fleet view matches the Agents Directory.

const MAPLE_PHARMACY_AGENTS = [
  {
    id: 'sera_intake',
    label: 'Sera (Intake)',
    channel: 'Voice inbound',
    purpose: 'Inbound patient-call intake. Non-diagnostic triage, identity verification, appointment scheduling, and escalation to a pharmacist for clinical follow-up.',
    tier: 'High',
    metrics: { actions: 210, piiDetected: 18, toolBlocks: 12, avgLatencyMs: 820, costUsd: 0.62, riskScore: 22.0, riskContribution: 26.1 },
    tools: {
      allowed:    ['caller_identify', 'rx_lookup', 'schedule_appointment', 'escalate_pharmacist'],
      restricted: ['dispense_override', 'dosage_advise', 'controlled_substance_lookup'],
    },
    findingIds: ['triage-rubric-leakage', 'phi-cross-record', 'out-of-scope-clinical', 'language-consistency'],
  },
  {
    id: 'refill_router',
    label: 'Refill Router',
    channel: 'Internal API',
    purpose: 'Automated refill-request routing. Eligibility check → refill creation → dispensing queue → patient notification.',
    tier: 'Medium',
    metrics: { actions: 160, piiDetected: 14, toolBlocks: 9, avgLatencyMs: 620, costUsd: 0.18, riskScore: 21.0, riskContribution: 20.1 },
    tools: {
      allowed:    ['refill_eligibility', 'refill_create', 'queue_dispense', 'notify_patient'],
      restricted: ['controlled_substance_refill', 'prescriber_override'],
    },
    findingIds: [],
  },
  {
    id: 'pharmacist_callback',
    label: 'Pharmacist Callback',
    channel: 'Voice + chat',
    purpose: 'Queues clinical callbacks from a licensed pharmacist to patients. Schedules windows, attaches notes, escalates to prescriber when needed.',
    tier: 'High',
    metrics: { actions: 135, piiDetected: 12, toolBlocks: 8, avgLatencyMs: 1420, costUsd: 0.41, riskScore: 22.5, riskContribution: 17.0 },
    tools: {
      allowed:    ['rx_lookup', 'callback_schedule', 'clinical_note_attach', 'escalate_prescriber'],
      restricted: ['dispense_override', 'dosage_advise', 'lab_order'],
    },
    findingIds: [],
  },
  {
    id: 'insurance_sync',
    label: 'Insurance Sync',
    channel: 'Payer API',
    purpose: 'Coordinates payer eligibility, prior-authorization submission, claim-status polling, and structured payer messaging.',
    tier: 'Medium',
    metrics: { actions: 120, piiDetected: 11, toolBlocks: 7, avgLatencyMs: 1210, costUsd: 0.22, riskScore: 19.5, riskContribution: 15.0 },
    tools: {
      allowed:    ['eligibility_check', 'prior_auth_submit', 'claim_status', 'payer_message'],
      restricted: ['claim_adjudicate', 'copay_override', 'refund_issue'],
    },
    findingIds: [],
  },
  {
    id: 'compliance_monitor',
    label: 'Compliance Monitor',
    channel: 'Internal QA',
    purpose: 'Internal QA on agent outputs. HIPAA review, audit-log queries, finding-report drafting, log redaction.',
    tier: 'Low',
    metrics: { actions: 107, piiDetected: 9, toolBlocks: 6, avgLatencyMs: 540, costUsd: 0.09, riskScore: 17.0, riskContribution: 12.8 },
    tools: {
      allowed:    ['audit_log_query', 'hipaa_review', 'finding_report', 'redact_log'],
      restricted: ['pii_export', 'transcript_share', 'prescriber_override'],
    },
    findingIds: [],
  },
  {
    id: 'triage_classifier',
    label: 'Triage Classifier',
    channel: 'Chat + API',
    purpose: 'Scores symptom urgency. Routes red-flag symptoms to nurse callback; routes low-acuity to self-care guidance.',
    tier: 'High',
    metrics: { actions: 73, piiDetected: 6, toolBlocks: 5, avgLatencyMs: 680, costUsd: 0.06, riskScore: 18.0, riskContribution: 9.0 },
    tools: {
      allowed:    ['symptom_intake', 'urgency_score', 'escalate_nurse', 'route_self_care'],
      restricted: ['diagnose', 'prescribe', 'dosage_advise'],
    },
    findingIds: [],
  },
];

// GFH Bank roster — 4 customer-facing AI agents. Per-agent metrics
// redistribute the canonical 30d totals (805 actions / 70 PII / 47
// blocks) across these 4 so screen-by-screen math stays consistent.
const GFH_BANK_AGENTS = [
  {
    id: 'investment_assistant',
    label: 'GFH AI Assistant',
    channel: 'Voice + chat',
    purpose: 'In-app investment assistant. Account information, portfolio context, product Q&A, callback scheduling. Non-advisory.',
    tier: 'High',
    metrics: { actions: 290, piiDetected: 26, toolBlocks: 17, avgLatencyMs: 880, costUsd: 0.86, riskScore: 24.0, riskContribution: 36.0 },
    tools: {
      allowed:    ['account_lookup', 'portfolio_balance', 'product_info', 'schedule_callback'],
      restricted: ['execute_trade', 'personalized_investment_advice', 'wire_transfer_initiate'],
    },
    findingIds: ['suitability-rubric-leakage', 'cross-account-disclosure', 'out-of-scope-advice', 'language-consistency'],
  },
  {
    id: 'retail_support',
    label: 'Khaleeji Banking Support',
    channel: 'Chat + voice',
    purpose: 'Retail and commercial banking servicing via Khaleeji Banking. Account balances, transaction history, card status, callback routing.',
    tier: 'Medium',
    metrics: { actions: 218, piiDetected: 21, toolBlocks: 12, avgLatencyMs: 640, costUsd: 0.25, riskScore: 21.0, riskContribution: 27.0 },
    tools: {
      allowed:    ['account_lookup', 'transaction_history', 'card_status', 'schedule_callback'],
      restricted: ['execute_trade', 'wire_transfer_initiate', 'override_limit'],
    },
    findingIds: [],
  },
  {
    id: 'client_intake',
    label: 'Onboarding Concierge',
    channel: 'Chat',
    purpose: 'KYC and account-opening triage. Document checklist, identity-verification status, escalation to a banker for the write-step.',
    tier: 'High',
    metrics: { actions: 163, piiDetected: 14, toolBlocks: 9, avgLatencyMs: 1380, costUsd: 0.54, riskScore: 22.5, riskContribution: 20.3 },
    tools: {
      allowed:    ['kyc_status', 'schedule_appointment', 'send_notification', 'escalate_compliance'],
      restricted: ['account_open', 'wire_transfer_initiate', 'credit_decision'],
    },
    findingIds: [],
  },
  {
    id: 'wealth_advisor_copilot',
    label: 'Relationship Manager Copilot',
    channel: 'Internal',
    purpose: 'RM-facing assistant. Pulls portfolio context, product info, and drafts call-prep summaries. Internal-only; never client-facing.',
    tier: 'Medium',
    metrics: { actions: 134, piiDetected: 9, toolBlocks: 9, avgLatencyMs: 1180, costUsd: 0.31, riskScore: 19.5, riskContribution: 16.7 },
    tools: {
      allowed:    ['portfolio_balance', 'product_info', 'account_lookup', 'draft_proposal'],
      restricted: ['execute_trade', 'personalized_investment_advice', 'override_suitability'],
    },
    findingIds: [],
  },
];

const CATALOGS_BY_PERSONA = {
  'maple-pharmacy': MAPLE_PHARMACY_AGENTS,
  'gfh-bank':       GFH_BANK_AGENTS,
};

// Resolve the agent catalog for a persona slug. Falls back to the
// default Demo Pharmacy roster when no match — keeps demo-safe behaviour
// for orgs that don't have a configured roster yet.
export function getAgentCatalog(personaSlug) {
  return CATALOGS_BY_PERSONA[personaSlug] || MAPLE_PHARMACY_AGENTS;
}

export function getAgentById(personaSlug, agentId) {
  const list = getAgentCatalog(personaSlug);
  return list.find((a) => a.id === agentId) || null;
}

export function getFleetTotals(personaSlug) {
  const list = getAgentCatalog(personaSlug);
  return list.reduce(
    (acc, a) => ({
      actions:      acc.actions + a.metrics.actions,
      piiDetected:  acc.piiDetected + a.metrics.piiDetected,
      toolBlocks:   acc.toolBlocks + a.metrics.toolBlocks,
      avgLatencyMs: Math.round((acc.avgLatencyMs * acc.actions + a.metrics.avgLatencyMs * a.metrics.actions) / (acc.actions + a.metrics.actions || 1)),
      costUsd:      +(acc.costUsd + a.metrics.costUsd).toFixed(2),
    }),
    { actions: 0, piiDetected: 0, toolBlocks: 0, avgLatencyMs: 0, costUsd: 0 },
  );
}

// Back-compat shims for any caller that still imports the flat constants.
// These resolve to the default persona roster (Demo Pharmacy) so existing
// consumers continue to work; new consumers should call getAgentCatalog(slug).
export const AGENT_CATALOG = MAPLE_PHARMACY_AGENTS;
export const AGENT_BY_ID = Object.fromEntries(MAPLE_PHARMACY_AGENTS.map((a) => [a.id, a]));
export const FLEET_TOTALS = getFleetTotals('maple-pharmacy');
