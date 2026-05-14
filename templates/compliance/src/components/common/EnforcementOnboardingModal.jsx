import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheckered, Copy, CheckCircle, CircleNotch, Warning, Lock, ArrowRight } from '@phosphor-icons/react';

const PROXY_URL = 'https://ingest.pistonsolutions.ai/v1/chat/completions';
const PLACEHOLDER_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const PLACEHOLDER_KEY = 'sk-•••••••••••••••••••••••••••••••••••••••••';
// Pre-filled demo values — the prospect can hit "Verify Configuration"
// immediately without typing, but the fields stay editable.
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_KEY = 'sk-proj-acme-J4rT9LqV3xK2nP8wYfH6mZ1QbEcD5sN7uA0iRoX';

// Demo verification timeline. Each step appears in order with a spinner that
// resolves to a checkmark after `delay` ms. Total run ~3.5s.
const VERIFY_STEPS = [
  { id: 'dns',     label: 'DNS resolution',                     detail: 'ingest.pistonsolutions.ai · A 76.76.21.21',          delay: 700  },
  { id: 'tls',     label: 'TLS handshake',                      detail: 'TLS 1.3 · ECDHE-ECDSA-AES256-GCM-SHA384',           delay: 1300 },
  { id: 'auth',    label: 'Auth probe to your endpoint',        detail: 'HEAD / · 200 OK · Authorization echo verified',     delay: 2000 },
  { id: 'forward', label: 'Forwarding loop test',               detail: 'probe → bastion → upstream → bastion → response',   delay: 2900 },
  { id: 'shield',  label: 'Enforcement rails primed',           detail: 'Groundedness · Authorization · PII redaction · Tool ACL', delay: 3500 },
];

// — Copy field: read-only value with an obvious copy affordance.
//   Visual cue: slate background, dim border, copy icon top-right.
function CopyField({ label, value, hint }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</div>
        <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500">copy</span>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="w-full group relative flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-950/60 border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer text-left"
      >
        <code className="flex-1 text-[12px] font-mono text-slate-800 dark:text-slate-200 break-all leading-relaxed">{value}</code>
        <span className={`shrink-0 px-2 py-1 text-[9px] font-bold uppercase tracking-widest border transition-colors ${copied ? 'text-blue-600 dark:text-blue-400 border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 group-hover:border-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-400'}`}>
          {copied ? <span className="flex items-center gap-1"><CheckCircle size={11} weight="fill" /> Copied</span> : <span className="flex items-center gap-1"><Copy size={11} weight="bold" /> Copy</span>}
        </span>
      </button>
      {hint && <div className="text-[10px] text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}

// — Input field: user types here. Visual cue: white background, solid border,
//   placeholder, "type" pill in top-right.
function InputField({ label, value, onChange, placeholder, hint, type = 'text', autoFocus = false }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">{label}</div>
        <span className="text-[9px] font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400">your input</span>
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border-2 border-blue-300 dark:border-blue-700 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none text-[12px] font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors"
      />
      {hint && <div className="text-[10px] text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}

function VerifyStep({ step, status }) {
  const isDone = status === 'done';
  const isPending = status === 'pending';
  const isInflight = status === 'inflight';
  return (
    <li className={`flex items-center gap-3 px-4 py-3 border ${isDone ? 'border-blue-300 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-900/10' : isInflight ? 'border-blue-400 dark:border-blue-500 bg-white dark:bg-slate-900' : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 opacity-60'}`}>
      <div className="shrink-0 w-5 h-5 flex items-center justify-center">
        {isDone && <CheckCircle size={18} weight="fill" className="text-blue-500" />}
        {isInflight && <CircleNotch size={16} weight="bold" className="text-blue-500 animate-spin" />}
        {isPending && <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] font-semibold ${isDone ? 'text-slate-800 dark:text-slate-100' : isInflight ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-500'}`}>{step.label}</div>
        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-500 truncate">{step.detail}</div>
      </div>
      <div className={`shrink-0 text-[9px] font-bold uppercase tracking-widest ${isDone ? 'text-blue-600 dark:text-blue-400' : isInflight ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-600'}`}>
        {isDone ? 'pass' : isInflight ? 'checking' : 'queued'}
      </div>
    </li>
  );
}

export default function EnforcementOnboardingModal({ open, onClose, onConfirm }) {
  const [stage, setStage] = useState('config'); // 'config' | 'verifying' | 'verified'
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [apiKey, setApiKey] = useState(DEFAULT_KEY);
  const [doneSteps, setDoneSteps] = useState(new Set());
  const [error, setError] = useState('');

  // Reset modal state every time it opens — prefill so the prospect can
  // hit Verify immediately, but the fields stay editable.
  useEffect(() => {
    if (open) {
      setStage('config');
      setEndpoint(DEFAULT_ENDPOINT);
      setApiKey(DEFAULT_KEY);
      setDoneSteps(new Set());
      setError('');
    }
  }, [open]);

  // Drive the demo verification timeline when entering the verifying stage.
  useEffect(() => {
    if (stage !== 'verifying') return;
    const timers = VERIFY_STEPS.map((step) =>
      setTimeout(() => {
        setDoneSteps((prev) => {
          const next = new Set(prev);
          next.add(step.id);
          if (next.size === VERIFY_STEPS.length) {
            setStage('verified');
          }
          return next;
        });
      }, step.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [stage]);

  // Lock body scroll while the modal is open so the blur doesn't get a
  // scrollable backdrop behind it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const handleVerify = () => {
    if (!endpoint.trim()) { setError('Enter the model endpoint URL you want Bastion to forward to.'); return; }
    if (!/^https?:\/\//.test(endpoint.trim())) { setError('Endpoint must start with https:// or http://.'); return; }
    if (!apiKey.trim()) { setError('Enter the API key Bastion should attach when forwarding.'); return; }
    setError('');
    setDoneSteps(new Set());
    setStage('verifying');
  };

  const inflightStepId = (() => {
    if (stage === 'config') return null;
    return VERIFY_STEPS.find((s) => !doneSteps.has(s.id))?.id || null;
  })();

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 bg-slate-900/70 dark:bg-black/80 backdrop-blur-xl"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldCheckered size={20} weight="fill" className="text-blue-500" />
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Enable Enforcement</h2>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Step {stage === 'config' ? '1' : stage === 'verifying' ? '2' : '3'} of 3 ·{' '}
                {stage === 'config' ? 'Configure proxy' : stage === 'verifying' ? 'Verify endpoint' : 'Confirm switch'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer bg-transparent border-none"
            aria-label="Close"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {stage === 'config' && (
            <>
              <p className="text-[12px] text-slate-700 dark:text-slate-300 leading-relaxed">
                Bastion runs as a transparent proxy. Repoint your AI fleet at the URL we provide, tell us where to forward to, and we'll verify the path before flipping enforcement on.
              </p>

              {/* Step 1: copy proxy URL */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200">1</span>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">
                    Repoint your fleet at this URL
                  </div>
                </div>
                <CopyField
                  label="Bastion proxy URL"
                  value={PROXY_URL}
                  hint="Replace your existing model endpoint with this in your fleet config. No code change."
                />
              </section>

              {/* Step 2: input endpoint + api key */}
              <section className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold bg-blue-600 text-white">2</span>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">
                    Tell Bastion where to forward to
                  </div>
                </div>
                <InputField
                  label="Your model endpoint"
                  value={endpoint}
                  onChange={setEndpoint}
                  placeholder={PLACEHOLDER_ENDPOINT}
                  hint="The endpoint Bastion should forward verified requests to."
                  autoFocus
                />
                <InputField
                  label="API key for forwarding"
                  value={apiKey}
                  onChange={setApiKey}
                  placeholder={PLACEHOLDER_KEY}
                  type="password"
                  hint="Stored encrypted at rest. Bastion attaches this on outbound forwards."
                />
              </section>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800/50 text-[11px] text-amber-800 dark:text-amber-300">
                  <Warning size={14} weight="fill" className="text-amber-600 dark:text-amber-400 shrink-0" />
                  {error}
                </div>
              )}
            </>
          )}

          {(stage === 'verifying' || stage === 'verified') && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Verifying</div>
                  <div className="text-[12px] font-mono text-slate-700 dark:text-slate-200">{endpoint}</div>
                </div>
                {stage === 'verified' && (
                  <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                    <CheckCircle size={12} weight="fill" /> Verified
                  </span>
                )}
              </div>

              <ul className="space-y-2">
                {VERIFY_STEPS.map((step) => {
                  const status = doneSteps.has(step.id)
                    ? 'done'
                    : step.id === inflightStepId
                    ? 'inflight'
                    : 'pending';
                  return <VerifyStep key={step.id} step={step} status={status} />;
                })}
              </ul>

              {stage === 'verified' && (
                <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/15 border border-blue-300 dark:border-blue-800/60 flex items-start gap-3">
                  <Lock size={16} weight="fill" className="text-blue-500 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                    Configuration verified end-to-end. Switching to enforcement only changes <strong>which URL your fleet calls</strong> — keys, prompts, and tools stay the same. Roll back at any time by flipping back to Monitoring.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between gap-2 shrink-0">
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {stage === 'config' && <>Need help? See <a href="/docs#enforcement" className="text-blue-600 dark:text-blue-400 hover:underline">docs/enforcement</a>.</>}
            {stage === 'verifying' && <>Running checks against the proxy + your endpoint…</>}
            {stage === 'verified' && <>All checks passed. Ready to enable enforcement.</>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer bg-transparent"
            >
              Cancel
            </button>
            {stage === 'config' && (
              <button
                onClick={handleVerify}
                className="px-5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer border-none flex items-center gap-1.5"
              >
                Verify Configuration <ArrowRight size={12} weight="bold" />
              </button>
            )}
            {stage === 'verifying' && (
              <button
                disabled
                className="px-5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-200 dark:bg-slate-800 cursor-not-allowed border-none flex items-center gap-1.5"
              >
                <CircleNotch size={12} weight="bold" className="animate-spin" /> Verifying…
              </button>
            )}
            {stage === 'verified' && (
              <button
                onClick={onConfirm}
                className="px-5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer border-none flex items-center gap-1.5"
              >
                Switch to Enforcement <ArrowRight size={12} weight="bold" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
