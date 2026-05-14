// Persona-themed fixture report data for the Agent Risk Assessment
// (Fleet Risk Assessment) view inside the Posture Report. The shape is
// the same one PostureReport's backend route produces, so flipping a
// persona to "live" later is one fetch swap, not a refactor.
//
// Two personas land today:
//   - maple-pharmacy: FDA AI/ML · ISO 14971 · HIPAA framing. Numbers
//     sized to a 6-month attestation window on the pharmacy Sera intake
//     agent and four downstream callback/PHI flows.
//   - acme-logistics: NIST AI RMF · OWASP LLM · SOC 2 framing. Numbers
//     sized to the dispatch/billing voice fleet (insurance add-on).
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
        gross_risk_score: 3.0,
        net_risk_score: 0.3,
        risk_classification: 'LOW · FDA-attested',
        component_scores: {
            pii_component: 0.4,
            blocked_actions_component: 0.6,
            anomaly_component: 0.3,
            confidence_component: 0.2,
            drift_component: 0.1,
        },
    },
    fleet_summary: {
        total_transactions: 4827,
        agents_monitored: 5,
        monitoring_hours: 4368,
        pii_remediation_rate: 0.987,
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
        exposure_by_agent: [
            { agent_id: 'sera_intake',         transactions: 3204, pii_records: 287, tool_calls: 198, risk_contribution: 62.3 },
            { agent_id: 'pharmacist_callback', transactions: 612,  pii_records: 78,  tool_calls: 51,  risk_contribution: 18.7 },
            { agent_id: 'insurance_sync',      transactions: 487,  pii_records: 32,  tool_calls: 35,  risk_contribution: 9.4 },
            { agent_id: 'refill_router',       transactions: 387,  pii_records: 12,  tool_calls: 22,  risk_contribution: 6.1 },
            { agent_id: 'triage_classifier',   transactions: 137,  pii_records: 3,   tool_calls: 6,   risk_contribution: 3.5 },
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
        insurance_sync:      'Insurance Sync',
        refill_router:       'Refill Router',
        triage_classifier:   'Triage Classifier',
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
    const runs = liveStats?.runs || 0;
    const runsDelta = Math.min(15, runs * 0.15);
    const grossJitter = (stableJitter('gross', pulseBucket) - 0.5) * 0.8;
    const netJitter = (stableJitter('net', pulseBucket) - 0.5) * 0.4;
    const grossRisk = Math.max(0, Math.min(100, baseGross + runsDelta + grossJitter));
    const netRisk = Math.max(0, Math.min(100, baseNet + runsDelta * 0.15 + netJitter));
    const reductionPct = baseGross > 0 ? ((grossRisk - netRisk) / grossRisk) * 100 : 0;
    return { grossRisk, netRisk, reductionPct, baseGross, baseNet };
}

export { stableJitter };
