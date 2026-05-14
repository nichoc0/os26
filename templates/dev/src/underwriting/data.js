// Bastion AI-Agent Underwriting Report — canonical data source.
//
// Data-dense, Excel-native layout inspired by Marsh (section banners,
// numbered sheets, bordered grid) but content is TELEMETRY, not a
// questionnaire. 8 sheets, everything dense:
//
//   1 Summary         — headline risk, fleet KPI, framework alignment
//   2 Fleet            — per-agent metrics (requests, cost, latency, flags)
//   3 Risk Model       — gross/net, score decomposition, financial exposure
//   4 Findings         — live detections with framework tags
//   5 Incidents        — 12-month incident register
//   6 Telemetry        — PII, tool calls, anomalies, consistency, drift
//   7 Framework Map    — Bastion detections × AI RMF / OWASP / ISO / EU AI / ATLAS
//   8 Attestation      — methodology, controls-in-place, compliance statements
//
// Consumed by:
//   - scripts/build-underwriting-xlsx.js  → /public/underwriting-latest.xlsx
//   - components/views/ReportView.jsx     → same data rendered as tabbed HTML

export const UNDERWRITING = {
  meta: {
    report_id: 'BSTN-UW-2026-0001',
    version: 'v2026.04.24',
    tier: 'Standard',
    last_modified: '2026-04-24',
    client: 'Acme Logistics',
    client_industry: 'Last-Mile Logistics',
    assessor: 'Bastion Security',
    methodology: 'Continuous AI-Agent Telemetry + Semantic NLI (gpt-4o) + Hand-curated Policy Vault (SurrealDB)',
    frameworks_aligned: ['NIST AI RMF 1.0', 'ISO/IEC 42001:2023', 'OWASP LLM Top 10', 'EU AI Act', 'MITRE ATLAS'],
    monitoring_hours: 336,
    reporting_period: '2026-03-24 → 2026-04-23',
  },

  sections: [

    // ==================== 1. SUMMARY ====================
    {
      id: '1', title: 'Summary', bastion_unique: false,
      subsections: [
        {
          id: '1.1', title: 'Headline Metrics',
          table: {
            columns: ['Metric', 'Value', 'Benchmark (industry p50)', 'Status'],
            rows: [
              ['Fleet risk score (net, with Bastion)', '20.0 / 100', '48.2', 'Low'],
              ['Fleet risk score (gross, without controls)', '69.9 / 100', '70.5', 'High'],
              ['Risk reduction attributable to Bastion', '-71.4%', '-28.0%', 'Outperforming'],
              ['Agents monitored', '6', '—', '—'],
              ['Total transactions (reporting period)', '41', '—', '—'],
              ['Monitoring hours', '336', '—', '—'],
              ['Total incidents (30d)', '9', '12', 'Low'],
              ['Critical incidents (30d)', '0', '1', 'Low'],
              ['PII remediation rate', '100.0%', '78.2%', 'Outperforming'],
              ['Actions blocked (policy violations)', '2 of 36', '14 of 100', 'On target'],
              ['Anomaly rate', '4.88%', '11.2%', 'Low'],
              ['Avg latency (NLI gated egress)', '1.3s', '—', '—'],
              ['API spend (6mo)', '$0.38', '—', '—'],
            ],
          },
        },
        {
          id: '1.2', title: 'Classification',
          table: {
            columns: ['Field', 'Value'],
            rows: [
              ['Risk classification', 'Low Risk'],
              ['Recommendation', 'Eligible for standard AI-liability coverage'],
              ['Coverage tier suggested', 'Standard'],
              ['Premium adjustment vs baseline', '-18% (applied controls credit)'],
              ['Next review', '2026-07-24 (quarterly)'],
            ],
          },
        },
      ],
    },

    // ==================== 2. FLEET ====================
    {
      id: '2', title: 'Fleet', bastion_unique: false,
      subsections: [
        {
          id: '2.1', title: 'Per-Agent Metrics (reporting period)',
          narrative: '6 customer-facing or back-office AI agents. Each agent has its own permissions and rule set, enforced before every reply is sent.',
          table: {
            columns: ['Agent', 'Channel', 'Requests', 'Cost ($)', 'Avg Latency', 'PII Flags', 'Tool Blocks', 'Risk %', 'Tier'],
            rows: [
              ['Acme Phone AI', 'Voice inbound', '14', '$0.04', '0.8s', '2', '1', '19.5%', 'High'],
              ['Hub Coordinator', 'Internal API', '9', '$0.12', '1.9s', '0', '0', '17.1%', 'Medium'],
              ['Driver Dispatch', 'Internal API', '11', '$0.09', '1.4s', '0', '0', '17.1%', 'Medium'],
              ['Billing Assistant', 'Chat + API', '8', '$0.07', '1.2s', '1', '0', '17.1%', 'High'],
              ['Safety Coordinator', 'Phone + chat', '5', '$0.02', '0.7s', '1', '1', '14.6%', 'Critical'],
              ['Compliance Monitor', 'Internal', '7', '$0.01', '0.5s', '0', '0', '14.6%', 'High'],
            ],
          },
        },
        {
          id: '2.2', title: 'Tool Authority Boundaries',
          table: {
            columns: ['Agent', 'Allowed Tools', 'Restricted Tools (KG-enforced)'],
            rows: [
              ['Acme Phone AI', 'tracking_lookup, billing_lookup, create_ticket, escalate_supervisor', 'dispatch_911, driver_reroute, refund_over_100'],
              ['Hub Coordinator', 'hub_status, sortation_metrics, shift_roster', 'driver_comms, refund_issue'],
              ['Driver Dispatch', 'driver_roster, reroute_parcel, weather_feed', 'billing_adjustment, compliance_override'],
              ['Billing Assistant', 'invoice_query, apply_credit_up_to_100, refund_request', 'dispatch_driver, hub_shift_change'],
              ['Safety Coordinator', 'dispatch_911, hazmat_protocol, driver_status', 'billing_adjustment, shift_change'],
              ['Compliance Monitor', 'audit_log_query, hos_compliance_check, incident_report', 'refund_issue, driver_reroute'],
            ],
          },
        },
      ],
    },

    // ==================== 3. RISK MODEL ====================
    {
      id: '3', title: 'Risk Model', bastion_unique: true,
      subsections: [
        {
          id: '3.1', title: 'Gross / Net / Reduction',
          narrative: 'Gross = fleet risk score if agents ran without Bastion. Net = same fleet with Bastion controls inline. Reduction is the insurer\'s applied-controls credit.',
          table: {
            columns: ['Posture', 'Risk Score', 'Classification', 'Eligible For'],
            rows: [
              ['Without controls (gross)', '69.9', 'High', 'Enhanced tier, surcharged'],
              ['With Bastion Blue (net)', '20.0', 'Low', 'Standard tier, baseline pricing'],
              ['Reduction', '-71.4%', '—', '—'],
            ],
          },
        },
        {
          id: '3.2', title: 'Score Decomposition',
          narrative: 'Weighted components. Full methodology in sheet 8.',
          table: {
            columns: ['Component', 'Weight', 'Score', 'Benchmark (p50)', 'Description'],
            rows: [
              ['PII exposure', '30%', '100.0', '78.2', 'Rate of unredacted PII in agent outputs'],
              ['Policy violations', '25%', '79.6', '62.5', 'Tool calls that violated enforcement boundaries'],
              ['Behavioral anomaly', '20%', '100.0', '81.0', 'Statistical deviation from baseline'],
              ['Output integrity', '15%', '94.3', '70.1', 'Hallucinated data / unverifiable claims'],
              ['Model drift', '10%', '98.1', '83.4', 'Systematic output-distribution change'],
            ],
          },
        },
        {
          id: '3.3', title: 'Financial Exposure',
          narrative: 'Per-record settlement benchmark: IBM/Ponemon 2025 $180/PII record. Gross = estimated liability without redaction. Net = residual after Bastion controls.',
          table: {
            columns: ['Line Item', 'Count', 'Per-Record', 'Gross', 'Residual', 'Net'],
            rows: [
              ['PII records (detected)', '4', '$180', '$720', '0', '$0'],
              ['Tool-violation attempts', '2', '$5,000', '$10,000', '0', '$0'],
              ['Session rollback cost (ops)', '1', '$450', '$450', '1', '$450'],
              ['Total liability exposure', '', '', '$11,170', '', '$450'],
              ['Reduction ($)', '', '', '', '', '$10,720'],
            ],
          },
        },
      ],
    },

    // ==================== 4. FINDINGS REGISTER ====================
    {
      id: '4', title: 'Findings', bastion_unique: true,
      subsections: [
        {
          id: '4.1', title: 'Live Detections (last 30 days)',
          narrative: 'Every finding comes from Bastion\'s combined AI groundedness, knowledge-base, and authorization checks, and is tagged with the relevant compliance framework. Updated live every 4 seconds.',
          table: {
            columns: ['Finding ID', 'Timestamp', 'Agent', 'Detection', 'Severity', 'Status', 'Framework Tags'],
            rows: [
              ['BSTN-F-2026-04-23-001', '2026-04-23 14:22', 'acme_phone_ai', 'canary_disclosure', 'Critical', 'Blocked inline', 'AI-RMF:MEASURE-2.7 · OWASP:LLM01 · ISO-42001:A.6.2.7 · ATLAS:AML.T0054'],
              ['BSTN-F-2026-04-23-002', '2026-04-23 16:08', 'acme_phone_ai', 'policy_violation', 'High', 'Blocked inline', 'AI-RMF:MANAGE-4.2 · OWASP:LLM08 · EU-AI:Art.14'],
              ['BSTN-F-2026-04-22-017', '2026-04-22 19:55', 'billing_assistant', 'third_party_disclosure', 'Critical', 'Flagged for review', 'AI-RMF:MEASURE-2.10 · OWASP:LLM06 · EU-AI:Art.10'],
              ['BSTN-F-2026-04-21-004', '2026-04-21 09:12', 'acme_phone_ai', 'divergence', 'Medium', 'Remediated (prompt patch)', 'AI-RMF:MEASURE-2.3 · OWASP:LLM09'],
              ['BSTN-F-2026-04-19-022', '2026-04-19 13:40', 'safety_coordinator', 'pii_leak', 'Critical', 'Blocked inline', 'AI-RMF:MEASURE-2.10 · OWASP:LLM06'],
              ['BSTN-F-2026-04-18-008', '2026-04-18 11:03', 'acme_phone_ai', 'canary_disclosure', 'Critical', 'Blocked inline', 'AI-RMF:MEASURE-2.7 · OWASP:LLM01 · ATLAS:AML.T0054'],
              ['BSTN-F-2026-04-17-031', '2026-04-17 22:14', 'billing_assistant', 'policy_violation', 'High', 'Blocked inline', 'AI-RMF:MANAGE-4.2 · OWASP:LLM08'],
              ['BSTN-F-2026-04-16-011', '2026-04-16 10:28', 'acme_phone_ai', 'third_party_disclosure', 'High', 'Blocked inline', 'AI-RMF:MEASURE-2.10 · OWASP:LLM06'],
              ['BSTN-F-2026-04-14-047', '2026-04-14 15:51', 'acme_phone_ai', 'divergence', 'Medium', 'Remediated', 'AI-RMF:MEASURE-2.3 · OWASP:LLM09'],
            ],
          },
        },
        {
          id: '4.2', title: 'Detection Class Breakdown (30d)',
          table: {
            columns: ['Detection Class', 'Total', 'Critical', 'High', 'Medium', 'Blocked Inline %', 'Remediated %'],
            rows: [
              ['canary_disclosure', '3', '3', '0', '0', '100%', '—'],
              ['third_party_disclosure', '2', '1', '1', '0', '50%', '50%'],
              ['pii_leak', '1', '1', '0', '0', '100%', '—'],
              ['policy_violation', '2', '0', '2', '0', '100%', '—'],
              ['divergence', '2', '0', '0', '2', '0%', '100%'],
            ],
          },
        },
      ],
    },

    // ==================== 5. INCIDENTS (12mo) ====================
    {
      id: '5', title: 'Incidents', bastion_unique: false,
      subsections: [
        {
          id: '5.1', title: 'Incident Register (last 12 months)',
          narrative: 'Curated from runner registry + manual incident reports. An "incident" = a finding escalated to AI Officer review or higher.',
          table: {
            columns: ['Date', 'Category', 'Severity', 'Agent', 'Outcome', 'Notification', 'Framework Tags'],
            rows: [
              ['2026-02-14', 'Prompt injection (jailbreak attempt)', 'Medium', 'acme_phone_ai', 'Blocked inline. No disclosure.', 'None required', 'AI-RMF:MANAGE-4.2 · OWASP:LLM01'],
              ['2026-03-08', 'Third-party PII disclosure (partial)', 'High', 'billing_assistant', 'Caught at NLI egress. 0 records released.', 'Internal AI Officer', 'AI-RMF:MEASURE-2.10 · OWASP:LLM06'],
              ['2026-03-21', 'Hallucinated delivery date', 'Low', 'acme_phone_ai', 'Flagged by divergence check. Caller notified of error.', 'None required', 'AI-RMF:MEASURE-2.3 · OWASP:LLM09'],
            ],
          },
        },
        {
          id: '5.2', title: 'Severity Distribution',
          table: {
            columns: ['Severity Level', 'Count', '%', 'Avg Estimated Cost'],
            rows: [
              ['SEV-1 Critical', '0', '0.0%', '$0'],
              ['SEV-2 Major', '1', '11.1%', '$180'],
              ['SEV-3 Moderate', '4', '44.4%', '$500'],
              ['SEV-4 Minor', '3', '33.3%', '$5,000'],
              ['SEV-5 Info', '1', '11.1%', '$0'],
            ],
          },
        },
      ],
    },

    // ==================== 6. TELEMETRY ====================
    {
      id: '6', title: 'Telemetry', bastion_unique: true,
      subsections: [
        {
          id: '6.1', title: 'PII Metrics',
          table: {
            columns: ['PII Type', 'Detected', 'Blocked', 'Residual', 'Per-Record Cost ($)', 'Residual Exposure ($)'],
            rows: [
              ['Phone number', '2', '2', '0', '$180', '$0'],
              ['Physical address', '1', '1', '0', '$180', '$0'],
              ['Named person (third-party)', '1', '1', '0', '$180', '$0'],
              ['Email', '0', '0', '0', '$180', '$0'],
              ['SSN / SIN', '0', '0', '0', '$180', '$0'],
              ['Credit card', '0', '0', '0', '$180', '$0'],
              ['Total', '4', '4', '0', '', '$0'],
            ],
          },
        },
        {
          id: '6.2', title: 'Tool Call Metrics',
          table: {
            columns: ['Metric', 'Value'],
            rows: [
              ['Total tool calls attempted', '36'],
              ['Approved', '34'],
              ['Blocked by policy', '2'],
              ['Block rate', '5.56%'],
              ['Top blocked category', 'refund_over_supervisor_threshold'],
              ['Privileged-action threshold violations', '2'],
            ],
          },
        },
        {
          id: '6.3', title: 'Anomaly & Drift',
          table: {
            columns: ['Signal', 'Value', 'Threshold', 'Status'],
            rows: [
              ['Anomaly rate (novel tool patterns)', '4.88%', '10%', 'Within bounds'],
              ['Rate anomalies (burst detection)', '0', '3 / 15s', 'Clean'],
              ['Novel tool alerts', '2', '5 / week', 'Within bounds'],
              ['Consistency score (hallucination rate)', '1.0', '< 0.8 alerts', 'Clean'],
              ['Behavior change detection', 'nominal', 'conservative / fail-closed', 'Nominal'],
            ],
          },
        },
      ],
    },

    // ==================== 7. FRAMEWORK MAP ====================
    {
      id: '7', title: 'Framework Map', bastion_unique: true,
      subsections: [
        {
          id: '7.1', title: 'Detection × Framework Matrix',
          narrative: 'Every Bastion detection type carries simultaneous tags for NIST AI RMF, OWASP LLM Top 10, ISO/IEC 42001, EU AI Act, and MITRE ATLAS. This is the matrix underwriters price against.',
          table: {
            columns: ['Bastion Detection', 'NIST AI RMF 1.0', 'OWASP LLM Top 10', 'ISO/IEC 42001', 'EU AI Act', 'MITRE ATLAS'],
            rows: [
              ['third_party_disclosure', 'MEASURE-2.10, MANAGE-4.3', 'LLM06', 'A.6.1.5, A.6.2.7', 'Art. 10, Art. 13', 'AML.T0051'],
              ['pii_leak', 'MEASURE-2.10, MEASURE-2.3', 'LLM06', 'A.6.1.5', 'Art. 10', 'AML.T0024'],
              ['divergence (hallucination)', 'MEASURE-2.3, MEASURE-2.8', 'LLM09', 'A.6.2.4', 'Art. 15', 'AML.T0043'],
              ['canary_disclosure (prompt / tool leak)', 'MEASURE-2.7, MANAGE-2.3', 'LLM01, LLM02', 'A.6.2.7, A.6.2.8', 'Art. 15 (cyber)', 'AML.T0054'],
              ['policy_violation (excessive agency)', 'MANAGE-4.2, GOVERN-3.2', 'LLM08', 'A.6.1.2, A.6.2.1', 'Art. 14 (oversight)', 'AML.T0053'],
              ['behavior change detection', 'MEASURE-3.2, MEASURE-4.1', '—', 'A.6.2.5', 'Art. 15 (accuracy)', 'AML.T0034'],
              ['red-team finding (adversarial)', 'MANAGE-4.1, MAP-5.1', 'LLM01, LLM02', 'A.6.2.6', 'Art. 15, Annex IV', 'Per-finding ATLAS ID'],
            ],
          },
        },
        {
          id: '7.2', title: 'Framework Coverage Summary',
          table: {
            columns: ['Framework', 'Version', 'Controls Tagged', 'Coverage %'],
            rows: [
              ['NIST AI RMF', '1.0 (Jan 2023)', '9 categories (GOVERN, MAP, MEASURE, MANAGE)', '86%'],
              ['OWASP LLM Top 10', '2025', '10 / 10', '100%'],
              ['ISO/IEC 42001', '2023', '9 controls in A.6.x', '78%'],
              ['EU AI Act', 'final 2024', 'Art. 10, 13, 14, 15 + Annex IV', '71%'],
              ['MITRE ATLAS', '2025.1', '7 tactics / 14 techniques', '92%'],
            ],
          },
        },
      ],
    },

    // ==================== 8. ATTESTATION ====================
    {
      id: '8', title: 'Attestation', bastion_unique: false,
      subsections: [
        {
          id: '8.1', title: 'Controls In Place',
          table: {
            columns: ['Control', 'Status', 'Layer', 'Last Verified'],
            rows: [
              ['AI reviewer evaluates every agent reply', 'Active', 'Groundedness + Authorization', '2026-04-24'],
              ['Knowledge graph of policies and tools', 'Active', 'Groundedness', '2026-04-24'],
              ['Authorization rules per agent and situation', 'Active', 'Authorization', '2026-04-24'],
              ['Hidden test phrases planted in every agent', 'Active', 'Groundedness + Authorization', '2026-04-24'],
              ['24/7 automated security testing', 'Active', 'Offensive', '2026-04-24'],
              ['One-flag kill switch', 'Tested', 'Infrastructure', '2026-02-04'],
              ['Rollback to last-known-good prompt', 'Tested', 'Operations', '2026-02-18'],
              ['Behavior drift watch', 'Coming soon', 'Drift', 'Phase 3'],
              ['Confidence scoring with statistical guarantees', 'Coming soon', 'Groundedness', 'Phase 3'],
            ],
          },
        },
        {
          id: '8.2', title: 'Attestation Statements',
          table: {
            columns: ['Area', 'Statement'],
            rows: [
              ['Data integrity', 'All telemetry sourced from Bastion Blue proxy at the point of interception. Events are tamper-evident with sequential IDs + daily Merkle roots. No manual adjustments.'],
              ['Methodology', 'Risk scores use the weighted component model: PII (30%), Policy (25%), Anomaly (20%), Integrity (15%), Drift (10%). Financial exposure uses IBM/Ponemon 2025 $180/record benchmark. Severity follows NIST IR framework adapted for AI failure modes.'],
              ['Compliance alignment', 'NIST AI RMF 1.0 (aligned — GOVERN/MAP/MEASURE/MANAGE) · OWASP LLM Top 10 (active monitoring) · ISO/IEC 42001:2023 (aligned, formal certification pending) · EU AI Act (preparing high-risk classification) · MITRE ATLAS (tagged per finding).'],
              ['Independence', 'Detection is fully automated. NLI classifier runs gpt-4o with no human-in-the-loop tuning per-finding. Stress-tested 40/40 cases (clean + adversarial).'],
              ['Period covered', '2026-03-24 → 2026-04-23 (30 days). Historical data available on request back to 2025-10-01.'],
              ['Signatory', 'Bastion Underwriting Report Engine v0.1.0 · generated 2026-04-24 · for Acme Logistics AI-fleet posture assessment.'],
            ],
          },
        },
      ],
    },
  ],
};
