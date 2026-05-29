import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, Spinner, Wrench, ShieldWarning, MagnifyingGlass, ArrowRight, Lightbulb, CaretDown, CaretUp } from '@phosphor-icons/react';
import { AgentBadge } from '../ui/AgentBadge';
import { useModeStore, resolveAppliedAction } from '../../store/modeStore';
import { actionIdFor } from '../../data/actionId';
import { useDispositionStore, useDispositionFor, DISPOSITION_DESTINATION } from '../../store/dispositionStore';
import { usePersona } from '../../store/personaStore';

// Inline collapsible-with-preview block. Per Luyun's "way too much happening
// on this page" — every drilldown section gets its own toggle so reviewers
// see what's available at a glance and expand only what they need.
// `preview` is the always-visible one-liner shown in the header (collapsed
// AND open) so the state of the section is readable without expanding.
function CollapsibleBlock({ title, icon, preview, defaultOpen = true, accent, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const tone = accent || { border: 'border-slate-200 dark:border-slate-800', bg: 'bg-slate-50 dark:bg-slate-800/50', text: 'text-slate-500 dark:text-slate-400' };
  return (
    <div className={`bg-white dark:bg-slate-900 border ${tone.border} rounded-none overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full px-4 py-3 border-b ${tone.border} ${tone.bg} flex items-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors text-left bg-transparent border-l-0 border-r-0 border-t-0`}
      >
        {icon}
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 shrink-0">{title}</h3>
        {preview && (
          <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400 truncate flex-1 min-w-0">
            {preview}
          </span>
        )}
        <span className="ml-auto shrink-0">
          {open
            ? <CaretUp size={12} weight="bold" className="text-slate-400 dark:text-slate-500" />
            : <CaretDown size={12} weight="bold" className="text-slate-400 dark:text-slate-500" />}
        </span>
      </button>
      {open && children}
    </div>
  );
}

function ActionBadge({ action }) {
  const styles = {
    pass: 'bg-blue-200 text-blue-900',
    flag: 'bg-blue-400 text-white',
    block: 'bg-blue-800 text-white',
    redact: 'bg-blue-600 text-white',
  };
  const labels = {
    pass: 'Passed',
    flag: 'Flagged for review',
    block: 'Blocked',
    redact: 'PII Redacted',
  };
  const key = (action || 'pass').toLowerCase();
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 ${styles[key] || styles.pass}`}>
      {labels[key] || action || 'Passed'}
    </span>
  );
}

function parseJson(str) {
  if (!str) return [];
  if (typeof str !== 'string') return Array.isArray(str) ? str : [];
  try { return JSON.parse(str); } catch { return []; }
}

function ToolCallSection({ toolCalls }) {
  const parsed = parseJson(toolCalls);
  if (!parsed.length) return null;
  const firstName = parsed[0]?.name || parsed[0]?.function?.name || '';
  const more = parsed.length > 1 ? `+ ${parsed.length - 1} more` : '';
  const preview = `${parsed.length} call${parsed.length !== 1 ? 's' : ''} · ${firstName}${more ? ` ${more}` : ''}`;
  return (
    <CollapsibleBlock
      title="Tool Calls"
      icon={<Wrench size={16} weight="bold" className="text-slate-500 dark:text-slate-400" />}
      preview={preview}
      defaultOpen={true}
    >
      <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
        {parsed.map((tc, i) => (
          <div key={tc.id || i} className="p-4 space-y-2">
            <span className="inline-block text-[10px] font-bold font-mono px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {tc.name || tc.function?.name || 'unknown'}
            </span>
            <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(tc.input || tc.function?.arguments || tc.arguments || {}, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </CollapsibleBlock>
  );
}

function DetectionsSection({ detections }) {
  const parsed = parseJson(detections);
  if (!parsed.length) return null;

  // Severity uses a neutral slate scale — colour reserved for entity / agent
  // identity elsewhere on the page.
  const severityClass = (s) => {
    const sev = (s || '').toLowerCase();
    if (sev === 'high' || sev === 'critical') return 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900';
    if (sev === 'medium') return 'bg-slate-600 text-white dark:bg-slate-300 dark:text-slate-900';
    return 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
  };

  // Preview: rail names joined ("tools · pii"), then top severity.
  const rails = Array.from(new Set(parsed.map((d) => d.rail || 'unknown')));
  const topSev = parsed.find((d) => /high|critical/i.test(d.severity || ''))?.severity
    || parsed.find((d) => /medium/i.test(d.severity || ''))?.severity
    || parsed[0]?.severity || '';
  const preview = `${parsed.length} detection${parsed.length !== 1 ? 's' : ''} · ${rails.join(' · ')}${topSev ? ` · top severity: ${topSev}` : ''}`;

  return (
    <CollapsibleBlock
      title="Detections"
      icon={<ShieldWarning size={16} weight="bold" className="text-slate-500 dark:text-slate-400" />}
      preview={preview}
      defaultOpen={true}
    >
      <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
        {parsed.map((d, i) => (
          <div key={i} className="px-4 py-3 flex items-start gap-3">
            <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
              {d.rail || 'unknown'}
            </span>
            <span className="text-[11px] text-slate-700 dark:text-slate-300 flex-1">{d.detail || ''}</span>
            {d.severity && (
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 shrink-0 ${severityClass(d.severity)}`}>
                {d.severity}
              </span>
            )}
          </div>
        ))}
      </div>
    </CollapsibleBlock>
  );
}

// ─── Root-Cause derivation ────────────────────────────────────────────────────
// Reviewer feedback: "much more detail in the live activity tool call inspector
// where if something is flagged or blocked there's a lot of explanation on root
// cause." This section synthesises a plain-english trigger chain from the
// detection rail outputs the event already carries — no new data plumbing
// required. Each rail (pii / tools / anomaly / hallucination / classifier)
// gets a per-rail interpreter that names the rule, what triggered it, and
// what to do about it.

const RAIL_META = {
  tools:         { label: 'Tool authority',     defense: 'Tool authorization rail',   accent: 'rose'   },
  pii:           { label: 'PII protection',     defense: 'PII detection rail',        accent: 'amber'  },
  anomaly:       { label: 'Behavioural anomaly',defense: 'Anomaly detector',          accent: 'indigo' },
  hallucination: { label: 'Output integrity',   defense: 'Hallucination scorer',      accent: 'indigo' },
  classifier:    { label: 'Pre-classifier',     defense: 'Tier-1 classifier',         accent: 'rose'   },
};

const ACCENT_TONES = {
  rose:   { border: 'border-rose-200 dark:border-rose-900/60',   bg: 'bg-rose-50/60 dark:bg-rose-950/30',   text: 'text-rose-700 dark:text-rose-300',   pill: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' },
  amber:  { border: 'border-amber-200 dark:border-amber-900/60', bg: 'bg-amber-50/60 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', pill: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  indigo: { border: 'border-indigo-200 dark:border-indigo-900/60', bg: 'bg-indigo-50/60 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-300', pill: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' },
  slate:  { border: 'border-slate-200 dark:border-slate-800',    bg: 'bg-slate-50/60 dark:bg-slate-900/30', text: 'text-slate-700 dark:text-slate-300', pill: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' },
};

// Turn a snake_case_or_kebab-case_id into a readable label.
function humanise(id) {
  return String(id || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Per-rail interpretation. Returns { headline, why, evidence, fix }.
function interpretDetection(d) {
  const rail = (d.rail || '').toLowerCase();
  if (rail === 'tools') {
    const tool = d.tool || 'an internal tool';
    if (d.type === 'blocked_action') {
      return {
        headline: `${humanise(tool)} call was blocked`,
        why: `Bastion's tool-authority rail rejected the call to ${tool}. The reason recorded by the policy engine: "${d.reason || 'authorization criteria not met'}".`,
        evidence: d.reason ? `Policy reason code: ${d.reason}` : 'No additional reason supplied.',
        fix: 'If this should be permitted, update the tool-authority policy to allow the calling agent and conditions; otherwise the block is operating as designed.',
      };
    }
    if (d.type === 'refused_bulk_action' || d.type === 'policy_enforcement') {
      return {
        headline: 'Policy refused a higher-impact action',
        why: d.note || 'A bulk or high-impact action was attempted; policy required additional approval and the agent declined.',
        evidence: d.note ? `Policy log: ${d.note}` : 'Policy refusal — no extended note.',
        fix: 'Confirm the policy threshold is appropriate; if an exception is justified, route through the supervisor approval workflow.',
      };
    }
    return {
      headline: `Tool rail fired (${d.type || 'unknown rule'})`,
      why: d.note || d.reason || 'A tool-authority rule matched this call.',
      evidence: JSON.stringify(d, null, 2),
      fix: 'Review the matched rule against the call signature.',
    };
  }
  if (rail === 'pii') {
    const piiType = d.type || 'PII';
    const where = d.location ? ` in the ${humanise(d.location)}` : '';
    const verb = d.action === 'redacted_in_log' ? 'redacted from the audit log' : (d.action || 'flagged');
    return {
      headline: `${humanise(piiType)} surfaced${where}`,
      why: `The PII rail recognised a ${humanise(piiType).toLowerCase()} pattern${where}. Bastion ${verb} the value before it was retained.`,
      evidence: d.value ? `Sample (masked): ${String(d.value).replace(/.(?=.{4})/g, '*')}` : 'No sample retained — pattern match only.',
      fix: 'If this PII class should not appear in agent traffic at all, tighten the upstream tool to avoid surfacing it; otherwise verify redaction in downstream sinks.',
    };
  }
  if (rail === 'anomaly') {
    const score = typeof d.score === 'number' ? `${(d.score * 100).toFixed(0)}%` : 'elevated';
    return {
      headline: `Anomalous query pattern (${humanise(d.type || 'novelty')})`,
      why: d.note || `The query shape diverged from the agent's recent baseline. Anomaly score: ${score}.`,
      evidence: `Anomaly score ${score}. ${d.note || ''}`.trim(),
      fix: 'If this pattern becomes routine, the baseline will absorb it on its own. If it stays an outlier, investigate whether the agent\'s scope has shifted.',
    };
  }
  if (rail === 'hallucination') {
    const score = typeof d.score === 'number' ? `${(d.score * 100).toFixed(0)}%` : 'elevated';
    return {
      headline: 'Output-integrity rail fired',
      why: d.note || `The hallucination scorer assigned this response a confidence-of-fabrication of ${score}.`,
      evidence: `Hallucination score ${score}. ${d.note || ''}`.trim(),
      fix: 'Review the response against authoritative sources; if confirmed fabricated, add the pattern to the scope-seeds vault for future regression coverage.',
    };
  }
  if (rail === 'classifier') {
    return {
      headline: `Pre-classifier match (${humanise(d.type || 'rule')})`,
      why: d.note || 'The Tier-1 input classifier matched a known-bad pattern before the agent saw the request.',
      evidence: d.note || 'No extended classifier note.',
      fix: 'Review the matched rule for false-positive likelihood; tune the classifier if needed.',
    };
  }
  return {
    headline: `${humanise(d.rail)} rail fired`,
    why: d.note || d.reason || 'No additional context available.',
    evidence: JSON.stringify(d, null, 2),
    fix: 'Inspect the raw detection payload below for context.',
  };
}

function RootCauseSection({ event, mode }) {
  const detections = parseJson(event.detections);
  const intended = (event.action || (event.flags?.includes('blocked_action') ? 'block' : event.flags?.includes('pii_exposure') ? 'redact' : event.flags?.length ? 'flag' : 'pass')).toLowerCase();
  const applied = resolveAppliedAction(intended, mode);
  if (intended === 'pass' && detections.length === 0) return null;

  const interpretations = detections.map(interpretDetection);
  const railSummary = Array.from(new Set(detections.map((d) => (d.rail || 'unknown')))).map((rail) => RAIL_META[rail]?.defense || `${humanise(rail)} rail`);

  // Trigger chain: ordered list of (rail → outcome) pairs that lead to the
  // final action. Plain-english version of "what happened, in order".
  const chain = [
    { step: 'Pre-classifier', detail: detections.find((d) => (d.rail || '').toLowerCase() === 'classifier')?.note || 'No Tier-1 match — request passed to agent.' },
    ...detections
      .filter((d) => (d.rail || '').toLowerCase() !== 'classifier')
      .map((d) => ({ step: RAIL_META[(d.rail || '').toLowerCase()]?.defense || `${humanise(d.rail)} rail`, detail: d.note || d.reason || `${humanise(d.type || 'rule')} fired` })),
    { step: 'Policy decision', detail: `Intended action: ${intended.toUpperCase()}. Applied (${mode === 'shadow' ? 'monitoring' : 'enforcement'}): ${applied.toUpperCase()}.` },
  ];

  // Single primary accent for the whole section based on the final action.
  const primaryAccent = intended === 'block' ? 'rose' : intended === 'redact' ? 'amber' : intended === 'flag' ? 'indigo' : 'slate';
  const tone = ACCENT_TONES[primaryAccent];

  return (
    <div className={`border ${tone.border} ${tone.bg} rounded-none overflow-hidden`}>
      <div className={`px-4 py-3 border-b ${tone.border} flex items-center gap-2`}>
        <MagnifyingGlass size={16} weight="bold" className={tone.text} />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Root cause</h3>
        <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 ${tone.pill} uppercase tracking-widest`}>
          {applied}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Headline summary — one-sentence "what fired and why". Always visible
            since this IS the at-a-glance read; the deeper details below are
            expandable so the section isn't a wall of equal-weight blocks. */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Summary</div>
          <p className="text-[12px] text-slate-700 dark:text-slate-300 leading-snug">
            {detections.length === 0
              ? 'No detection rails fired. The intended action came from upstream flags carried with the event.'
              : `${railSummary.length} rail${railSummary.length === 1 ? '' : 's'} contributed to this decision: ${railSummary.join(' · ')}.`}
          </p>
        </div>

        {/* Per-detection root cause cards — collapsible */}
        {interpretations.length > 0 && (
          <ExpandableSubSection
            title="Why each rail fired"
            preview={interpretations.length === 1
              ? interpretations[0].headline
              : `${interpretations.length} rails — ${interpretations[0].headline}${interpretations.length > 1 ? ', …' : ''}`}
            defaultOpen={true}
          >
            <div className="space-y-2">
              {interpretations.map((it, i) => {
                const railAccent = RAIL_META[(detections[i].rail || '').toLowerCase()]?.accent || 'slate';
                const railTone = ACCENT_TONES[railAccent];
                return (
                  <div key={i} className={`bg-white dark:bg-slate-900 border-l-2 ${railTone.border} border border-slate-200 dark:border-slate-800 px-3 py-2.5`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 ${railTone.pill}`}>
                        {RAIL_META[(detections[i].rail || '').toLowerCase()]?.label || humanise(detections[i].rail)}
                      </span>
                      <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">{it.headline}</span>
                    </div>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed mb-1.5">{it.why}</p>
                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60 px-2 py-1.5 mb-1.5 break-all whitespace-pre-wrap">{it.evidence}</div>
                    <div className="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                      <Lightbulb size={12} weight="duotone" className="text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
                      <span><strong className="text-slate-800 dark:text-slate-200">Recommended:</strong> {it.fix}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ExpandableSubSection>
        )}

        {/* Trigger chain — collapsible. Preview is the final outcome step
            since "what was the verdict" is the only thing most reviewers
            need at a glance. */}
        <ExpandableSubSection
          title="Trigger chain"
          preview={`${chain.length} steps · final: ${chain[chain.length - 1].detail}`}
          defaultOpen={true}
        >
          <ol className="space-y-1">
            {chain.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px]">
                <span className="font-mono text-slate-400 dark:text-slate-600 shrink-0 w-4 text-right">{i + 1}.</span>
                <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">{step.step}</span>
                <ArrowRight size={10} className="text-slate-400 dark:text-slate-600 mt-1 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400 leading-snug">{step.detail}</span>
              </li>
            ))}
          </ol>
        </ExpandableSubSection>
      </div>
    </div>
  );
}

// Lighter-weight inline expandable for the inner sub-sections inside
// RootCauseSection. Preview line shows a compressed read of the section
// when collapsed so the wall-of-text problem Luyun flagged disappears.
function ExpandableSubSection({ title, preview, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 mb-1.5 cursor-pointer bg-transparent border-0 p-0 hover:opacity-80 transition-opacity"
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 shrink-0">{title}</span>
        {preview && !open && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate min-w-0 flex-1 text-left font-normal normal-case tracking-normal">
            {preview}
          </span>
        )}
        <span className="ml-auto shrink-0">
          {open
            ? <CaretUp size={11} weight="bold" className="text-slate-400 dark:text-slate-500" />
            : <CaretDown size={11} weight="bold" className="text-slate-400 dark:text-slate-500" />}
        </span>
      </button>
      {open && children}
    </div>
  );
}

function ActionSection({ event, mode }) {
  const intended = (event.action || (event.flags?.includes('blocked_action') ? 'block' : event.flags?.includes('pii_exposure') ? 'redact' : event.flags?.length ? 'flag' : 'pass')).toLowerCase();
  const applied = resolveAppliedAction(intended, mode);
  const suppressed = mode === 'shadow' && (intended === 'block' || intended === 'redact');
  const labels = {
    pass: 'Passed — no policy violations detected',
    flag: 'Flagged for review — potential policy concern',
    block: 'Blocked — action prevented by policy',
    redact: 'PII redacted — sensitive data was masked before delivery',
  };
  // Preview: outcome (applied) + mode tag, e.g. "FLAGGED FOR REVIEW · monitoring"
  const appliedLabel = ({ pass: 'Passed', flag: 'Flagged for review', block: 'Blocked', redact: 'PII Redacted' })[applied] || applied;
  const modeTag = mode === 'shadow' ? 'monitoring' : 'enforcement';
  const preview = `${appliedLabel} · ${modeTag}${suppressed ? ' · would-have-' + intended + 'ed' : ''}`;
  return (
    <CollapsibleBlock
      title="Bastion Action"
      icon={<ShieldWarning size={16} weight="bold" className="text-slate-500 dark:text-slate-400" />}
      preview={preview}
      defaultOpen={true}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
        <div className="border border-slate-200 dark:border-slate-700 px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Policy Decision</div>
          <div className="flex items-center gap-2">
            <ActionBadge action={intended} />
            <span className="text-[11px] text-slate-600 dark:text-slate-400">{labels[intended] || labels.pass}</span>
          </div>
        </div>
        <div className={`border px-3 py-2 ${suppressed ? 'border-slate-400 dark:border-slate-500 border-dashed bg-slate-50/50 dark:bg-slate-800/30' : 'border-slate-200 dark:border-slate-700'}`}>
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            {mode === 'shadow' ? 'Applied (Monitoring)' : 'Applied (Enforcement)'}
          </div>
          <div className="flex items-center gap-2">
            <ActionBadge action={applied} />
            <span className="text-[11px] text-slate-600 dark:text-slate-400">
              {suppressed
                ? `Surfaced as ${applied}; would have ${intended}ed if Enforcement was on.`
                : labels[applied] || labels.pass}
            </span>
          </div>
        </div>
      </div>
    </CollapsibleBlock>
  );
}

export function DrilldownView({ event, agentMeta, onBack }) {
  const mode = useModeStore((s) => s.mode);
  const intended = (event.action || (event.flags?.includes('blocked_action') ? 'block' : event.flags?.includes('pii_exposure') ? 'redact' : event.flags?.length ? 'flag' : 'pass')).toLowerCase();
  const action = resolveAppliedAction(intended, mode);
  // Persisted disposition (Yousuf 2026-05-27): when an item is approved
  // or rejected, the decision survives the next page load and is
  // reflected in the Inspector's Needs Attention / Recently Resolved
  // lists. Persona-scoped so cross-org demos don't bleed.
  const persona = usePersona();
  const personaSlug = persona?.slug || 'default';
  const hydrate = useDispositionStore((s) => s.hydrate);
  const setDispositionInStore = useDispositionStore((s) => s.setDisposition);
  const clearDispositionInStore = useDispositionStore((s) => s.clearDisposition);
  useEffect(() => { hydrate(personaSlug); }, [hydrate, personaSlug]);
  const dispositionRecord = useDispositionFor(personaSlug, event?.id);
  const disposition = dispositionRecord?.state || null;
  const setDisposition = (next) => {
    if (next == null) clearDispositionInStore(personaSlug, event.id);
    else setDispositionInStore(personaSlug, event.id, next);
  };
  const isFlaggedOrBlocked = ['flag', 'block'].includes(action.toLowerCase());

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-[1600px] mx-auto space-y-5"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer bg-transparent border border-slate-200 dark:border-slate-800"
        >
          <ArrowLeft size={14} weight="bold" />
          Back
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(actionIdFor(event)).catch(() => {});
                }
              }}
              className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded-none"
              title="Click to copy this action ID"
            >
              {actionIdFor(event)}
            </button>
            <AgentBadge agent={event.agent} agentMeta={agentMeta} />
            <span className="text-[11px] font-mono text-slate-500">{event.model || ''}</span>
            <span className="text-[11px] text-slate-500">{event.timestamp ? new Date(event.timestamp).toLocaleString() : ''}</span>
            <ActionBadge action={action} />
          </div>
        </div>
      </div>

      {/* Disposition Banner */}
      {isFlaggedOrBlocked && !disposition && (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-none p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">Review Required</span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">This event was {action.toLowerCase() === 'flag' ? 'flagged for review' : 'blocked by policy'}. Approve or reject below.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setDisposition('approved')}
              className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-pointer"
            >
              Approve — Mark Safe
            </button>
            <button
              onClick={() => setDisposition('rejected')}
              className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border border-slate-800 dark:border-slate-200 hover:bg-slate-700 dark:hover:bg-slate-300 transition-colors cursor-pointer"
            >
              Reject — Confirm Block
            </button>
          </div>
        </div>
      )}

      {disposition && (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-none p-4 flex items-center gap-3">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 ${disposition === 'approved' ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'}`}>
            {disposition === 'approved' ? 'Approved' : 'Rejected'}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {disposition === 'approved' ? 'Marked as safe' : 'Block confirmed'}
            <span className="mx-1.5 text-slate-300 dark:text-slate-600">→</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">{dispositionRecord?.destination || DISPOSITION_DESTINATION[disposition]}</span>
          </span>
          <button
            type="button"
            onClick={() => setDisposition(null)}
            className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-transparent border-0 cursor-pointer"
            title="Undo this decision — moves the event back to Needs Attention."
          >
            Undo
          </button>
        </div>
      )}

      {/* Query Preview */}
      {(event.query_preview || event.content) && (
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-none p-4">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Query</span>
          <p className="text-[12px] text-slate-800 dark:text-slate-200 leading-relaxed">{event.query_preview || event.content}</p>
        </div>
      )}

      {/* Root cause — explains WHY this event was flagged/blocked, in plain
          English, with the trigger chain and per-rail recommendations. Hidden
          when the event passed cleanly with no detections (nothing to explain). */}
      <RootCauseSection event={event} mode={mode} />

      {/* Tool Calls */}
      <ToolCallSection toolCalls={event.tool_calls} />

      {/* Detections (raw payload — for reviewers who want to see the rail JSON) */}
      <DetectionsSection detections={event.detections} />

      {/* Action */}
      <ActionSection event={event} mode={mode} />
    </motion.div>
  );
}

function EventListTable({ events, agentMeta, onSelect }) {
  const sorted = [...events].sort((a, b) => {
    return new Date(b.timestamp) - new Date(a.timestamp);
  }).slice(0, 50);

  return (
    <div className="w-full max-w-[1600px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Eye size={24} weight="bold" className="text-slate-400" />
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Tool Call Inspector</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Select an event to inspect tool calls, detections, and actions</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden">
        <div className="grid grid-cols-[50px_1fr_90px_70px_1fr_80px_80px] gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-[9px] font-bold uppercase tracking-wider text-slate-500">
          <span>ID</span>
          <span>Timestamp</span>
          <span>Agent</span>
          <span>Action</span>
          <span>Query Preview</span>
          <span>Tools</span>
          <span>Detections</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {sorted.map((event) => {
            const toolCalls = parseJson(event.tool_calls);
            const detections = parseJson(event.detections);
            const action = event.action || (event.flags?.includes('blocked_action') ? 'block' : event.flags?.includes('pii_exposure') ? 'redact' : event.flags?.length ? 'flag' : 'pass');
            return (
              <button
                key={event.id}
                onClick={() => onSelect(event.id)}
                className="w-full grid grid-cols-[50px_1fr_90px_70px_1fr_80px_80px] gap-2 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer bg-transparent border-none"
              >
                <span className="text-[11px] font-mono font-bold text-slate-400">#{event.id}</span>
                <span className="text-[10px] font-mono text-slate-500 truncate">
                  {event.timestamp ? new Date(event.timestamp).toLocaleString() : ''}
                </span>
                <AgentBadge agent={event.agent} agentMeta={agentMeta} />
                <ActionBadge action={action} />
                <span className="text-[11px] text-slate-700 dark:text-slate-300 truncate">
                  {event.query_preview || event.content || ''}
                </span>
                <span className="text-[11px] font-mono text-slate-500">{toolCalls.length}</span>
                <span className="text-[11px] font-mono text-slate-500">{detections.length}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function EventDrilldown({ data, selectedEvent, selectedEventId, setSelectedEventId }) {
  if (selectedEventId && !selectedEvent) {
    return (
      <div className="w-full max-w-[1600px] mx-auto flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <Spinner size={20} className="animate-spin" />
          <span className="text-sm">Loading event #{selectedEventId}...</span>
        </div>
      </div>
    );
  }

  if (selectedEvent) {
    return (
      <DrilldownView
        event={selectedEvent}
        agentMeta={data?.agentMeta || {}}
        onBack={() => setSelectedEventId(null)}
      />
    );
  }

  return (
    <EventListTable
      events={data?.events || []}
      agentMeta={data?.agentMeta || {}}
      onSelect={setSelectedEventId}
    />
  );
}
