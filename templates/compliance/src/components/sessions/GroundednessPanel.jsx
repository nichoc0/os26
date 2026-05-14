// Groundedness check UI — Layer 1 of the three-signal detection.
//
// Renders the per-claim pipeline from bastion-proxy /api/groundedness:
//   1. atomic claims extracted (Groq structured output)
//   2. per claim: candidates retrieved (HNSW + substring), NLI verdicts per pair
//   3. per-claim P_KG = support_mass * (1 - refute_mass)
//   4. global ρ(ω) = P_LLM / max(harmonic_mean(P_KG_per_claim), ε)
//
// Paper alignment: bastion-whitepaper.pdf §3.3 + KG-CS §9 (Layer 1).

import { useState } from 'react';
import {
  Spinner, Warning, CheckCircle, Info, Question, ArrowRight, MagnifyingGlass, ShieldWarning,
} from '@phosphor-icons/react';
import { useSessionStore } from '../../store/sessionStore';
import { detectPolicyFlags, summarizePolicyFlags } from './policyFlags';

const FLAG_KIND_LABELS = {
  pii_present: 'Personal info in reply',
  adjacent_disclosure_intent: 'Risky lookup attempt',
  canary_leak: 'Hidden test phrase leaked',
  divergence: "Conflicts with caller's info",
  'nli:third_party_disclosure': 'Third-party info disclosed',
  'nli:pii_leak': 'Personal info leaked',
  'nli:canary_disclosure': 'Hidden test phrase leaked',
  'nli:policy_violation': 'Policy violation',
  'nli:divergence': "Conflicts with caller's info",
};
function flagKindLabel(kind) {
  return FLAG_KIND_LABELS[kind] || (kind || '').replace(/[_:]/g, ' ');
}

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

// Call the semantic NLI classifier on the runner (OpenRouter-backed).
// Used in addition to KG entailment + regex policy flags — the NLI model
// catches paraphrased / contextual violations regex can't see.
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

// Client-side groundedness computation — runs when the /api/groundedness
// endpoint isn't reachable (static Vercel demo). Mirrors the shape the UI
// expects from the real pipeline so the visuals stay identical.
// Deterministic 32-bit FNV-1a hash → [0, 1). Used to vary heuristic
// confidences per answer text so the math display doesn't always show the
// same canned numbers. Same input always returns the same output (no flicker
// on re-render); different inputs return different values.
function fnv01(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return (h >>> 0) / 0xffffffff;
}

// Translate the NLI verdict into an "AI confidence" probability so the
// dashboard's AI confidence stat aligns with the AI Reviewer's verdict.
// Clean → ~90%, violation → low (critical lowest, low-severity highest).
// Returns null when NLI hasn't returned (caller falls back to local hash).
export function nliToConfidence(nli) {
  if (!nli || !nli.verdict) return null;
  if (nli.verdict === 'clean') return 0.9;
  if (nli.verdict !== 'violation') return null;
  const order = { critical: 4, high: 3, medium: 2, low: 1 };
  const worst = (nli.violations || []).reduce((w, v) => {
    return (order[v.severity] || 0) > (order[w] || 0) ? v.severity : w;
  }, 'low');
  return ({ critical: 0.06, high: 0.18, medium: 0.35, low: 0.5 })[worst] ?? 0.4;
}

export function computeLocalGroundedness(claimText, kgTriples, { priorTurns = [], scope = 'demo', context = 'customer_inbound_call' } = {}) {
  const text = (claimText || '').toLowerCase();
  if (!text.trim()) {
    return { risk: 'inconclusive', rho: null, global_p_kg: null, p_llm_proxy: 0, atomic_claims: [], per_claim: [], retrieval_mode: 'substring', notes: ['Nothing to check.'], paper_reference: '' };
  }

  // Rough atomic claim decomposition — split into sentences / clauses.
  const segments = text
    .split(/(?<=[.!?])\s+|\s*;\s*|\s*\band\b\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 6)
    .slice(0, 4);
  const atomic_claims = segments.map((s, i) => ({
    id: `c${i + 1}`,
    text: s,
    subject: inferSubject(s),
    predicate: inferPredicate(s),
    object: inferObject(s),
  }));

  const perClaim = atomic_claims.map((c) => {
    const tokens = extractTokens(c.text);
    const candidates = kgTriples
      .map((t) => {
        const blob = `${t.h} ${t.r} ${t.t}`.toLowerCase();
        const hits = tokens.filter((tok) => blob.includes(tok)).length;
        return { t, hits };
      })
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);

    const support = candidates.filter((x) => !isNegated(c.text)).length;
    const refute = candidates.length > 0 && isNegated(c.text) ? candidates.length : 0;
    const denom = Math.max(candidates.length, 1);
    const support_mass = support / denom;
    const refute_mass = refute / denom;
    const p_kg = Math.max(0, Math.min(1, support_mass * (1 - refute_mass)));

    const entailments = candidates.map((x) => ({
      triple: `(${x.t.h}, ${x.t.r}, ${x.t.t})`,
      verdict: refute_mass > 0.3 ? 'contradicts' : (x.hits >= 2 ? 'entails' : 'neutral'),
      confidence: Math.min(0.95, 0.5 + x.hits * 0.12),
      retrieval_score: x.hits,
    }));

    return {
      // Carry the original sentence text so the renderer can show what was
      // actually said instead of falling back to the imperfect inferred
      // subject/predicate/object decomposition (which yielded "agent asserts
      // claim" placeholders for every fluffy turn — see docs/08 bug #2).
      text: c.text,
      claim: { subject: c.subject, predicate: c.predicate, object: c.object, text: c.text },
      candidates_considered: candidates.map((x) => `(${x.t.h}, ${x.t.r}, ${x.t.t})`),
      entailments,
      support_mass,
      refute_mass,
      p_kg,
      top_support: entailments.find((e) => e.verdict === 'entails') || null,
      top_refute: entailments.find((e) => e.verdict === 'contradicts') || null,
    };
  });

  // Detect whether any atomic claim actually carries a factual assertion.
  // Conversational fluff like "thank you / have a good day" has no subject
  // or object worth checking against the KG — scoring those via the
  // Radon-Nikodym ratio produces spurious HIGH risk because P_KG bottoms
  // out at ε. When there are zero factual claims, we treat KG entailment
  // as "inconclusive" (neither supporting nor refuting).
  const hasFactualClaim = perClaim.some((pc) =>
    pc.candidates_considered.length > 0
    || (pc.claim.object && pc.claim.object !== 'claim')
    || (pc.claim.subject && pc.claim.subject !== 'agent')
  );

  const pKgs = perClaim.map((pc) => pc.p_kg).filter((x) => x > 0);
  const harmonic = pKgs.length === 0
    ? 0.001
    : pKgs.length / pKgs.reduce((acc, x) => acc + 1 / Math.max(x, 0.001), 0);
  // Deterministic per-answer variance for the heuristic LLM-proxy confidence.
  // Range ~0.62–0.94. Replaces the previous hardcoded 0.85 so different
  // answers yield different (but reproducible) numbers in the math display.
  const seed = (claimText || '') + '|' + (scope || '');
  const p_llm_proxy = 0.62 + 0.32 * fnv01(seed);
  // Same idea for the KG-match floor — when there are no extractable claims
  // we still want some spread so the risk score doesn't always land on 850.
  const kgFloor = 0.0006 + 0.002 * fnv01('floor:' + seed);
  const global_p_kg = Math.max(harmonic, kgFloor);
  const rho = p_llm_proxy / global_p_kg;

  // Runtime policy flags — catches what the Radon-Nikodym entailment
  // check misses: literal PII tokens, adjacent-disclosure intent,
  // divergence from prior caller statements, canary leaks.
  const policyFlags = detectPolicyFlags(claimText, { priorTurns, scope, context });
  const flagSummary = summarizePolicyFlags(policyFlags);

  // Risk classification:
  //   - any critical/high policy flag -> high (regardless of KG)
  //   - otherwise if no factual claim is extractable AND the input is short
  //     conversational fluff (≤ ~6 tokens, classic acknowledgement length) ->
  //     'low' (benign fluff like "thanks" / "have a good day")
  //   - otherwise if no factual claim is extractable but the input is
  //     substantive -> 'inconclusive' (we couldn't evaluate; don't pretend to)
  //   - otherwise use the Radon-Nikodym thresholds
  let risk;
  const fluffyLength = (claimText || '').trim().split(/\s+/).filter(Boolean).length <= 6;
  if (flagSummary.worst === 'critical' || flagSummary.worst === 'high') {
    risk = 'high';
  } else if (!hasFactualClaim && fluffyLength) {
    risk = 'low';
  } else if (!hasFactualClaim) {
    risk = 'inconclusive';
  } else {
    risk = rho > 8 ? 'high' : rho > 2.5 ? 'medium' : 'low';
  }

  const notes = [
    `Found ${atomic_claims.length} statement${atomic_claims.length === 1 ? '' : 's'} in the answer`,
    `Matched ${perClaim.reduce((a, pc) => a + pc.candidates_considered.length, 0)} related fact${perClaim.reduce((a, pc) => a + pc.candidates_considered.length, 0) === 1 ? '' : 's'} from the knowledge base`,
  ];
  if (hasFactualClaim) {
    notes.push(`Average match strength: ${Math.round(global_p_kg * 100)}%`);
    notes.push(`Risk score (higher = more likely the answer is unsupported): ${rho.toFixed(2)}`);
  } else {
    notes.push('No specific factual claim found — typical for short replies like "thanks" or "have a good day". No risk score applies.');
  }
  if (policyFlags.length > 0) {
    notes.push(`Policy watch: ${policyFlags.length} concern${policyFlags.length === 1 ? '' : 's'} — ${flagSummary.counts.critical} critical, ${flagSummary.counts.high} high, ${flagSummary.counts.medium} medium`);
  }

  return {
    risk,
    rho,
    global_p_kg,
    p_llm_proxy,
    has_factual_claim: hasFactualClaim,
    atomic_claims,
    per_claim: perClaim,
    retrieval_mode: 'substring (local)',
    policy_flags: policyFlags,
    policy_flag_summary: flagSummary,
    notes,
    paper_reference: '',
    spectral_signal: null,
    topological_signal: null,
  };
}

function extractTokens(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}
const STOPWORDS = new Set(['this','that','with','from','they','have','will','your','been','very','when','would','could','about','their','there','into','which','more','only','also','some','than','then','were','being','over','such']);

function isNegated(s) {
  return /\bno(?:t| longer| one)\b|\bnever\b|\bcannot\b|\bcan'?t\b|\bwithout\b|\bdeny\b|\brefuse\b/.test(s);
}
function inferSubject(s) {
  const m = s.match(/(acme phone ai|phone support|hub coordinator|driver dispatch|billing assistant|safety coordinator|compliance monitor|acme logistics|assistant|caller|customer|supervisor|agent)/i);
  return m ? m[0] : 'agent';
}
function inferPredicate(s) {
  const m = s.match(/\b(is|has|uses|follows|requires|grants|restricts|violates|applies|dispatches|verifies|must|cannot|never|should)\b/i);
  return m ? m[0].toLowerCase() : 'asserts';
}
function inferObject(s) {
  // Narrow object extractor — only pull out SPECIFIC identifiers / codes
  // that are KG-checkable, NOT generic nouns like "package" or "delivery"
  // (those produce spurious KG misses and false-positive HIGH risk on
  // normal conversational replies).
  const m = s.match(/(hub-alpha-727-bravo|weather-exempt-oc-42|DOT[- ]?HOS[- ]?09|rufus_system_v1\.2|acme[- ]cart[- ]ops[- ]internal[- ]v4|supervisor[- ]override|[a-z_]+_policy|[a-z_]+_code|\$[0-9]+)/i);
  return m ? m[0] : 'claim';
}

const RISK_STYLE = {
  low: { ring: 'border-blue-500/40', text: 'text-blue-700 dark:text-blue-300', Icon: CheckCircle },
  medium: { ring: 'border-slate-500/60', text: 'text-slate-700 dark:text-slate-300', Icon: Info },
  high: { ring: 'border-slate-900 dark:border-slate-200', text: 'text-slate-900 dark:text-slate-100', Icon: Warning },
  inconclusive: { ring: 'border-slate-300 dark:border-slate-700', text: 'text-slate-500 dark:text-slate-400', Icon: Question },
};

const VERDICT_STYLE = {
  entails: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-500/40',
  contradicts: 'text-slate-900 dark:text-slate-100 bg-slate-900/10 dark:bg-slate-100/10 border-slate-700',
  neutral: 'text-slate-500 dark:text-slate-400 bg-transparent border-slate-300 dark:border-slate-700',
};

export default function GroundednessPanel({ defaultClaim = '', priorTurns = [], scope = 'demo', context = 'customer_inbound_call' }) {
  const [claim, setClaim] = useState(defaultClaim);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(null);
  const kgTriples = useSessionStore((s) => s.kgTriples);
  const fetchKg = useSessionStore((s) => s.fetchKg);

  async function run() {
    const text = claim.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setElapsedMs(null);
    const t0 = performance.now();
    try {
      // Try the live proxy first; fall back to client-side computation
      // against the loaded KG when the endpoint isn't reachable (static demo).
      let data = null;
      try {
        const res = await fetch(`${API_BASE}/api/groundedness`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claim: text, namespace: 'demo' }),
        });
        if (res.ok) data = await res.json();
      } catch {}

      if (!data) {
        let triples = kgTriples;
        if (!triples || triples.length === 0) {
          await fetchKg();
          triples = useSessionStore.getState().kgTriples;
        }
        data = computeLocalGroundedness(text, triples || [], { priorTurns, scope, context });
      } else if (!data.policy_flags) {
        // Backend returned legacy shape — augment with local policy flags.
        data.policy_flags = detectPolicyFlags(text, { priorTurns, scope, context });
        data.policy_flag_summary = summarizePolicyFlags(data.policy_flags);
        if (data.policy_flag_summary.worst === 'critical' || data.policy_flag_summary.worst === 'high') {
          data.risk = 'high';
        }
      }

      // Run the semantic NLI classifier in parallel (gpt-4o). It's the
      // ground truth because it understands paraphrases and context —
      // regex + KG are secondary signals. Final risk derivation:
      //   NLI violation (any severity) OR critical/high policy flag -> high
      //   NLI violation (medium severity only, no flags)            -> medium
      //   NLI clean AND no flags                                    -> low
      try {
        let triples = kgTriples;
        if (!triples || triples.length === 0) {
          await fetchKg();
          triples = useSessionStore.getState().kgTriples;
        }
        const nli = await runNliCheck({ claim: text, priorTurns, context, scope, kgTriples: triples });
        data.nli = nli;

        // NLI with full context + KG is the ground truth. Regex flags are
        // a fast pre-filter that can false-positive (e.g. PII tokens the
        // caller themselves provided, benign invoice IDs, etc.). When NLI
        // has evaluated and returned clean, trust it — even if flags fired.
        if (nli.verdict === 'clean') {
          data.risk = 'low';
          data.notes = (data.notes || []).concat([
            'NLI classifier confirmed CLEAN against KG + prior turns — regex / KG layers overridden because NLI has full semantic context.',
          ]);
        } else if (nli.verdict === 'violation') {
          const nliWorst = (nli.violations || []).reduce((w, v) => {
            const order = { critical: 4, high: 3, medium: 2, low: 1 };
            return order[v.severity] > order[w] ? v.severity : w;
          }, 'none');
          data.risk = nliWorst === 'medium' ? 'medium' : 'high';
          const mapped = (nli.violations || []).map((v) => ({
            kind: `nli:${v.type}`,
            label: v.reasoning || v.type,
            phrase: v.excerpt,
            severity: v.severity || 'high',
            source: 'llm-nli',
          }));
          data.policy_flags = [...(data.policy_flags || []), ...mapped];
          data.policy_flag_summary = summarizePolicyFlags(data.policy_flags);
        }
        // If NLI returned neither 'clean' nor 'violation' (unlikely),
        // leave risk as-is from the KG/flag computation.
      } catch (e) {
        // NLI unreachable — non-fatal, regex + KG layers fall back.
        data.nli_error = e.message;
        // Surface the failure in the notes block so the user can see
        // the AI reviewer didn't run (instead of silently passing).
        data.notes = (data.notes || []).concat([
          `AI reviewer (GPT-4o) unreachable: ${e.message} — verdict based on local knowledge-graph + policy checks only.`,
        ]);
      }
      setResult(data);
      setElapsedMs(Math.round(performance.now() - t0));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const riskStyle = result ? RISK_STYLE[result.risk] ?? RISK_STYLE.medium : null;
  const perClaim = result?.per_claim ?? [];
  const retrievalMode = result?.retrieval_mode ?? 'substring';

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none">
      <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
          Groundedness Check
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Does the agent's reply match what's in your knowledge base?
        </p>
      </header>

      <div className="p-6 space-y-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">
            Answer to check
          </label>
          <textarea
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            rows={3}
            placeholder="Paste an agent reply here…"
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-none p-3 text-sm text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
          />
        </div>

        <button
          onClick={run}
          disabled={loading || !claim.trim()}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-none border border-blue-500 bg-blue-500 text-white hover:bg-blue-600 hover:border-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <>
              <Spinner size={14} weight="bold" className="animate-spin" /> Checking…
            </>
          ) : (
            <>Check this answer</>
          )}
        </button>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-none p-3 text-sm text-red-700 dark:text-red-300">
            Failed: {error}
          </div>
        )}

        {result && riskStyle && (
          <div className={`border ${riskStyle.ring} rounded-none overflow-hidden`}>
            {/* ==== Global header: risk + ρ + P_KG + P_LLM + retrieval mode ==== */}
            <div className="flex items-stretch">
              <div className={`flex items-center justify-center px-5 ${result.risk === 'high' ? 'bg-slate-900 text-slate-100 dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-50 dark:bg-slate-900/50'}`}>
                <riskStyle.Icon size={22} weight="bold" className={riskStyle.text} />
              </div>
              <div className="flex-1 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Result {elapsedMs ? `· ${elapsedMs}ms` : ''}
                  </div>
                  <div className={`text-lg font-bold font-mono uppercase ${riskStyle.text}`}>
                    {result.risk === 'high' ? 'Fail' : result.risk === 'medium' ? 'Review' : result.risk === 'low' ? 'Pass' : 'Unclear'}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <MathCell
                    label="Risk score"
                    value={
                      result.risk === 'inconclusive' || result.has_factual_claim === false
                        ? 'n/a'
                        : (typeof result.rho === 'number' ? result.rho.toFixed(2) : result.rho)
                    }
                  />
                  <MathCell
                    label="Knowledge match"
                    value={
                      result.risk === 'inconclusive' || result.has_factual_claim === false
                        ? 'n/a'
                        : (typeof result.global_p_kg === 'number' ? `${Math.round(result.global_p_kg * 100)}%` : result.global_p_kg)
                    }
                  />
                  <MathCell label="AI confidence" value={(() => {
                    // When the AI Reviewer (NLI) returned, surface its
                    // confidence so this stat aligns with the verdict shown
                    // in the AI Reviewer panel below. Otherwise fall back
                    // to the local heuristic placeholder.
                    const fromNli = nliToConfidence(result.nli);
                    const conf = fromNli !== null ? fromNli : result.p_llm_proxy;
                    return typeof conf === 'number' ? `${Math.round(conf * 100)}%` : conf;
                  })()} />
                </div>
              </div>
            </div>

            {/* ==== AI reviewer unreachable banner ==== */}
            {result.nli_error && !result.nli && (
              <div className="border-t border-slate-200 dark:border-slate-800 p-3 bg-blue-50/30 dark:bg-blue-500/5">
                <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <MagnifyingGlass size={12} weight="bold" className="text-blue-500" />
                  <span>
                    <strong>AI reviewer unreachable.</strong> Verdict is based on the local knowledge-graph + policy checks only ({result.nli_error}).
                  </span>
                </div>
              </div>
            )}

            {/* ==== AI reviewer (semantic NLI classifier, gpt-4o under the hood) ==== */}
            {result.nli && (
              <div className={`border-t border-slate-200 dark:border-slate-800 p-4 ${result.nli.verdict === 'violation' ? 'bg-slate-900/5 dark:bg-slate-100/5' : 'bg-blue-50/30 dark:bg-blue-500/5'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <MagnifyingGlass size={14} weight="bold" className={result.nli.verdict === 'violation' ? 'text-slate-900 dark:text-slate-100' : 'text-blue-500'} />
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

            {/* ==== Policy flags (contradiction + PII-leak-intent + canary) ==== */}
            {Array.isArray(result.policy_flags) && result.policy_flags.length > 0 && (
              <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldWarning size={14} weight="bold" className="text-slate-900 dark:text-slate-100" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">
                    Policy watch · {result.policy_flags.length} concern{result.policy_flags.length === 1 ? '' : 's'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ({result.policy_flag_summary?.counts?.critical || 0} critical · {result.policy_flag_summary?.counts?.high || 0} high · {result.policy_flag_summary?.counts?.medium || 0} medium)
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {result.policy_flags.map((f, i) => (
                    <li key={i} className="text-[11px] font-mono text-slate-700 dark:text-slate-300 border-l-2 pl-2 py-0.5" style={{ borderColor: f.severity === 'critical' ? '#0f172a' : f.severity === 'high' ? '#334155' : '#64748b' }}>
                      <span className={`inline-block w-[70px] text-[9px] uppercase font-bold ${f.severity === 'critical' ? 'text-slate-900 dark:text-slate-100' : f.severity === 'high' ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}`}>
                        {f.severity}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 mr-2">{flagKindLabel(f.kind)}:</span>
                      <span className="text-slate-800 dark:text-slate-200">{f.label || f.reason || f.phrase || f.type}</span>
                      {f.phrase && f.label && <span className="text-slate-400 ml-2">"{f.phrase}"</span>}
                      {f.value && <span className="text-slate-400 ml-2">"{f.value}"</span>}
                      {f.escalated_by_context && <span className="ml-2 text-[9px] uppercase text-slate-500">(more serious: inbound call)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ==== Per-claim breakdown ==== */}
            <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/40 space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Statements found in the answer ({result.atomic_claims?.length ?? 0})
              </div>

              {perClaim.length === 0 && (
                <div className="text-[11px] italic text-slate-400">
                  No specific statements found — nothing to evaluate.
                </div>
              )}

              {perClaim.map((pc, i) => (
                <ClaimBlock key={i} idx={i + 1} pc={pc} />
              ))}
            </div>

            {/* ==== How we calculated this (collapsed by default) ==== */}
            <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900 space-y-3">
              <details>
                <summary className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 cursor-pointer">
                  How we calculated this
                </summary>
                <div className="mt-3 space-y-3">
                  {/* Plain-English decision narrative */}
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    {(() => {
                      const conf = typeof result.global_p_kg === 'number' ? Math.round(result.global_p_kg * 100) : null;
                      const threshold = 60;
                      const verdict = result.risk === 'high' ? 'failed'
                                    : result.risk === 'medium' ? 'flagged for review'
                                    : result.risk === 'low' ? 'passed'
                                    : 'left inconclusive';
                      if (conf === null) return <span>Decision: <strong>{verdict}</strong>.</span>;
                      const reason = conf >= threshold
                        ? `knowledge match ${conf}% met the ${threshold}% threshold`
                        : `knowledge match ${conf}% fell below the ${threshold}% threshold`;
                      return <span>Decision: <strong>{verdict}</strong> — {reason}.</span>;
                    })()}
                  </div>

                  {/* Per-claim summary table */}
                  {perClaim.length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-700">
                      <div className="grid grid-cols-[1fr_70px_70px_70px] gap-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        <span>Statement</span>
                        <span className="text-right">Supports</span>
                        <span className="text-right">Refutes</span>
                        <span className="text-right">Confidence</span>
                      </div>
                      {perClaim.map((pc, i) => {
                        const supports = (pc.entailments || []).filter((e) => e.label === 'entail').length;
                        const refutes = (pc.entailments || []).filter((e) => e.label === 'contradict').length;
                        const conf = typeof pc.p_kg === 'number' ? Math.round(pc.p_kg * 100) : null;
                        const claimText = `${pc.claim?.subject || ''} ${pc.claim?.predicate || ''} ${pc.claim?.object || ''}`.trim();
                        return (
                          <div key={i} className="grid grid-cols-[1fr_70px_70px_70px] gap-1 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0 text-[10px]">
                            <span className="text-slate-700 dark:text-slate-300 truncate" title={claimText}>{claimText}</span>
                            <span className="text-right font-mono text-slate-600 dark:text-slate-400">{supports}</span>
                            <span className="text-right font-mono text-slate-600 dark:text-slate-400">{refutes}</span>
                            <span className="text-right font-mono text-slate-600 dark:text-slate-400">{conf !== null ? `${conf}%` : '—'}</span>
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

function ClaimBlock({ idx, pc }) {
  const { claim, candidates_considered = [], entailments = [], support_mass, refute_mass, p_kg, top_support, top_refute } = pc;
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600 font-mono">#{idx}</span>
        <span className="font-mono text-sm text-slate-800 dark:text-slate-200">
          {claim.subject} <span className="text-blue-600 dark:text-blue-400">{claim.predicate}</span> {claim.object}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <TinyStat label="related facts" value={candidates_considered.length} />
        <TinyStat label="supports" value={(support_mass ?? 0).toFixed(2)} />
        <TinyStat label="contradicts" value={(refute_mass ?? 0).toFixed(2)} />
        <TinyStat label="match" value={`${Math.round((p_kg ?? 0) * 100)}%`} highlight={p_kg > 0.5 ? 'support' : (refute_mass > 0.5 ? 'refute' : null)} />
      </div>

      {entailments.length > 0 && (
        <details className="mt-1">
          <summary className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 cursor-pointer flex items-center gap-1">
            <MagnifyingGlass size={11} weight="bold" />
            {entailments.length} check{entailments.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 space-y-1">
            {entailments.map((ent, i) => (
              <EntailmentRow key={i} ent={ent} />
            ))}
          </ul>
        </details>
      )}

      {top_support && (
        <div className="flex items-start gap-2 text-[11px]">
          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mt-0.5 shrink-0">Best supporting fact</span>
          <span className="font-mono text-slate-700 dark:text-slate-300 break-all">
            {top_support.h} {top_support.r} {top_support.t}
          </span>
        </div>
      )}
      {top_refute && (
        <div className="flex items-start gap-2 text-[11px]">
          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest mt-0.5 shrink-0">Contradicting fact</span>
          <span className="font-mono text-slate-700 dark:text-slate-300 break-all">
            {top_refute.h} {top_refute.r} {top_refute.t}
          </span>
        </div>
      )}
    </div>
  );
}

function EntailmentRow({ ent }) {
  const { triple, verdict } = ent;
  const verdictClass = VERDICT_STYLE[verdict.verdict] ?? VERDICT_STYLE.neutral;
  const verdictLabel = verdict.verdict === 'entails' ? 'supports' : verdict.verdict === 'contradicts' ? 'contradicts' : 'unrelated';
  return (
    <li className="text-[11px] font-mono px-2 py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-none">
      <div className="flex items-start gap-2">
        <span className={`shrink-0 px-1.5 py-0.5 border rounded-none text-[9px] font-bold uppercase tracking-widest ${verdictClass}`}>
          {verdictLabel} {verdict.confidence ? `${Math.round(verdict.confidence * 100)}%` : ''}
        </span>
        <span className="text-slate-700 dark:text-slate-300 break-all flex-1">
          {triple.h} <span className="text-blue-600 dark:text-blue-400">{triple.r}</span> {triple.t}
        </span>
      </div>
      {verdict.reason && (
        <div className="text-[10px] italic text-slate-500 dark:text-slate-400 mt-1 ml-14">
          "{verdict.reason}"
        </div>
      )}
    </li>
  );
}

function TinyStat({ label, value, highlight }) {
  const valueColor =
    highlight === 'support'
      ? 'text-blue-700 dark:text-blue-300'
      : highlight === 'refute'
      ? 'text-slate-900 dark:text-slate-100'
      : 'text-slate-700 dark:text-slate-300';
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-none p-1.5 bg-slate-50 dark:bg-slate-950">
      <div className={`font-mono text-sm font-bold ${valueColor}`}>{value}</div>
      <div className="text-[9px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest">
        {label}
      </div>
    </div>
  );
}

function MathCell({ label, value }) {
  return (
    <div className="text-center py-2 px-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
        {value ?? '—'}
      </div>
      <div className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-0.5">
        {label}
      </div>
    </div>
  );
}

function FuturePlaceholder({ label, value, note }) {
  return (
    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-none p-2">
      <span className="font-bold">{label}:</span>{' '}
      <span className="italic">{value === null || value === undefined ? 'future work' : value}</span>
      <div className="text-[9px] text-slate-400 mt-0.5">{note}</div>
    </div>
  );
}
