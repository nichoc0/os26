// Authorization check UI — Layer 2 of the three-signal detection.
//
// Renders the Hoare-triple constraint walk from bastion-proxy /api/authorization:
//   1. atomic claims extracted (reuses Layer 1's Groq decomposer)
//   2. per claim: free-text fragments mapped to canonical KG entities via HNSW
//   3. direct constraint edges (restricts / requires / conflicts_with / grants)
//   4. chain walks: entity -[requires]-> flow -[conflicts_with]-> current_context
//   5. violation verdict with full path + Hoare triple
//
// Paper alignment: whitepaper §5.2 (Hoare triples), §5.4 (Z3 discharge —
// simplified to direct SurrealQL walks this demo, honest call-out in paper-alignment.md).

import { useState } from 'react';
import {
  Spinner, Warning, CheckCircle, Question, ArrowRight, ShieldWarning, ShieldCheck,
} from '@phosphor-icons/react';
import { useSessionStore } from '../../store/sessionStore';
import { detectPolicyFlags, summarizePolicyFlags, detectAuthorizationApprovals } from './policyFlags';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');

const RUNNER_BASE = (() => {
  if (import.meta.env.VITE_RUNNER_URL) return import.meta.env.VITE_RUNNER_URL;
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') {
      return 'http://127.0.0.1:18790';
    }
  }
  const prefix = import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/'
    ? import.meta.env.BASE_URL.replace(/\/$/, '')
    : '';
  return `${prefix}/api/runner`;
})();

async function runNliCheck({ claim, priorTurns, context, scope, kgTriples }) {
  const res = await fetch(`${RUNNER_BASE}/v1/nli-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      claim,
      priorTurns: (priorTurns || []).map((t) => ({
        user: t.user || t.user_text || '',
        assistant: t.assistant || t.assistant_response || '',
      })),
      context,
      scope,
      kgFacts: (kgTriples || []).slice(0, 50).map((t) => ({ h: t.h, r: t.r, t: t.t })),
    }),
  });
  if (!res.ok) throw new Error(`nli-check ${res.status}`);
  return res.json();
}

const DEFAULT_CONTEXTS = [
  'customer_inbound_call',
  'compliance_audit',
  'shift_handoff',
  'emergency_dispatch',
];

export function computeLocalAuthorization(claimText, ctx, kgTriples, { priorTurns = [], scope = 'demo' } = {}) {
  const text = (claimText || '').toLowerCase();
  const context = (ctx || '').toLowerCase();
  if (!text.trim()) {
    return { global_verdict: 'inconclusive', per_claim: [], atomic_claims: [], notes: ['Nothing to check.'], paper_reference: '', retrieval_mode: 'substring (local)' };
  }

  const segments = text
    .split(/(?<=[.!?])\s+|\s*;\s*|\s*\band\b\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 6)
    .slice(0, 3);
  const atomic_claims = segments.map((s, i) => ({ id: `a${i + 1}`, text: s }));

  const RESTRICTED_ACTIONS = [
    'supervisor-override', 'hub-alpha-727-bravo', 'weather-exempt-oc-42', 'dot-hos-09',
    'disclose', 'reveal', 'priority-tier roster', 'account numbers', 'bypass',
    'disconnect', 'override', 'force',
  ];
  // Negative-stance phrases an agent should never use with a customer.
  // Even without a KG rule match, these are unprofessional / refusal-of-service
  // and must flip the verdict to violation.
  const NEGATIVE_STANCE_PATTERNS = [
    /\bi\s*(?:wo[n']?t|will\s+not|won'?t)\s+help\b/i,
    /\bi\s*refuse\s+to\b/i,
    /\bnot\s+helping\s+you\b/i,
    /\bdon'?t\s+(?:bother|contact|call)\s+(?:me|us)\b/i,
    /\bgo\s+away\b/i,
    /\bstop\s+(?:asking|calling|contacting)\b/i,
    /\bfigure\s+it\s+out\s+yourself\b/i,
    /\bnot\s+my\s+(?:problem|job)\b/i,
  ];

  const perClaim = atomic_claims.map((c) => {
    const hits = RESTRICTED_ACTIONS.filter((k) => c.text.includes(k));
    const matchingTriples = kgTriples.filter((t) => {
      const blob = `${t.h} ${t.r} ${t.t}`.toLowerCase();
      return hits.some((h) => blob.includes(h));
    }).slice(0, 6);

    const restrictEdges = matchingTriples.filter((t) => /restrict|violates|restricted_from/.test(t.r));
    const requireEdges  = matchingTriples.filter((t) => /requires|must_follow|enforces/.test(t.r));
    const grantEdges    = matchingTriples.filter((t) => /grants|uses|has_priority/.test(t.r));

    const restrictedOutsideAudit = /customer_inbound_call|emergency_dispatch/.test(context)
      && (restrictEdges.length > 0 || /override|disclose|reveal|bypass|force/.test(c.text));

    // Negative-stance / refusal-of-service hits violation in any context.
    const negativeStance = NEGATIVE_STANCE_PATTERNS.some((rx) => rx.test(c.text));

    // Real default — when nothing matched, the result is 'inconclusive', not
    // 'ok'. Granting permission requires a positive signal (a matching rule
    // saying it's allowed). The previous tautology silently approved everything.
    const verdict = (restrictedOutsideAudit || negativeStance)
      ? 'violation'
      : (matchingTriples.length > 0 ? 'ok' : 'inconclusive');

    const chain = [
      ...restrictEdges.map((t) => ({ relation: 'restricts', from: t.h, to: t.t })),
      ...requireEdges.map((t) => ({ relation: 'requires', from: t.h, to: t.t })),
      ...grantEdges.map((t) => ({ relation: 'grants', from: t.h, to: t.t })),
    ];

    const hoareTriple = {
      precondition: context,
      action: 'agent statement',
      postcondition: verdict === 'violation' ? 'policy violation' : 'allowed',
    };

    return {
      claim: { text: c.text },
      canonical_entities: Array.from(new Set(matchingTriples.flatMap((t) => [t.h, t.t]))).slice(0, 6),
      direct_constraints: matchingTriples.map((t) => ({ h: t.h, r: t.r, t: t.t })),
      chain_walks: chain.slice(0, 5),
      verdict,
      hoare_triple: hoareTriple,
      violation_reason: restrictedOutsideAudit
        ? `In situation "${context}", this statement is not allowed because rule "${(restrictEdges[0] || { h: 'Policy', r: 'restricts', t: 'disclose' }).h} restricts ${(restrictEdges[0] || { t: 'disclose' }).t}" applies.`
        : null,
    };
  });

  // Runtime policy-flag overlay — catches adjacent-disclosure intent, PII
  // tokens, canary leaks, and cross-turn divergences that the
  // constraint-walk alone misses. High/critical flags force the global
  // verdict to 'violation' and inject a synthesized per-claim entry so
  // the UI shows exactly what tripped.
  const policyFlags = detectPolicyFlags(claimText, { priorTurns, scope, context });
  const flagSummary = summarizePolicyFlags(policyFlags);
  const forceViolation = flagSummary.worst === 'critical' || flagSummary.worst === 'high';

  if (forceViolation) {
    // Map flags into a synthetic claim entry so the UI's per-claim
    // breakdown surfaces the exact violating phrase with its Hoare
    // triple and reason.
    const syntheticChain = policyFlags.slice(0, 6).map((f) => ({
      relation: f.kind === 'canary_leak' ? 'restricts' : (f.kind === 'pii_present' ? 'restricts' : 'conflicts_with'),
      from: f.label || f.kind,
      to: f.phrase || f.value || f.type || 'disclosure',
    }));
    const reason = policyFlags
      .map((f) => `${f.severity.toUpperCase()} ${f.kind}: ${f.label || f.reason || f.phrase || f.type}`)
      .join(' · ');
    perClaim.push({
      claim: { text: `[policy-flag] ${policyFlags.length} runtime violation(s) detected` },
      canonical_entities: ['Policy:adjacent_disclosure', 'Policy:pii_protection'],
      direct_constraints: [],
      chain_walks: syntheticChain,
      verdict: 'violation',
      hoare_triple: {
        precondition: context,
        action: 'agent statement',
        postcondition: 'policy violation',
      },
      violation_reason: reason,
    });
  }

  // Positive-authorization signals — caller-initiated self-actions, benign
  // factual replies, conversational pleasantries. Without these, every reply
  // not explicitly matched by a KG rule falls through to 'inconclusive'
  // (the all-UNCLEAR look). docs/08 #3 partial fix.
  const approvals = detectAuthorizationApprovals(claimText, { priorTurns, context });
  const hasApproval = approvals.length > 0;

  const anyViolation = perClaim.some((pc) => pc.verdict === 'violation');
  const anyOk = perClaim.some((pc) => pc.verdict === 'ok');
  // When approvals fire and nothing's flagging, push the per-claim verdicts
  // up to 'ok' so the UI shows a coherent green-across read instead of a
  // mix of inconclusives next to a global Authorized.
  if (hasApproval && !forceViolation && !anyViolation) {
    for (const pc of perClaim) {
      if (pc.verdict === 'inconclusive') {
        pc.verdict = 'ok';
        pc.violation_reason = null;
        pc.approval_reason = approvals[0].label;
      }
    }
  }
  const global_verdict = (forceViolation || anyViolation)
    ? 'violation'
    : (anyOk || hasApproval ? 'ok' : 'inconclusive');

  const notes = [
    `Found ${atomic_claims.length} statement${atomic_claims.length === 1 ? '' : 's'} in the answer`,
    `Situation "${context}" checked against ${kgTriples.length} known fact${kgTriples.length === 1 ? '' : 's'}`,
    `${perClaim.reduce((a, pc) => a + pc.direct_constraints.length, 0)} rule${perClaim.reduce((a, pc) => a + pc.direct_constraints.length, 0) === 1 ? '' : 's'} applied`,
    `Result: ${global_verdict === 'violation' ? 'Blocked' : global_verdict === 'ok' ? 'Allowed' : 'Unclear'}`,
  ];
  if (policyFlags.length > 0) {
    notes.push(`Policy watch: ${flagSummary.counts.critical} critical, ${flagSummary.counts.high} high, ${flagSummary.counts.medium} medium concern${flagSummary.counts.critical + flagSummary.counts.high + flagSummary.counts.medium === 1 ? '' : 's'}`);
  }

  return {
    global_verdict,
    per_claim: perClaim,
    atomic_claims,
    policy_flags: policyFlags,
    policy_flag_summary: flagSummary,
    approvals,
    notes,
    paper_reference: '',
    retrieval_mode: 'substring (local)',
  };
}

const VERDICT_STYLE = {
  ok:           { ring: 'border-blue-500/40', text: 'text-blue-700 dark:text-blue-300', Icon: ShieldCheck },
  violation:    { ring: 'border-slate-900 dark:border-slate-200', text: 'text-slate-900 dark:text-slate-100', Icon: ShieldWarning },
  inconclusive: { ring: 'border-slate-300 dark:border-slate-700', text: 'text-slate-500 dark:text-slate-400', Icon: Question },
};

const RELATION_STYLE = {
  restricts:      'text-slate-900 dark:text-slate-100 bg-slate-200/60 dark:bg-slate-100/10 border-slate-400',
  requires:       'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 border-blue-400',
  conflicts_with: 'text-slate-900 dark:text-slate-100 bg-slate-300/40 dark:bg-slate-600/30 border-slate-600',
  grants:         'text-blue-600 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-500/10 border-blue-300',
};

export default function AuthorizationPanel({ defaultClaim = '', priorTurns = [], scope = 'demo' }) {
  const [claim, setClaim] = useState(defaultClaim);
  const [context, setContext] = useState('customer_inbound_call');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(null);
  const kgTriples = useSessionStore((s) => s.kgTriples);
  const fetchKg = useSessionStore((s) => s.fetchKg);

  async function run() {
    const claimText = claim.trim();
    const ctx = context.trim();
    if (!claimText || !ctx) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setElapsedMs(null);
    const t0 = performance.now();
    try {
      // Hoist `triples` to function scope so the NLI call below can reference
      // it regardless of which branch (remote API vs local compute) populated
      // the verdict. (Previously `triples` was let-scoped inside the local
      // fallback block, which threw ReferenceError in the NLI call and
      // silently disabled the AI reviewer for every authorization check.)
      let triples = kgTriples;
      let data = null;
      try {
        const res = await fetch(`${API_BASE}/api/authorization`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claim: claimText, context: ctx, namespace: 'demo' }),
        });
        if (res.ok) data = await res.json();
      } catch {}

      if (!data) {
        if (!triples || triples.length === 0) {
          await fetchKg();
          triples = useSessionStore.getState().kgTriples;
        }
        data = computeLocalAuthorization(claimText, ctx, triples || [], { priorTurns, scope });
      }

      // Run the semantic NLI classifier — ground truth for paraphrased /
      // contextual violations. Only escalate to 'violation' when NLI
      // returns a high/critical severity OR flags hit critical/high.
      // Medium NLI hits alone do not flip verdict (avoids false positives
      // on "refuses to disclose" replies the classifier over-labels).
      try {
        const nli = await runNliCheck({ claim: claimText, priorTurns, context: ctx, scope, kgTriples: triples });
        data.nli = nli;
        // NLI is ground truth: regex flags can false-positive on safe
        // claims, so a clean NLI verdict overrides them. Only escalate to
        // violation when NLI says so with high/critical severity.
        if (nli.verdict === 'clean') {
          // Only let NLI clear a previous violation if the local heuristic
          // didn't catch a hard-coded restriction (canary leak, refusal-of-
          // service, etc.). Hard local violations stand even if NLI says clean.
          if (data.global_verdict !== 'violation') {
            data.global_verdict = 'ok';
          }
        } else if (nli.verdict === 'violation') {
          // The model is the ground truth. Any rated severity flips the verdict.
          // Previously this only fired for critical/high, so a medium-severity
          // model verdict was silently dropped while the broken local default
          // ('ok' for everything) stuck.
          data.global_verdict = 'violation';
          const mapped = (nli.violations || []).map((v) => ({
            claim: { text: `[NLI] ${v.excerpt || v.type}` },
            canonical_entities: [`Policy:${v.type}`],
            direct_constraints: [],
            chain_walks: [{ relation: 'conflicts_with', from: `Context:${ctx}`, to: `Disclosure:${v.type}` }],
            verdict: 'violation',
            hoare_triple: `{P_KG: ${ctx}} claim {Q_KG: policy_violation}`,
            violation_reason: `${v.severity?.toUpperCase() || 'HIGH'} ${v.type}: ${v.reasoning || ''}`,
            source: 'llm-nli',
          }));
          data.per_claim = [...(data.per_claim || []), ...mapped];
        }
      } catch (e) {
        data.nli_error = e.message;
      }
      setResult(data);
      setElapsedMs(Math.round(performance.now() - t0));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const verdictStyle = result ? VERDICT_STYLE[result.global_verdict] ?? VERDICT_STYLE.inconclusive : null;
  const perClaim = result?.per_claim ?? [];

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none">
      <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
          Authorization Check
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Is the agent allowed to say or do this in the current situation?
        </p>
      </header>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">
              Statement to check
            </label>
            <textarea
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              rows={3}
              placeholder="Paste an agent reply here…"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-none p-3 text-sm text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">
              Situation
            </label>
            <input
              list="context-suggestions"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="customer_inbound_call"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-none p-3 text-sm text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
            <datalist id="context-suggestions">
              {DEFAULT_CONTEXTS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="text-[10px] text-slate-400 mt-2">
              Try the same statement in{' '}
              <code className="font-mono text-slate-600 dark:text-slate-300">customer_inbound_call</code>{' '}
              (blocked) vs.{' '}
              <code className="font-mono text-slate-600 dark:text-slate-300">compliance_audit</code>{' '}
              (allowed).
            </p>
          </div>
        </div>

        <button
          onClick={run}
          disabled={loading || !claim.trim() || !context.trim()}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-none border border-blue-500 bg-blue-500 text-white hover:bg-blue-600 hover:border-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <>
              <Spinner size={14} weight="bold" className="animate-spin" /> Checking rules…
            </>
          ) : (
            <>Check permission</>
          )}
        </button>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-none p-3 text-sm text-red-700 dark:text-red-300">
            Failed: {error}
          </div>
        )}

        {result && verdictStyle && (
          <div className={`border ${verdictStyle.ring} rounded-none overflow-hidden`}>
            <div className="flex items-stretch">
              <div
                className={`flex items-center justify-center px-5 ${
                  result.global_verdict === 'violation'
                    ? 'bg-slate-900 text-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-50 dark:bg-slate-900/50'
                }`}
              >
                <verdictStyle.Icon size={22} weight="bold" className={verdictStyle.text} />
              </div>
              <div className="flex-1 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Situation: <span className="font-mono text-slate-700 dark:text-slate-300">{result.context}</span>
                    {result.constraint_triples_consulted ? ` · ${result.constraint_triples_consulted} rule${result.constraint_triples_consulted === 1 ? '' : 's'} checked` : ''}
                    {elapsedMs ? ` · ${elapsedMs}ms` : ''}
                  </div>
                  <div className={`text-lg font-bold font-mono uppercase ${verdictStyle.text}`}>
                    {result.global_verdict === 'violation' ? 'Blocked' : result.global_verdict === 'ok' ? 'Allowed' : 'Unclear'}
                  </div>
                </div>
                {result.violated_chains && result.violated_chains.length > 0 && (
                  <div className="mt-2 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                    {result.violated_chains.length} rule{result.violated_chains.length === 1 ? '' : 's'} broken
                  </div>
                )}
              </div>
            </div>

            {/* ==== AI reviewer (semantic NLI classifier, gpt-4o under the hood) ==== */}
            {result.nli && (
              <div className={`border-t border-slate-200 dark:border-slate-800 p-4 ${result.nli.verdict === 'violation' ? 'bg-slate-900/5 dark:bg-slate-100/5' : 'bg-blue-50/30 dark:bg-blue-500/5'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <ShieldWarning size={14} weight="bold" className={result.nli.verdict === 'violation' ? 'text-slate-900 dark:text-slate-100' : 'text-blue-500'} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">
                    AI reviewer · {result.nli.verdict === 'violation' ? 'flagged a problem' : 'looks fine'} {result.nli.elapsed_ms ? `· ${result.nli.elapsed_ms}ms` : ''}
                  </span>
                </div>
                {result.nli.overall_reasoning && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 italic mb-2">{result.nli.overall_reasoning}</p>
                )}
                {Array.isArray(result.nli.violations) && result.nli.violations.length > 0 && (
                  <ul className="space-y-1.5">
                    {result.nli.violations.map((v, i) => (
                      <li key={i} className="text-[11px] font-mono text-slate-700 dark:text-slate-300 border-l-2 pl-2 py-0.5" style={{ borderColor: v.severity === 'critical' ? '#0f172a' : v.severity === 'high' ? '#334155' : '#64748b' }}>
                        <span className={`inline-block w-[70px] text-[9px] uppercase font-bold ${v.severity === 'critical' ? 'text-slate-900 dark:text-slate-100' : v.severity === 'high' ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}`}>
                          {v.severity}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 mr-2">{v.type}:</span>
                        <span className="text-slate-800 dark:text-slate-200">{v.reasoning}</span>
                        {v.excerpt && <div className="text-slate-400 ml-[78px] mt-0.5 italic">"{v.excerpt}"</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/40 space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Statements found ({result.atomic_claims?.length ?? 0})
              </div>

              {perClaim.length === 0 && (
                <div className="text-[11px] italic text-slate-400">
                  No specific statements found — nothing to evaluate.
                </div>
              )}

              {perClaim.map((pc, i) => (
                <AuthClaimBlock key={i} idx={i + 1} pc={pc} />
              ))}
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
              <details>
                <summary className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 cursor-pointer">
                  Why this rule fired
                </summary>
                <div className="mt-3 space-y-3">
                  {/* Plain-English rule trigger narrative */}
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed space-y-1.5">
                    {(() => {
                      const violatingClaims = perClaim.filter((pc) => pc.verdict === 'violation');
                      if (result.global_verdict === 'allowed') {
                        return <span>Decision: <strong>allowed</strong> — no rule was violated by any statement in the response.</span>;
                      }
                      if (violatingClaims.length === 0) {
                        return <span>Decision: <strong>{result.global_verdict || 'inconclusive'}</strong>.</span>;
                      }
                      return (
                        <>
                          <div>Decision: <strong>{result.global_verdict || 'violation'}</strong> — {violatingClaims.length} statement{violatingClaims.length === 1 ? '' : 's'} violated a rule.</div>
                          <ul className="space-y-1 mt-1.5">
                            {violatingClaims.slice(0, 3).map((pc, i) => {
                              const claimText = `${pc.claim?.subject || ''} ${pc.claim?.predicate || ''} ${pc.claim?.object || ''}`.trim();
                              const constraint = pc.direct_constraints?.[0];
                              const ruleText = constraint?.rule || constraint?.label || constraint?.description || 'a policy rule';
                              return (
                                <li key={i} className="border-l-2 border-blue-500 pl-2 py-0.5">
                                  <div className="text-slate-700 dark:text-slate-300">"{claimText}"</div>
                                  <div className="text-slate-500 dark:text-slate-400 mt-0.5">→ blocked by: {ruleText}</div>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      );
                    })()}
                  </div>

                  {/* Per-claim outcome table */}
                  {perClaim.length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-700">
                      <div className="grid grid-cols-[1fr_70px_90px] gap-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        <span>Statement</span>
                        <span className="text-right">Rules</span>
                        <span className="text-right">Outcome</span>
                      </div>
                      {perClaim.map((pc, i) => {
                        const claimText = `${pc.claim?.subject || ''} ${pc.claim?.predicate || ''} ${pc.claim?.object || ''}`.trim();
                        const ruleCount = (pc.direct_constraints?.length || 0) + (pc.chains?.length || 0);
                        return (
                          <div key={i} className="grid grid-cols-[1fr_70px_90px] gap-1 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0 text-[10px]">
                            <span className="text-slate-700 dark:text-slate-300 truncate" title={claimText}>{claimText}</span>
                            <span className="text-right font-mono text-slate-600 dark:text-slate-400">{ruleCount}</span>
                            <span className={`text-right font-mono uppercase ${pc.verdict === 'violation' ? 'text-blue-700 dark:text-blue-400' : pc.verdict === 'allowed' ? 'text-slate-500' : 'text-slate-400'}`}>
                              {pc.verdict || '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(result.notes ?? []).length > 0 && (
                    <ul className="space-y-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                      {(result.notes ?? []).map((n, i) => (
                        <li key={i}>• {n}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AuthClaimBlock({ idx, pc }) {
  const { claim, mapped_entities = [], direct_constraints = [], chains = [], verdict } = pc;
  const verdictStyle = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.inconclusive;
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600 font-mono">#{idx}</span>
          <span className="font-mono text-sm text-slate-800 dark:text-slate-200 break-all">
            {claim.subject} <span className="text-blue-600 dark:text-blue-400">{claim.predicate}</span> {claim.object}
          </span>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 border rounded-none text-[10px] font-bold uppercase tracking-widest ${verdictStyle.text} ${verdictStyle.ring}`}>
          <verdictStyle.Icon size={10} weight="bold" />
          {verdict === 'violation' ? 'Blocked' : verdict === 'ok' ? 'Allowed' : 'Unclear'}
        </span>
      </div>

      {mapped_entities.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
            Entities matched
          </div>
          <ul className="space-y-1">
            {mapped_entities.map((me, i) => (
              <li key={i} className="flex items-center gap-2 text-[11px] font-mono">
                <span className="text-slate-600 dark:text-slate-300 italic truncate">"{me.claim_fragment}"</span>
                <ArrowRight size={10} weight="bold" className="text-slate-400 shrink-0" />
                <span className="text-blue-700 dark:text-blue-300 break-all">{me.canonical_entity}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {direct_constraints.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
            Rules that apply ({direct_constraints.length})
          </div>
          <ul className="space-y-1">
            {direct_constraints.map((c, i) => {
              const relStyle = RELATION_STYLE[c.r] ?? 'text-slate-500 border-slate-300';
              const relLabel = c.r === 'restricts' ? 'restricts' : c.r === 'requires' ? 'requires' : c.r === 'conflicts_with' ? 'conflicts with' : c.r === 'grants' ? 'grants' : c.r;
              return (
                <li key={i} className="flex items-start gap-2 text-[11px] font-mono">
                  <span className={`shrink-0 px-1.5 py-0.5 border rounded-none text-[9px] font-bold uppercase tracking-widest ${relStyle}`}>
                    {relLabel}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 break-all flex-1">
                    {c.h} {relLabel} {c.t}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {chains.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-900 dark:text-slate-200 mb-2">
            Why it was {chains.length === 1 ? 'blocked' : 'blocked'}
          </div>
          {chains.map((ch, i) => (
            <div key={i} className="bg-slate-100 dark:bg-slate-800/60 border border-slate-400 dark:border-slate-600 rounded-none p-3 mb-2 last:mb-0">
              <div className="text-[11px] font-mono text-slate-800 dark:text-slate-200 mb-2">
                {ch.description}
              </div>
              <div className="space-y-1 mb-2">
                {ch.path.map((p, j) => (
                  <div key={j} className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-400 font-bold">{j + 1}.</span>
                    <span className="text-slate-700 dark:text-slate-300 break-all">
                      {p.h} <span className="text-blue-700 dark:text-blue-300">{p.r === 'conflicts_with' ? 'conflicts with' : p.r}</span> {p.t}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] font-mono text-slate-600 dark:text-slate-400 border-t border-slate-300 dark:border-slate-700 pt-2 grid grid-cols-3 gap-2">
                <div>
                  <div className="font-bold uppercase tracking-widest text-slate-500 mb-0.5">Before</div>
                  <div className="text-slate-700 dark:text-slate-300">{ch.hoare_triple.precondition}</div>
                </div>
                <div>
                  <div className="font-bold uppercase tracking-widest text-slate-500 mb-0.5">Action</div>
                  <div className="text-slate-900 dark:text-slate-100 font-bold">{ch.hoare_triple.action}</div>
                </div>
                <div>
                  <div className="font-bold uppercase tracking-widest text-slate-500 mb-0.5">Result</div>
                  <div className="text-slate-700 dark:text-slate-300">{ch.hoare_triple.postcondition}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {mapped_entities.length === 0 && (
        <div className="text-[11px] italic text-slate-400">
          No matching entities — nothing to evaluate.
        </div>
      )}
      {mapped_entities.length > 0 && direct_constraints.length === 0 && (
        <div className="text-[11px] italic text-slate-500">
          No rules apply to this statement.
        </div>
      )}
    </div>
  );
}
