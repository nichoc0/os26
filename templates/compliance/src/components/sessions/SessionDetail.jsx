// Vault session detail — metadata + turn-by-turn transcript with inline
// per-message Groundedness + Authorization checks.
//
// Reviewer feedback (Luyun): "Move the groundedness check and authorization
// check to the per-message specific from the LLM, don't let the end user
// custom input things — wrong UX, and you don't want people typing
// arbitrary input into something that's public-facing." So the old text-area
// "paste a claim and run it" panels at the bottom are gone; instead each
// assistant turn now carries its own readonly verdict chip computed from
// the same local rules (computeLocalGroundedness / computeLocalAuthorization)
// the panels used.

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, User, Robot, ChatsTeardrop, CaretDown, CaretRight, CheckCircle, Warning, XCircle, Question, Lock } from '@phosphor-icons/react';
import { useSessionStore } from '../../store/sessionStore';
import { computeLocalGroundedness } from './GroundednessPanel';
import { computeLocalAuthorization } from './AuthorizationPanel';

// Monochrome blue-family scheme. Severity = fill weight, not different hues.
const RISK_TONE = {
  low:          { label: 'Grounded', cls: 'border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-900/10',                          Icon: CheckCircle },
  medium:       { label: 'Review',   cls: 'border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/30',                         Icon: Warning },
  high:         { label: 'Fail',     cls: 'border-slate-700 dark:border-blue-200 bg-slate-900 dark:bg-blue-200 text-white dark:text-blue-950',                                Icon: XCircle },
  inconclusive: { label: 'Unclear',  cls: 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400',                                                        Icon: Question },
};

// Engine emits: 'ok' | 'violation' | 'inconclusive'.
// (Earlier UI map keyed on 'authorized' / 'unauthorized' which never matched
// the engine output, so EVERY verdict fell through to inconclusive — that's
// the "all-UNCLEAR" bug from docs/08 #3. Aliases preserved so any older
// fixture data using 'authorized' / 'unauthorized' / 'conditional' still
// renders.)
const AUTH_TONE = {
  ok:            { label: 'Authorized',   cls: 'border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-900/10',                       Icon: CheckCircle },
  violation:     { label: 'Denied',       cls: 'border-slate-700 dark:border-blue-200 bg-slate-900 dark:bg-blue-200 text-white dark:text-blue-950',                             Icon: Lock },
  inconclusive:  { label: 'Unclear',      cls: 'border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400',                                                     Icon: Question },
  // Back-compat aliases for any caller still using the old key set
  authorized:    { label: 'Authorized',   cls: 'border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-900/10',                       Icon: CheckCircle },
  unauthorized:  { label: 'Denied',       cls: 'border-slate-700 dark:border-blue-200 bg-slate-900 dark:bg-blue-200 text-white dark:text-blue-950',                             Icon: Lock },
  conditional:   { label: 'Conditional',  cls: 'border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/30',                      Icon: Warning },
};

function VerdictChip({ tone }) {
  if (!tone) return null;
  const { Icon, label, cls } = tone;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest border rounded-none whitespace-nowrap ${cls}`}>
      <Icon size={10} weight="bold" />
      {label}
    </span>
  );
}

function pctOrDash(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  return `${Math.round(v * 100)}%`;
}

// Risk-score display: categorical level only. No raw number — the rho
// values blow up unboundedly (744 on fluff, 344 on hallucinations) and
// no buyer reads "344.89" as anything more than confusing. Render
// 'N/A' / 'LOW' / 'MED' / 'HIGH' and let the hint line carry the why.
const RISK_LEVEL_LABEL = { low: 'LOW', medium: 'MED', high: 'HIGH', inconclusive: 'N/A' };
function renderRiskValue(grounded) {
  if (!grounded || grounded.has_factual_claim === false || grounded.risk === 'inconclusive') return 'N/A';
  return RISK_LEVEL_LABEL[grounded.risk] || 'N/A';
}
function renderRiskHint(grounded) {
  if (!grounded) return null;
  if (grounded.has_factual_claim === false) return 'no factual claims to evaluate';
  if (typeof grounded.global_p_kg === 'number' && grounded.global_p_kg < 0.01) return 'unsupported by knowledge base';
  if (grounded.risk === 'high') return 'claim diverges from KB';
  if (grounded.risk === 'medium') return 'claim partially supported by KB';
  if (grounded.risk === 'low') return 'claim well-supported by KB';
  return null;
}

// Defensive renderers — the local compute functions return both shapes:
// per_claim entries are { text, claim: { subject, predicate, object, text } },
// while atomic_claims entries are flat { id, text, subject, predicate, object }.
// Hand React a string in every branch, never an object.
//
// Order of preference: actual sentence text wins over the
// subject-predicate-object decomposition. The decomposition's defaults
// ('agent' / 'asserts' / 'claim') are what produced the literal
// "agent asserts claim" placeholder (docs/08 bug #2).
function renderClaim(c) {
  if (!c) return '(claim)';
  if (typeof c === 'string') return c;
  // 1. top-level text (per_claim now carries this)
  if (typeof c.text === 'string' && c.text.trim()) return c.text;
  // 2. text inside the inner claim object
  if (c.claim && typeof c.claim === 'object' && typeof c.claim.text === 'string' && c.claim.text.trim()) {
    return c.claim.text;
  }
  // 3. subject/predicate/object — only if at least one of them looks meaningful
  //    (i.e. NOT the inferred-default {agent, asserts/is, claim} triple).
  const inner = c.claim || {};
  const isDefaultTriple = (s, p, o) =>
    (s === 'agent' || !s) && (p === 'asserts' || p === 'is' || !p) && (o === 'claim' || !o);
  if (!isDefaultTriple(inner.subject, inner.predicate, inner.object)) {
    const parts = [inner.subject, inner.predicate, inner.object].filter((p) => typeof p === 'string' && p.trim());
    if (parts.length) return parts.join(' ');
  }
  if (!isDefaultTriple(c.subject, c.predicate, c.object)
      && [c.subject, c.predicate, c.object].some((p) => typeof p === 'string')) {
    return [c.subject, c.predicate, c.object].filter(Boolean).join(' ');
  }
  return '(claim text unavailable)';
}
function renderAtomic(c) {
  if (!c) return '(claim)';
  if (typeof c === 'string') return c;
  if (typeof c.text === 'string' && c.text.trim()) return c.text;
  return renderClaim(c);
}

function TurnChecks({ turn, priorTurns, kgTriples }) {
  const [expanded, setExpanded] = useState(false);

  // The agent's reply lives in the SAME turn as the user request that
  // triggered it. Without the current turn's user_text in context, the
  // detectors see the reply in isolation and flag legitimate user-initiated
  // actions ("Transfer of $50…" responding to "Can you move $50…") as
  // unverified. Pass current-turn user_text alongside priorTurns so the
  // detectors have the full conversation context the agent had.
  const contextTurns = useMemo(
    () => [...(priorTurns || []), { user_text: turn.user_text || turn.user || '' }],
    [priorTurns, turn.user_text, turn.user],
  );

  const grounded = useMemo(() => {
    const text = (turn.assistant_response || '').trim();
    if (!text) return null;
    try {
      return computeLocalGroundedness(text, kgTriples || [], { priorTurns: contextTurns, scope: 'demo', context: 'customer_inbound_call' });
    } catch { return null; }
  }, [turn.assistant_response, contextTurns, kgTriples]);

  const auth = useMemo(() => {
    const text = (turn.assistant_response || '').trim();
    if (!text) return null;
    try {
      return computeLocalAuthorization(text, 'customer_inbound_call', kgTriples || [], { priorTurns: contextTurns, scope: 'demo' });
    } catch { return null; }
  }, [turn.assistant_response, contextTurns, kgTriples]);

  const groundedTone = grounded ? RISK_TONE[grounded.risk] || RISK_TONE.inconclusive : null;
  const authVerdict = auth?.global_verdict || 'inconclusive';
  const authTone = AUTH_TONE[authVerdict] || AUTH_TONE.inconclusive;

  if (!grounded && !auth) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {grounded && <VerdictChip tone={groundedTone} />}
        {auth && <VerdictChip tone={authTone} />}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-transparent border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 cursor-pointer transition-colors rounded-none"
        >
          {expanded ? <CaretDown size={10} weight="bold" /> : <CaretRight size={10} weight="bold" />}
          {expanded ? 'Hide' : 'Why'}
        </button>
      </div>

      {expanded && (
        <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 px-3 py-2.5 space-y-3">
          {grounded && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                Groundedness — does this match the knowledge base?
              </div>
              <div className="grid grid-cols-3 gap-3 mb-2">
                {/* Risk score display rules:
                    1. No factual claim or inconclusive → "N/A · no factual claims"
                       (covers the "you're welcome" 744.75 case).
                    2. Factual claim BUT zero KB support → don't render the raw
                       rho number (it's mathematically valid but reads as
                       gibberish — 344.89, 700+ etc). Show the categorical
                       level instead: "HIGH · unsupported by KB".
                    3. Otherwise → categorical pill + capped numeric (≤9.99).
                    The categorical level always leads; the raw number is
                    secondary and only shown when it's in a readable range. */}
                <Stat
                  label="Risk score"
                  value={renderRiskValue(grounded)}
                  hint={renderRiskHint(grounded)}
                />
                <Stat
                  label="Knowledge match"
                  value={
                    grounded.has_factual_claim === false
                      ? 'N/A'
                      : pctOrDash(grounded.global_p_kg)
                  }
                  hint={
                    grounded.has_factual_claim === false
                      ? 'no factual claims to evaluate'
                      : (typeof grounded.global_p_kg === 'number' && grounded.global_p_kg < 0.01)
                        ? 'no KB facts support this claim'
                        : null
                  }
                />
                <Stat label="Claims" value={(grounded.per_claim || []).length || '—'} />
              </div>
              {Array.isArray(grounded.per_claim) && grounded.per_claim.length > 0 && (
                <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                  {grounded.per_claim.slice(0, 3).map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-mono text-slate-400 dark:text-slate-600 mt-0.5 shrink-0">{i + 1}.</span>
                      <span className="leading-snug">{renderClaim(c)}</span>
                    </li>
                  ))}
                  {grounded.per_claim.length > 3 && (
                    <li className="text-[10px] text-slate-400 dark:text-slate-600 pl-4">
                      …+{grounded.per_claim.length - 3} more
                    </li>
                  )}
                </ul>
              )}
              {Array.isArray(grounded.policy_flags) && grounded.policy_flags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {grounded.policy_flags.slice(0, 4).map((f, i) => (
                    <span key={i} className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-none">
                      {String(f.code || f.label || f.id || 'flag')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {auth && (
            <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                Authorization — was the agent permitted to say this?
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-snug mb-1">
                Verdict: <strong>{authTone.label}</strong>
                {Array.isArray(auth.notes) && auth.notes.length > 0 ? ` · ${auth.notes[0]}` : ''}
              </p>
              {Array.isArray(auth.atomic_claims) && auth.atomic_claims.length > 0 && (
                <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                  {auth.atomic_claims.slice(0, 3).map((c, i) => (
                    <li key={i} className="font-mono text-[10px] truncate">→ {renderAtomic(c)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1.5">
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">{label}</div>
      <div className={`font-mono text-sm font-bold ${value === 'N/A' || value === '—' ? 'text-slate-400 dark:text-slate-600' : 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </div>
      {hint && (
        <div className="text-[9px] text-slate-400 dark:text-slate-600 mt-0.5 leading-tight">{hint}</div>
      )}
    </div>
  );
}

export default function SessionDetail() {
  const detail = useSessionStore((s) => s.selectedSessionDetail);
  const loading = useSessionStore((s) => s.sessionDetailLoading);
  const error = useSessionStore((s) => s.sessionDetailError);
  const clearSession = useSessionStore((s) => s.clearSession);
  const kgTriples = useSessionStore((s) => s.kgTriples);
  const fetchKg = useSessionStore((s) => s.fetchKg);

  // The per-turn checks need the KG; pull it once on mount in case the
  // user landed straight on the Vault detail without visiting the Knowledge
  // Graph first.
  useEffect(() => {
    if (!kgTriples || kgTriples.length === 0) fetchKg();
  }, [kgTriples, fetchKg]);

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Loading session detail…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8 text-center text-sm text-red-500">
        Failed to load session: {error}
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        No session selected.
      </div>
    );
  }

  const turns = Array.isArray(detail.turns) ? detail.turns : [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={clearSession}
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} weight="bold" />
            Back to Vault
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none p-6 md:p-8">
          <div className="flex items-center gap-5">
            <div className="flex shrink-0 items-center justify-center h-14 w-14 rounded-none bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
              <ChatsTeardrop size={22} weight="bold" className="text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                {detail.session_id}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                {detail.call_sid} · {detail.agent}
                {detail.caller_phone ? ` · ${detail.caller_phone}` : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 mt-6">
            <Field label="Turns" value={turns.length} />
            <Field label="Started" value={detail.started_at} small />
            <Field label="Ended" value={detail.ended_at} small />
            <Field label="Ingested" value={detail.ingested_at} small />
          </div>
        </div>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none">
          <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                Transcript
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Each agent reply is checked against the knowledge base (groundedness) and the policy graph (authorization). Click <strong className="text-slate-700 dark:text-slate-300">Why</strong> on a turn for the breakdown.
              </p>
            </div>
            <span className="text-[10px] font-mono text-slate-400 shrink-0">
              {turns.length} turn{turns.length === 1 ? '' : 's'}
            </span>
          </header>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {turns.length === 0 ? (
              <div className="p-6 text-sm text-slate-400 italic">No transcript turns recorded.</div>
            ) : (
              turns.map((turn, idx) => (
                <div key={idx} className="p-6 space-y-3">
                  <TurnLine role="user" icon={<User size={14} weight="bold" />} text={turn.user_text} />
                  <div>
                    <TurnLine role="assistant" icon={<Robot size={14} weight="bold" />} text={turn.assistant_response} />
                    <div className="ml-9">
                      <TurnChecks
                        turn={turn}
                        priorTurns={turns.slice(0, idx)}
                        kgTriples={kgTriples || []}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, small }) {
  return (
    <div className="text-center py-4 px-3">
      <div className={`font-mono ${small ? 'text-[11px]' : 'text-xl'} font-bold text-slate-900 dark:text-slate-100`}>
        {value ?? '—'}
      </div>
      <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">
        {label}
      </div>
    </div>
  );
}

function TurnLine({ role, icon, text }) {
  const roleColor =
    role === 'user'
      ? 'text-slate-600 dark:text-slate-400'
      : 'text-blue-600 dark:text-blue-400';
  return (
    <div className="flex gap-3">
      <div
        className={`shrink-0 mt-0.5 h-6 w-6 flex items-center justify-center border border-slate-200 dark:border-slate-800 rounded-none ${roleColor}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-[10px] font-bold uppercase tracking-widest ${roleColor}`}>
          {role === 'user' ? 'Guest' : 'Agent'}
        </div>
        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap mt-1">
          {text || <span className="text-slate-400 italic">(empty)</span>}
        </p>
      </div>
    </div>
  );
}
