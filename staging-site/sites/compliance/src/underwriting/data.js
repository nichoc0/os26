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
// Numbers honor the canonical baseline documented in
// src/data/fleetReportFixture.js (CANONICAL_DATA block):
//   - Customer: Demo Pharmacy (slug `maple-pharmacy`)
//   - Period: 2026-04-17 → 2026-05-17 (30 days), monitoring_hours = 720
//   - Production actions 30d: 805 (per-agent split below sums to 805)
//   - PII detected 30d: 70 · residual 1
//   - Severity register 30d slice: 0 / 1 / 2 / 4 / 2 = 9 incidents
//
// Consumed by:
//   - scripts/build-underwriting-xlsx.js  → /public/underwriting-latest.xlsx
//   - components/views/ReportView.jsx     → same data rendered as tabbed HTML

export const UNDERWRITING = {
  meta: {
    report_id: 'BSTN-UW-2026-05-17-DEMO',
    version: 'v2026.05.17',
    tier: 'Standard',
    last_modified: '2026-05-17',
    client: 'Demo Pharmacy',
    client_industry: 'Pharmacy / Outpatient Healthcare',
    assessor: 'Bastion Security',
    methodology: 'Continuous AI-Agent Telemetry + Semantic NLI (gpt-4o) + Hand-curated Policy Vault (SurrealDB)',
    frameworks_aligned: ['NIST AI RMF 1.0', 'OWASP LLM Top 10', 'EU AI Act', 'MITRE ATLAS', 'HIPAA Security Rule', 'FDA AI/ML Guidance'],
    monitoring_hours: 720,
    reporting_period: '2026-04-17 → 2026-05-17',
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
              ['Total transactions (30d)', '805', '—', '—'],
              ['Monitoring hours', '720', '—', '—'],
              ['Total incidents (30d)', '9', '12', 'Low'],
              ['Critical incidents (30d)', '0', '1', 'Low'],
              ['PII remediation rate', '98.6%', '78.2%', 'Outperforming'],
              ['Actions blocked (policy violations)', '47 of 312', '14 of 100', 'On target'],
              ['Anomaly rate', '0.42%', '11.2%', 'Low'],
              ['Avg latency (NLI gated egress)', '1.1s', '—', '—'],
              ['Adversarial probes (30d)', '390', '—', '—'],
            ],
          },
        },
        {
          id: '1.2', title: 'Classification',
          table: {
            columns: ['Field', 'Value'],
            rows: [
              ['Risk classification', 'Low Risk'],
              ['Controls credit observed', '-71.4% (delta between gross and net risk score)'],
              ['Next review', '2026-08-17 (quarterly)'],
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
          narrative: '6 customer-facing or back-office AI agents serving the Demo Pharmacy outpatient flow. Each agent has its own permissions and rule set, enforced before every reply is sent.',
          table: {
            columns: ['Agent', 'Channel', 'Requests', 'Cost ($)', 'Avg Latency', 'PII Flags', 'Tool Blocks', 'Risk %', 'Tier'],
            rows: [
              ['Sera (Intake)',         'Voice inbound',     '210', '$0.62', '0.8s', '18', '12', '26.1%', 'High'],
              ['Refill Router',         'Internal API',      '160', '$0.18', '0.6s', '14', '9',  '20.1%', 'Medium'],
              ['Pharmacist Callback',   'Voice + chat',      '135', '$0.41', '1.4s', '12', '8',  '17.0%', 'High'],
              ['Insurance Sync',        'Payer API',         '120', '$0.22', '1.2s', '11', '7',  '15.0%', 'Medium'],
              ['Compliance Monitor',    'Internal QA',       '107', '$0.09', '0.5s', '9',  '6',  '12.8%', 'Low'],
              ['Triage Classifier',     'Chat + API',        '73',  '$0.06', '0.9s', '6',  '5',  '9.0%',  'High'],
            ],
          },
        },
        {
          id: '2.2', title: 'Tool Authority Boundaries',
          table: {
            columns: ['Agent', 'Allowed Tools', 'Restricted Tools (KG-enforced)'],
            rows: [
              ['Sera (Intake)',       'caller_identify, rx_lookup, schedule_appointment, escalate_pharmacist',     'dispense_override, dosage_advise, controlled_substance_lookup'],
              ['Refill Router',       'refill_eligibility, refill_create, queue_dispense, notify_patient',          'controlled_substance_refill, prescriber_override'],
              ['Pharmacist Callback', 'rx_lookup, callback_schedule, clinical_note_attach, escalate_prescriber',    'dispense_override, dosage_advise, lab_order'],
              ['Insurance Sync',      'eligibility_check, prior_auth_submit, claim_status, payer_message',          'claim_adjudicate, copay_override, refund_issue'],
              ['Compliance Monitor',  'audit_log_query, hipaa_review, finding_report, redact_log',                  'pii_export, transcript_share, prescriber_override'],
              ['Triage Classifier',   'symptom_intake, urgency_score, escalate_nurse, route_self_care',             'diagnose, prescribe, dosage_advise'],
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
          narrative: 'Gross = fleet risk score if agents ran without Bastion. Net = same fleet with Bastion controls inline. Reduction is the controls-credit delta. This workbook is evidence for underwriting; pricing-tier assignments are the carrier\'s decision.',
          table: {
            columns: ['Posture', 'Risk Score', 'Classification'],
            rows: [
              ['Without controls (gross)', '69.9', 'High'],
              ['With Bastion Blue (net)', '20.0', 'Low'],
              ['Reduction', '-71.4%', '—'],
            ],
          },
        },
        {
          id: '3.2', title: 'Score Decomposition',
          narrative: 'Weighted components. Full methodology in sheet 8.',
          table: {
            columns: ['Component', 'Weight', 'Score', 'Benchmark (p50)', 'Description'],
            rows: [
              ['PHI / PII exposure',  '30%', '98.6', '78.2', 'Rate of unredacted PHI/PII in agent outputs'],
              ['Policy violations',   '25%', '85.0', '62.5', 'Tool calls that violated enforcement boundaries'],
              ['Behavioral anomaly',  '20%', '99.6', '81.0', 'Statistical deviation from baseline'],
              ['Output integrity',    '15%', '97.9', '70.1', 'Hallucinated dosages / unverifiable claims'],
              ['Model drift',         '10%', '98.4', '83.4', 'Systematic output-distribution change'],
            ],
          },
        },
        {
          id: '3.3', title: 'Risk Contribution by Line Item',
          narrative: 'Per-line-item risk-score contribution over the 30-day period. Gross = score contribution without Bastion controls in place. Net = residual contribution after Bastion enforcement. Reduction = applied-controls credit per line item. Totals reconcile to the headline 69.9 / 20.0 fleet score in Section 3.1.',
          table: {
            columns: ['Line Item', 'Count', 'Per-Event Weight', 'Gross', 'Residual', 'Net'],
            rows: [
              ['PHI / PII records (detected)',  '70', '0.60', '42.0', '1', '12.0'],
              ['Tool-violation attempts',       '47', '0.40', '18.6', '0', '4.4'],
              ['Adversarial probe violations',  '8',  '1.00', '8.0',  '0', '2.6'],
              ['Session rollback (ops)',        '1',  '1.30', '1.3',  '1', '1.0'],
              ['Total risk contribution',       '',   '',     '69.9', '',  '20.0'],
              ['Reduction (delta)',             '',   '',     '',     '',  '-71.4%'],
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
          narrative: 'Every finding comes from Bastion\'s combined groundedness, knowledge-base, and authorization checks, and is tagged with the relevant compliance framework. Updated live every 4 seconds.',
          table: {
            columns: ['Finding ID', 'Timestamp', 'Agent', 'Detection', 'Severity', 'Status', 'Framework Tags'],
            rows: [
              ['BSTN-F-2026-05-16-011', '2026-05-16 10:28', 'sera_intake',         'phi_cross_record',      'Critical', 'Blocked inline',            'HIPAA:§164.312(a)(1) · AI-RMF:MEASURE-2.10 · OWASP:LLM06'],
              ['BSTN-F-2026-05-14-047', '2026-05-14 15:51', 'sera_intake',         'language_mirror_drift', 'Medium',   'Remediated',                'HIPAA:§164.530(b) · AI-RMF:MEASURE-2.3 · OWASP:LLM09'],
              ['BSTN-F-2026-05-12-018', '2026-05-12 11:18', 'pharmacist_callback', 'clinical_hallucination','High',     'Blocked inline',            'FDA AI/ML:§V.B · AI-RMF:MEASURE-2.3 · OWASP:LLM09'],
              ['BSTN-F-2026-05-09-022', '2026-05-09 16:12', 'sera_intake',         'phi_cross_record',      'Critical', 'Blocked inline',            'HIPAA:§164.312(a)(1) · OWASP:LLM06'],
              ['BSTN-F-2026-05-06-008', '2026-05-06 09:42', 'refill_router',       'policy_violation',      'High',     'Blocked inline',            'AI-RMF:MANAGE-4.2 · OWASP:LLM08'],
              ['BSTN-F-2026-05-03-031', '2026-05-03 22:14', 'insurance_sync',      'third_party_disclosure','High',     'Flagged for review',        'AI-RMF:MEASURE-2.10 · OWASP:LLM06 · EU-AI:Art.10'],
              ['BSTN-F-2026-04-28-014', '2026-04-28 09:14', 'sera_intake',         'out_of_scope_clinical', 'Medium',   'Remediated (prompt patch)', 'FDA AI/ML:§V.A · AI-RMF:MEASURE-2.3'],
              ['BSTN-F-2026-04-23-002', '2026-04-23 16:08', 'compliance_monitor',  'policy_violation',      'High',     'Blocked inline',            'AI-RMF:MANAGE-4.2 · OWASP:LLM08 · EU-AI:Art.14'],
              ['BSTN-F-2026-04-19-022', '2026-04-19 13:40', 'triage_classifier',   'triage_rubric_leak',    'High',     'Remediated (constraint)',   'FDA AI/ML:§V.B · ISO-14971:cl.7 · OWASP:LLM02'],
              ['BSTN-F-2026-04-18-008', '2026-04-18 11:03', 'sera_intake',         'canary_disclosure',     'Critical', 'Blocked inline',            'AI-RMF:MEASURE-2.7 · OWASP:LLM01 · ATLAS:AML.T0054'],
            ],
          },
        },
        {
          id: '4.2', title: 'Detection Class Breakdown (30d)',
          table: {
            columns: ['Detection Class', 'Total', 'Critical', 'High', 'Medium', 'Blocked Inline %', 'Remediated %'],
            rows: [
              ['phi_cross_record',        '2', '2', '0', '0', '100%', '—'],
              ['canary_disclosure',       '1', '1', '0', '0', '100%', '—'],
              ['clinical_hallucination',  '1', '0', '1', '0', '100%', '—'],
              ['policy_violation',        '2', '0', '2', '0', '100%', '—'],
              ['third_party_disclosure',  '1', '0', '1', '0', '0%',   '—'],
              ['triage_rubric_leak',      '1', '0', '1', '0', '0%',   '100%'],
              ['out_of_scope_clinical',   '1', '0', '0', '1', '0%',   '100%'],
              ['language_mirror_drift',   '1', '0', '0', '1', '0%',   '100%'],
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
              ['2026-05-09', 'PHI cross-record disclosure (partial)', 'Critical', 'sera_intake',         'Caught at NLI egress. 0 records released.',          'Internal AI Officer + HIPAA Privacy Officer', 'HIPAA:§164.312(a)(1) · AI-RMF:MEASURE-2.10 · OWASP:LLM06'],
              ['2026-05-12', 'Clinical hallucination (dosage)',       'High',     'pharmacist_callback', 'Blocked inline. Caller informed of error.',          'Internal AI Officer',                          'FDA AI/ML:§V.B · AI-RMF:MEASURE-2.3 · OWASP:LLM09'],
              ['2026-04-19', 'Triage rubric leakage',                 'High',     'triage_classifier',   'Constraint applied within 14 hours. Re-test clean.', 'Internal AI Officer + Clinical Safety Lead',   'FDA AI/ML:§V.B · ISO-14971:cl.7'],
              ['2026-03-21', 'Hallucinated formulary entry',          'Low',     'refill_router',       'Flagged by divergence check. Caller corrected.',     'None required',                                'AI-RMF:MEASURE-2.3 · OWASP:LLM09'],
              ['2026-02-14', 'Prompt injection (jailbreak attempt)',  'Medium',  'sera_intake',         'Blocked inline. No disclosure.',                     'None required',                                'AI-RMF:MANAGE-4.2 · OWASP:LLM01'],
            ],
          },
        },
        {
          id: '5.2', title: 'Severity Distribution (30d)',
          table: {
            columns: ['Severity Level', 'Count', '%', 'Avg Risk Weight'],
            rows: [
              ['SEV-1 Critical', '0', '0.0%',  '20.0'],
              ['SEV-2 Major',    '1', '11.1%', '12.0'],
              ['SEV-3 Moderate', '2', '22.2%', '4.0'],
              ['SEV-4 Minor',    '4', '44.5%', '1.5'],
              ['SEV-5 Info',     '2', '22.2%', '0.5'],
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
          id: '6.1', title: 'PHI / PII Metrics (30d)',
          table: {
            columns: ['PII Type', 'Detected', 'Blocked', 'Residual', 'Per-Record Risk Weight', 'Residual Risk'],
            rows: [
              ['Phone number',                '24', '24', '0', '4.0', '0.0'],
              ['Patient name (third-party)',  '18', '18', '0', '6.0', '0.0'],
              ['Date of birth',               '11', '11', '0', '6.0', '0.0'],
              ['Physical address',            '8',  '8',  '0', '4.0', '0.0'],
              ['Medication / Rx number',      '5',  '5',  '0', '6.0', '0.0'],
              ['Email',                       '3',  '3',  '0', '4.0', '0.0'],
              ['SSN / SIN',                   '1',  '0',  '1', '8.0', '8.0'],
              ['Credit card',                 '0',  '0',  '0', '8.0', '0.0'],
              ['Total',                       '70', '69', '1', '',    '8.0'],
            ],
          },
        },
        {
          id: '6.2', title: 'Tool Call Metrics (30d)',
          table: {
            columns: ['Metric', 'Value'],
            rows: [
              ['Total tool calls attempted', '312'],
              ['Approved', '265'],
              ['Blocked by policy', '47'],
              ['Block rate', '15.06%'],
              ['Top blocked category', 'dispense_override · dosage_advise · pii_export'],
              ['Privileged-action threshold violations', '8'],
            ],
          },
        },
        {
          id: '6.3', title: 'Anomaly & Drift',
          table: {
            columns: ['Signal', 'Value', 'Threshold', 'Status'],
            rows: [
              ['Anomaly rate (novel tool patterns)', '0.42%', '10%', 'Within bounds'],
              ['Rate anomalies (burst detection)', '0', '3 / 15s', 'Clean'],
              ['Novel tool alerts', '2', '5 / week', 'Within bounds'],
              ['Consistency score (hallucination rate)', '0.98', '< 0.8 alerts', 'Clean'],
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
          narrative: 'Every Bastion detection type carries simultaneous tags for NIST AI RMF, OWASP LLM Top 10, ISO/IEC 42001, EU AI Act, MITRE ATLAS, plus the healthcare overlay load-bearing for this customer (HIPAA Security Rule, FDA AI/ML guidance, ISO 14971).',
          table: {
            columns: ['Bastion Detection', 'NIST AI RMF 1.0', 'OWASP LLM Top 10', 'ISO/IEC 42001', 'EU AI Act', 'MITRE ATLAS', 'Healthcare overlay'],
            rows: [
              ['phi_cross_record',            'MEASURE-2.10, MANAGE-4.3', 'LLM06',         'A.6.1.5, A.6.2.7', 'Art. 10, Art. 13',  'AML.T0051', 'HIPAA §164.312(a)(1)'],
              ['pii_leak',                    'MEASURE-2.10, MEASURE-2.3', 'LLM06',         'A.6.1.5',          'Art. 10',           'AML.T0024', 'HIPAA §164.502(b)'],
              ['clinical_hallucination',      'MEASURE-2.3, MEASURE-2.8',  'LLM09',         'A.6.2.4',          'Art. 15',           'AML.T0043', 'FDA AI/ML §V.B'],
              ['triage_rubric_leak',          'MEASURE-2.7, MANAGE-2.3',   'LLM01, LLM02',  'A.6.2.7, A.6.2.8', 'Art. 15 (cyber)',   'AML.T0054', 'FDA AI/ML §V.B · ISO 14971 cl.7'],
              ['policy_violation',            'MANAGE-4.2, GOVERN-3.2',    'LLM08',         'A.6.1.2, A.6.2.1', 'Art. 14',           'AML.T0053', 'HIPAA §164.308(a)(4)'],
              ['out_of_scope_clinical',       'MEASURE-2.3, MANAGE-4.2',   'LLM08',         'A.6.2.4',          'Art. 14',           'AML.T0053', 'FDA AI/ML §V.A'],
              ['language_mirror_drift',       'MEASURE-3.2, MEASURE-4.1',  '—',             'A.6.2.5',          'Art. 15 (accuracy)','AML.T0034', 'HIPAA §164.530(b)'],
              ['canary_disclosure',           'MEASURE-2.7',               'LLM01, LLM02',  'A.6.2.7',          'Art. 15 (cyber)',   'AML.T0054', '—'],
              ['red-team finding (adversarial)', 'MANAGE-4.1, MAP-5.1',    'LLM01, LLM02',  'A.6.2.6',          'Art. 15, Annex IV', 'Per-finding ATLAS ID', '—'],
            ],
          },
        },
        {
          id: '7.2', title: 'Framework Coverage Summary',
          table: {
            columns: ['Framework', 'Version', 'Controls Tagged', 'Coverage %'],
            rows: [
              ['NIST AI RMF',         '1.0 (Jan 2023)',    '9 categories (GOVERN, MAP, MEASURE, MANAGE)', '86%'],
              ['OWASP LLM Top 10',    '2025',              '10 / 10',                                     '100%'],
              ['ISO/IEC 42001',       '2023',              '9 controls in A.6.x',                         '78%'],
              ['EU AI Act',           'final 2024',        'Art. 10, 13, 14, 15 + Annex IV',              '71%'],
              ['MITRE ATLAS',         '2025.1',            '7 tactics / 14 techniques',                   '92%'],
              ['HIPAA Security Rule', '45 CFR §164 Sub C', '§164.308, §164.312(a)(1), §164.530(b)',       '83%'],
              ['FDA AI/ML Guidance',  'Dec 2024 final',    '§V.A, §V.B',                                  '100%'],
              ['ISO 14971',           '2019',              'cl. 5, 6, 7, 9',                              '100%'],
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
              ['AI reviewer evaluates every agent reply',     'Active',      'Groundedness + Authorization', '2026-05-17'],
              ['Knowledge graph of policies and tools',       'Active',      'Groundedness',                 '2026-05-17'],
              ['Authorization rules per agent and situation', 'Active',      'Authorization',                '2026-05-17'],
              ['Hidden test phrases planted in every agent',  'Active',      'Groundedness + Authorization', '2026-05-17'],
              ['24/7 automated security testing',             'Active',      'Offensive',                    '2026-05-17'],
              ['One-flag kill switch',                        'Tested',      'Infrastructure',               '2026-03-04'],
              ['Rollback to last-known-good prompt',          'Tested',      'Operations',                   '2026-03-18'],
              ['Behavior drift watch',                        'Coming soon', 'Drift',                        'Phase 3'],
              ['Confidence scoring with statistical guarantees','Coming soon','Groundedness',                'Phase 3'],
            ],
          },
        },
        {
          id: '8.2', title: 'Attestation Statements',
          table: {
            columns: ['Area', 'Statement'],
            rows: [
              ['Data integrity', 'All telemetry sourced from Bastion Blue proxy at the point of interception. Events are tamper-evident with sequential IDs + daily Merkle roots. No manual adjustments.'],
              ['Methodology', 'Risk scores use the weighted component model: PHI/PII (30%), Policy (25%), Anomaly (20%), Integrity (15%), Drift (10%). Per-line-item contributions are weight × event count, normalised against a 100-point ceiling. Severity follows NIST IR framework adapted for AI failure modes.'],
              ['Compliance alignment', 'For this customer\'s vertical (Pharmacy / Outpatient Healthcare) the load-bearing frameworks are ISO 14971 (cl. 5/6/7/9), HIPAA Security Rule (§164.308, §164.312(a)(1), §164.530(b)), and FDA AI/ML guidance (§V.A, §V.B). Cross-cutting frameworks tagged on every finding: NIST AI RMF 1.0 (GOVERN/MAP/MEASURE/MANAGE), OWASP LLM Top 10, ISO/IEC 42001 (A.6.x — full mapping in sheet 7), EU AI Act, MITRE ATLAS.'],
              ['Independence', 'Detection is fully automated. NLI classifier runs gpt-4o with no human-in-the-loop tuning per-finding. Stress-tested 40/40 cases (clean + adversarial).'],
              ['Period covered', '2026-04-17 → 2026-05-17 (30 days). Historical data available on request back to 2025-11-17.'],
              ['Signatory', 'Bastion Underwriting Report Engine v0.1.0 · generated 2026-05-17 · for Demo Pharmacy AI-fleet posture assessment.'],
            ],
          },
        },
      ],
    },
  ],
};
