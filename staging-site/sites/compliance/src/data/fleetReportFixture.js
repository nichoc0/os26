// Persona-themed fixture report data for the Agent Risk Assessment
// (Fleet Risk Assessment) view inside the Posture Report. The shape is
// the same one PostureReport's backend route produces, so flipping a
// persona to "live" later is one fetch swap, not a refactor.
//
// CANONICAL_DATA (source of truth for the entire compliance demo)
// ----------------------------------------------------------------
// Customer:  Demo Pharmacy (slug `maple-pharmacy`)
// Industry:  Pharmacy / Outpatient Healthcare
// Period anchor: 2026-04-17 → 2026-05-17 (30 days). Generated 2026-05-17.
//
// Roster (6 agents):
//   sera_intake          — voice intake, primary surface
//   pharmacist_callback  — clinical callback queue
//   refill_router        — automated refill routing
//   insurance_sync       — payer eligibility / prior-auth
//   triage_classifier    — symptom triage
//   compliance_monitor   — internal QA on agent outputs
//
// Three time-scope baselines (all surfaces must derive from these):
//   ┌────────────────────┬──────┬──────┬───────┐
//   │ Window             │ 14d  │ 30d  │  6mo  │
//   ├────────────────────┼──────┼──────┼───────┤
//   │ Production actions │ 380  │ 805  │ 4,827 │
//   │ Adversarial probes │ 182  │ 390  │ 2,340 │
//   │   ├ violations     │   4  │   8  │    48 │
//   │   ├ refusals       │ 142  │ 304  │ 1,824 │
//   │   ├ off-task       │  31  │  66  │   396 │
//   │   └ inconclusive   │   5  │  12  │    72 │
//   │ PII detected       │  32  │  70  │   412 │
//   │ PII residual       │   1  │   1  │     5 │
//   └────────────────────┴──────┴──────┴───────┘
//
// Per-agent 30d split (must scale ~½ for 14d, ~6× for 6mo):
//   sera_intake 210 · pharmacist_callback 135 · refill_router 160 ·
//   insurance_sync 120 · triage_classifier 73 · compliance_monitor 107
//
// Risk-score readout (same across windows — worst-observed contribution):
//   gross 69.9 / net 20.0 / controls credit −71.4%
//
// Incident severity register (6mo): 0 SEV-1 · 2 SEV-2 · 7 SEV-3 ·
//   14 SEV-4 · 23 SEV-5 = 46 incidents total.
//
// Two personas land today:
//   - maple-pharmacy: FDA AI/ML · ISO 14971 · HIPAA framing. Numbers
//     sized to the 6-month attestation window. This is canonical.
//   - acme-logistics: NIST AI RMF · OWASP LLM · SOC 2 framing. Numbers
//     sized to the dispatch/billing voice fleet. Currently unused by
//     compliance demo — kept for the insurance demo surface.
//
// Component keys (`pii_component`, `blocked_actions_component`,
// `anomaly_component`, `confidence_component`, `drift_component`) are
// stable across personas — what changes is the *label/desc* the UI
// renders for each, picked from RISK_COMPONENT_MAP[persona.slug].
//
// Add a persona here when adding it to PERSONA_CONFIG. Falls back to
// maple-pharmacy if the slug is unknown, since that's the default demo
// org.

const MAPLE_REPORT = {
    risk_assessment: {
        // Canonical baseline: gross 69.9 / net 20.0 / -71.4% reduction.
        // Used by Posture Report Section 5, Underwriting data.js Sec 3.1,
        // and RiskBreakdown live readout — all three must show the same
        // numbers, so this is the single source. computeLiveRiskNumbers
        // adds only ±0.4 jitter (no runsDelta), keeping the live number
        // visibly near baseline instead of drifting.
        gross_risk_score: 69.9,
        net_risk_score: 20.0,
        risk_classification: '',
        component_scores: {
            pii_component: 98.6,
            blocked_actions_component: 85.0,
            anomaly_component: 99.6,
            confidence_component: 97.9,
            drift_component: 98.4,
        },
    },
    fleet_summary: {
        total_transactions: 4827,
        agents_monitored: 6,
        monitoring_hours: 4368,
        pii_remediation_rate: 0.988,
        anomaly_rate: 0.0042,
        total_cost_usd: 1247.66,
        avg_latency_ms: 1100,
        incidents_by_severity: {
            sev1_critical: 0,
            sev2_major: 2,
            sev3_moderate: 7,
            sev4_minor: 14,
            sev5_info: 23,
        },
    },
    metrics: {
        pii: {
            total_detections: 412,
            residual_exposures: 5,
            estimated_residual_cost_usd: 900,
        },
        tool_calls: {
            total_blocked: 47,
            total_attempted: 312,
        },
        anomalies: {
            total_anomalies: 8,
        },
    },
    exposure: {
        // Canonical 6-agent Demo Pharmacy roster. Transactions sum to 4,827
        // (6-month window). Risk contributions sum to 100.0.
        exposure_by_agent: [
            { agent_id: 'sera_intake',         transactions: 1260, pii_records: 108, tool_calls:  82, risk_contribution: 26.1 },
            { agent_id: 'refill_router',       transactions:  970, pii_records:  83, tool_calls:  63, risk_contribution: 20.1 },
            { agent_id: 'pharmacist_callback', transactions:  820, pii_records:  70, tool_calls:  53, risk_contribution: 17.0 },
            { agent_id: 'insurance_sync',      transactions:  725, pii_records:  62, tool_calls:  47, risk_contribution: 15.0 },
            { agent_id: 'compliance_monitor',  transactions:  617, pii_records:  52, tool_calls:  39, risk_contribution: 12.8 },
            { agent_id: 'triage_classifier',   transactions:  435, pii_records:  37, tool_calls:  28, risk_contribution:  9.0 },
        ],
    },
};

// GFH Bank persona report. Same shape as MAPLE_REPORT; per-agent
// numbers mirror agentCatalog.js GFH roster scaled ~6× (30d → 6mo).
const GFH_REPORT = {
    risk_assessment: {
        // Canonical baseline: gross 69.9 / net 20.0 / -71.4% reduction.
        // Matches the per-customer report.json at
        // public/static-api/customers/gfh-bank/report.json.
        gross_risk_score: 69.9,
        net_risk_score: 20.0,
        risk_classification: '',
        component_scores: {
            pii_component: 98.6,
            blocked_actions_component: 85.0,
            anomaly_component: 99.6,
            confidence_component: 97.9,
            drift_component: 98.4,
        },
    },
    fleet_summary: {
        total_transactions: 4827,
        agents_monitored: 6,
        monitoring_hours: 4368,
        pii_remediation_rate: 0.988,
        anomaly_rate: 0.0042,
        total_cost_usd: 1247.66,
        avg_latency_ms: 1100,
        incidents_by_severity: {
            sev1_critical: 0,
            sev2_major: 2,
            sev3_moderate: 7,
            sev4_minor: 14,
            sev5_info: 23,
        },
    },
    metrics: {
        pii: {
            total_detections: 412,
            residual_exposures: 5,
            estimated_residual_cost_usd: 900,
        },
        tool_calls: {
            total_blocked: 47,
            total_attempted: 312,
        },
        anomalies: {
            total_anomalies: 8,
        },
    },
    exposure: {
        // 4-agent GFH roster (6-month window). Transactions scale ~6x
        // the 30d per-agent split in agentCatalog.js. Sums to 4,827.
        // Risk contributions sum to 100.0.
        exposure_by_agent: [
            { agent_id: 'investment_assistant',   transactions: 1740, pii_records: 148, tool_calls: 102, risk_contribution: 36.0 },
            { agent_id: 'retail_support',         transactions: 1308, pii_records: 126, tool_calls:  72, risk_contribution: 27.0 },
            { agent_id: 'client_intake',          transactions:  978, pii_records:  84, tool_calls:  54, risk_contribution: 20.3 },
            { agent_id: 'wealth_advisor_copilot', transactions:  801, pii_records:  54, tool_calls:  54, risk_contribution: 16.7 },
        ],
    },
};

const ACME_REPORT = {
    risk_assessment: {
        gross_risk_score: 4.1,
        net_risk_score: 0.6,
        risk_classification: 'MODERATE · monitored',
        component_scores: {
            pii_component: 0.7,
            blocked_actions_component: 0.5,
            anomaly_component: 0.6,
            confidence_component: 0.4,
            drift_component: 0.3,
        },
    },
    fleet_summary: {
        total_transactions: 18742,
        agents_monitored: 6,
        monitoring_hours: 4368,
        pii_remediation_rate: 0.971,
        anomaly_rate: 0.0061,
        total_cost_usd: 4189.22,
        avg_latency_ms: 1320,
        incidents_by_severity: {
            sev1_critical: 1,
            sev2_major: 4,
            sev3_moderate: 12,
            sev4_minor: 28,
            sev5_info: 47,
        },
    },
    metrics: {
        pii: {
            total_detections: 1284,
            residual_exposures: 18,
            estimated_residual_cost_usd: 3240,
        },
        tool_calls: {
            total_blocked: 132,
            total_attempted: 1456,
        },
        anomalies: {
            total_anomalies: 27,
        },
    },
    exposure: {
        exposure_by_agent: [
            { agent_id: 'acme_phone_ai',       transactions: 7821, pii_records: 612, tool_calls: 487, risk_contribution: 41.2 },
            { agent_id: 'hub_coordinator',     transactions: 3214, pii_records: 248, tool_calls: 392, risk_contribution: 19.8 },
            { agent_id: 'driver_dispatch',     transactions: 2987, pii_records: 187, tool_calls: 318, risk_contribution: 17.3 },
            { agent_id: 'billing_assistant',   transactions: 2641, pii_records: 213, tool_calls: 174, risk_contribution: 14.6 },
            { agent_id: 'safety_coordinator',  transactions: 1247, pii_records: 18,  tool_calls: 67,  risk_contribution: 4.8 },
            { agent_id: 'compliance_monitor',  transactions: 832,  pii_records: 6,   tool_calls: 18,  risk_contribution: 2.3 },
        ],
    },
};

// Persona-specific re-mapping of the 5 weighted components onto the
// regulatory taxonomy the customer actually cares about. Same keys, new
// labels — score values come from the report data above.
export const RISK_COMPONENT_MAP = {
    'maple-pharmacy': [
        { key: 'pii_component',             label: 'PHI Cross-Record Disclosure',        weight: 30, desc: 'Patient-record bleed across calls. HIPAA §164.502 minimum-necessary rule.',                  framework: 'HIPAA §164.502',     link: 'telemetry', linkLabel: 'View PHI events' },
        { key: 'blocked_actions_component', label: 'Out-of-Scope Clinical Commitment',   weight: 25, desc: 'Agent commits to clinical advice outside trained scope. FDA AI/ML PCCP §V.B.',              framework: 'FDA AI/ML PCCP',     link: 'policy',    linkLabel: 'View enforcement policy' },
        { key: 'anomaly_component',         label: 'Triage Rubric Leakage',              weight: 20, desc: 'Verbatim disclosure of triage decision criteria. ISO 14971 §5.3 risk control.',              framework: 'ISO 14971 §5.3',     link: 'telemetry', linkLabel: 'View telemetry' },
        { key: 'confidence_component',      label: 'Clinical Hallucination',             weight: 15, desc: 'Fabricated dosages, interactions, or contraindications. FDA AI/ML §V.B output integrity.',  framework: 'FDA AI/ML §V.B',     link: 'telemetry', linkLabel: 'View flagged events' },
        { key: 'drift_component',           label: 'Language Mirroring Drift',           weight: 10, desc: 'First-turn language inconsistent with caller. HIPAA §164.530(b) effective communication.', framework: 'HIPAA §164.530(b)',  link: 'telemetry', linkLabel: 'View trends' },
    ],
    'gfh-bank': [
        { key: 'pii_component',             label: 'PII Cross-Account Disclosure',     weight: 30, desc: 'Customer record bleed across accounts. CBB Rulebook Vol 2 FC + AAOIFI GS-20.',                  framework: 'CBB Vol 2 FC',       link: 'telemetry', linkLabel: 'View PII events' },
        { key: 'blocked_actions_component', label: 'Out-of-Scope Financial Advice',    weight: 25, desc: 'Agent gave personalised investment guidance outside its non-advisory scope. CBB HC + AAOIFI GS-21.', framework: 'CBB Vol 2 HC',       link: 'policy',    linkLabel: 'View enforcement policy' },
        { key: 'anomaly_component',         label: 'Suitability Rubric Leakage',       weight: 20, desc: 'Verbatim disclosure of internal suitability scoring criteria. AAOIFI GS-19 Sharia-board oversight.', framework: 'AAOIFI GS-19',       link: 'telemetry', linkLabel: 'View telemetry' },
        { key: 'confidence_component',      label: 'Product-Detail Hallucination',     weight: 15, desc: 'Fabricated product rates, terms, or contract details. CBB Vol 2 BC disclosure rules.',           framework: 'CBB Vol 2 BC',       link: 'telemetry', linkLabel: 'View flagged events' },
        { key: 'drift_component',           label: 'Language Mirroring Drift',         weight: 10, desc: 'First-turn language inconsistent with caller. Customer-conduct expectation under CBB BC.',         framework: 'CBB Vol 2 BC',       link: 'telemetry', linkLabel: 'View trends' },
    ],
    'acme-logistics': [
        { key: 'pii_component',             label: 'PII Exposure',        weight: 30, desc: 'Rate of unredacted personally identifiable information in agent outputs', framework: 'NIST AI RMF GV-4.2', link: 'telemetry', linkLabel: 'View PII events' },
        { key: 'blocked_actions_component', label: 'Policy Violations',   weight: 25, desc: 'Attempted tool calls that violated enforcement boundaries',               framework: 'OWASP LLM06',        link: 'policy',    linkLabel: 'View enforcement policy' },
        { key: 'anomaly_component',         label: 'Behavioral Anomaly',  weight: 20, desc: 'Statistical deviation from established agent behavior baselines',         framework: 'NIST AI RMF MS-2.7', link: 'telemetry', linkLabel: 'View telemetry' },
        { key: 'confidence_component',      label: 'Output Integrity',    weight: 15, desc: 'Hallucinated data, unverifiable claims, or fabricated citations',         framework: 'OWASP LLM09',        link: 'telemetry', linkLabel: 'View flagged events' },
        { key: 'drift_component',           label: 'Model Drift',         weight: 10, desc: 'Systematic changes in model output distribution over time',               framework: 'SOC 2 CC7.2',        link: 'telemetry', linkLabel: 'View trends' },
    ],
};

export const AGENT_LABELS_BY_PERSONA = {
    'maple-pharmacy': {
        sera_intake:         'Sera (Intake)',
        pharmacist_callback: 'Pharmacist Callback',
        refill_router:       'Refill Router',
        insurance_sync:      'Insurance Sync',
        compliance_monitor:  'Compliance Monitor',
        triage_classifier:   'Triage Classifier',
    },
    'gfh-bank': {
        investment_assistant:     'GFH AI Assistant',
        retail_support:           'Khaleeji Banking Support',
        client_intake:            'Onboarding Concierge',
        wealth_advisor_copilot:   'Relationship Manager Copilot',
    },
    'acme-logistics': {
        acme_phone_ai:      'Acme Phone AI',
        hub_coordinator:    'Hub Coordinator',
        driver_dispatch:    'Driver Dispatch',
        billing_assistant:  'Billing Assistant',
        safety_coordinator: 'Safety Coordinator',
        compliance_monitor: 'Compliance Monitor',
    },
};

export function fleetReportFixture(personaSlug) {
    if (personaSlug === 'acme-logistics') return ACME_REPORT;
    if (personaSlug === 'gfh-bank') return GFH_REPORT;
    return MAPLE_REPORT;
}

export function riskComponents(personaSlug) {
    return RISK_COMPONENT_MAP[personaSlug] || RISK_COMPONENT_MAP['maple-pharmacy'];
}

export function agentLabels(personaSlug) {
    return AGENT_LABELS_BY_PERSONA[personaSlug] || AGENT_LABELS_BY_PERSONA['maple-pharmacy'];
}

// Deterministic [0, 1) hash used by the live-pulse formula. Same key +
// bucket always yields the same value, so the same pulse renders the
// same number in every consumer (Overview card + Agent Risk Assessment
// won't drift apart visually).
function stableJitter(seedKey, bucket) {
    let h = 2166136261 ^ bucket;
    const s = `${seedKey}-${bucket}`;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
}

// Pure formula for the live-pulse risk numbers. Both the Overview's
// Posture Report card and the Agent Risk Assessment view call this to
// guarantee they show identical values for a given (reportData,
// liveStats, pulseBucket) tuple. Extracted from RiskBreakdown so the
// two surfaces never drift.
//
// Gross risk slowly climbs as probes run (each run adds observed attack
// surface). Net risk stays low because Bastion enforces, but both nudge
// per pulseBucket so the number visibly moves every 4s without looking
// random.
export function computeLiveRiskNumbers(reportData, liveStats, pulseBucket) {
    const risk = reportData?.risk_assessment || {};
    const baseGross = risk.gross_risk_score ?? 0;
    const baseNet = risk.net_risk_score ?? 0;
    // No runsDelta — the canonical baseline (gross 69.9 / net 20.0) is
    // the answer; runs shouldn't tick the number upward against the
    // headline shown elsewhere. Small jitter keeps the live feel.
    const grossJitter = (stableJitter('gross', pulseBucket) - 0.5) * 0.4;
    const netJitter = (stableJitter('net', pulseBucket) - 0.5) * 0.2;
    const grossRisk = Math.max(0, Math.min(100, baseGross + grossJitter));
    const netRisk = Math.max(0, Math.min(100, baseNet + netJitter));
    const reductionPct = baseGross > 0 ? ((grossRisk - netRisk) / grossRisk) * 100 : 0;
    return { grossRisk, netRisk, reductionPct, baseGross, baseNet };
}

export { stableJitter };
