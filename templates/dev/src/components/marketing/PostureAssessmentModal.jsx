import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, ArrowLeft, CaretDown, Check } from '@phosphor-icons/react';

// Posture-Assessment intake modal. Replaces the previous mailto CTA on
// the Adversarial Assessment view. Mirrors the 7-question flow shipped
// on pistonsolutions.ai (FreeAssessmentSection.tsx), then collects
// contact details and POSTs to the same /api/contact endpoint that
// already writes to the marketing database.

const QUESTIONS = [
    { id: 'pii', type: 'choice', prompt: 'Does your agentic workflow handle protected PII, PHI (Protected Health Information), or financial transactions exceeding $500?' },
    { id: 'human-in-loop', type: 'choice', prompt: 'Does your agent operate with a human in the loop?' },
    { id: 'direct-write-access', type: 'choice', prompt: 'Does your agent have direct write access to external APIs and databases?' },
    { id: 'ai-endorsement', type: 'choice', prompt: 'Does your insurance policy include an affirmative AI endorsement?' },
    { id: 'policy-enforcement', type: 'choice', prompt: 'Does your stack enforce your AI policies on every agent?' },
    { id: 'immutable-logs', type: 'choice', prompt: 'Do you retain immutable logs of every prompt, tool call, and agent action for at least 90 days?' },
    {
        id: 'industry',
        type: 'dropdown',
        prompt: 'What field does your AI agent live in?',
        options: [
            'Aviation / Aerospace',
            'Banking / Financial services',
            'Energy / Utilities',
            'Government / Defense',
            'Healthcare / Life sciences',
            'Insurance',
            'Legal',
            'Manufacturing / Industrial',
            'Media / Gaming',
            'Retail / E-commerce',
            'SaaS / Technology',
            'Other',
        ],
    },
];

const CHOICE_LABELS = { yes: 'Yes', no: 'No', unsure: 'Not sure' };

// Same-origin path on the dashboard host. vercel.json rewrites
// /bastion-blue/api/contact → https://pistonsolutions.ai/api/contact so
// the browser doesn't need a CORS preflight against the marketing
// origin (which doesn't allow demo.pistonsolutions.ai).
const CONTACT_ENDPOINT = (() => {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return `${base}/api/contact`;
})();

export default function PostureAssessmentModal({ open, onClose }) {
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [form, setForm] = useState({ name: '', organization: '', email: '', message: '' });
    const [status, setStatus] = useState('idle');

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    useEffect(() => {
        if (!dropdownOpen) return undefined;
        const onClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [dropdownOpen]);

    useEffect(() => { setDropdownOpen(false); }, [step]);

    const reset = () => {
        setStep(0);
        setAnswers({});
        setSubmitted(false);
        setForm({ name: '', organization: '', email: '', message: '' });
        setStatus('idle');
    };

    useEffect(() => { if (open) reset(); }, [open]);

    const current = QUESTIONS[step];
    const currentAnswer = answers[current?.id];
    const canAdvance = currentAnswer !== undefined && currentAnswer !== '';
    const isLast = step === QUESTIONS.length - 1;

    const advanceFrom = (questionStep) => {
        if (questionStep === QUESTIONS.length - 1) setSubmitted(true);
        else setStep(questionStep + 1);
    };

    const setAnswer = (value) => {
        const stepAtClick = step;
        setAnswers((prev) => ({ ...prev, [current.id]: value }));
        if (current.type === 'choice') {
            setTimeout(() => advanceFrom(stepAtClick), 220);
        }
    };

    const next = () => { if (canAdvance) advanceFrom(step); };
    const back = () => { if (step > 0) setStep((s) => s - 1); };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setStatus('sending');
        const summary = QUESTIONS.map((q) => {
            const a = answers[q.id];
            const display = a === undefined ? '—' : q.type === 'choice' ? CHOICE_LABELS[a] : a;
            return `- ${q.prompt} → ${display}`;
        }).join('\n');
        try {
            const response = await fetch(CONTACT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    email: form.email,
                    message: `SOURCE: Posture Assessment (Bastion dashboard)\nORG: ${form.organization}\n\nASSESSMENT ANSWERS:\n${summary}\n\nMESSAGE:\n${form.message || '(none)'}`,
                }),
            });
            if (!response.ok) throw new Error('failed');
            setStatus('sent');
        } catch {
            setStatus('error');
        }
    };

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    key="panel"
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.98 }}
                    transition={{ duration: 0.22 }}
                    className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-sm"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                        <X size={18} />
                    </button>

                    {!submitted ? (
                        <div className="p-8 md:p-10">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500 mb-2">
                                Question {step + 1} of {QUESTIONS.length}
                            </div>
                            <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight mb-6">
                                {current.prompt}
                            </h3>

                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={step}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    {current.type === 'choice' ? (
                                        <div className="space-y-2">
                                            {['yes', 'no', 'unsure'].map((c) => {
                                                const selected = currentAnswer === c;
                                                return (
                                                    <button
                                                        key={c}
                                                        type="button"
                                                        onClick={() => setAnswer(c)}
                                                        className={`w-full flex items-center justify-between rounded-sm border px-5 py-4 text-left text-sm font-medium transition-all cursor-pointer ${selected
                                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-sm'
                                                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                                    >
                                                        <span>{CHOICE_LABELS[c]}</span>
                                                        {selected && (
                                                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                                                                <Check size={12} weight="bold" className="text-white" />
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div ref={dropdownRef} className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setDropdownOpen((v) => !v)}
                                                aria-haspopup="listbox"
                                                aria-expanded={dropdownOpen}
                                                className={`w-full flex items-center justify-between rounded-sm border px-5 py-4 text-left text-sm font-medium transition-all cursor-pointer ${dropdownOpen
                                                    ? 'border-blue-500 bg-white dark:bg-slate-900 shadow-sm'
                                                    : currentAnswer
                                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-sm'
                                                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:border-blue-400'}`}
                                            >
                                                <span>{currentAnswer || 'Select your industry'}</span>
                                                <CaretDown size={12} weight="bold" className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                            <AnimatePresence>
                                                {dropdownOpen && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -6 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -6 }}
                                                        transition={{ duration: 0.15 }}
                                                        role="listbox"
                                                        className="absolute left-0 right-0 top-full mt-2 z-20 rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-[16rem] overflow-y-auto py-1.5"
                                                    >
                                                        {current.options.map((opt) => {
                                                            const selected = currentAnswer === opt;
                                                            return (
                                                                <button
                                                                    key={opt}
                                                                    type="button"
                                                                    role="option"
                                                                    aria-selected={selected}
                                                                    onClick={() => { setAnswer(opt); setDropdownOpen(false); }}
                                                                    className={`w-full flex items-center justify-between px-5 py-2.5 text-left text-sm font-medium cursor-pointer ${selected
                                                                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                                                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                                                >
                                                                    <span>{opt}</span>
                                                                    {selected && <Check size={12} weight="bold" className="text-blue-500" />}
                                                                </button>
                                                            );
                                                        })}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>

                            <div className="mt-8 flex items-center justify-between">
                                <button
                                    onClick={back}
                                    disabled={step === 0}
                                    className={`inline-flex items-center gap-1.5 text-sm font-medium ${step === 0 ? 'text-slate-400 cursor-not-allowed' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer'}`}
                                >
                                    <ArrowLeft size={12} weight="bold" />
                                    Back
                                </button>
                                <button
                                    onClick={next}
                                    disabled={!canAdvance}
                                    className={`inline-flex items-center gap-2 rounded-sm px-6 py-3 text-sm font-semibold transition-all ${canAdvance
                                        ? 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
                                        : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'}`}
                                >
                                    {isLast ? 'See result' : 'Next'}
                                    <ArrowRight size={12} weight="bold" />
                                </button>
                            </div>
                        </div>
                    ) : status === 'sent' ? (
                        <div className="p-8 md:p-10 text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-500">
                                <Check size={28} weight="bold" />
                            </div>
                            <h3 className="mt-5 text-2xl font-bold text-slate-900 dark:text-slate-100">Message received</h3>
                            <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                                Thanks for completing the assessment. We&apos;ll get back to you within 24 hours.
                            </p>
                            <button
                                onClick={onClose}
                                className="mt-6 inline-flex items-center gap-2 rounded-sm px-6 py-3 text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleFormSubmit} className="p-8 md:p-10">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500 mb-2">
                                Send your results
                            </div>
                            <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight mb-6">
                                Where should we send your posture assessment?
                            </h3>
                            <div className="space-y-3">
                                <input
                                    name="email"
                                    type="email"
                                    required
                                    placeholder="Work email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className="w-full rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                                />
                                <input
                                    name="name"
                                    type="text"
                                    required
                                    placeholder="Your name"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                                />
                                <input
                                    name="organization"
                                    type="text"
                                    placeholder="Organization (optional)"
                                    value={form.organization}
                                    onChange={(e) => setForm({ ...form, organization: e.target.value })}
                                    className="w-full rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                                />
                                <textarea
                                    name="message"
                                    placeholder="Anything else we should know? (optional)"
                                    value={form.message}
                                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                                    rows={3}
                                    className="w-full rounded-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none resize-none"
                                />
                            </div>
                            {status === 'error' && (
                                <p className="mt-3 text-xs text-red-500">Could not send — try again, or email info@pistonsolutions.ai directly.</p>
                            )}
                            <div className="mt-6 flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={() => { setSubmitted(false); setStep(QUESTIONS.length - 1); }}
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                                >
                                    <ArrowLeft size={12} weight="bold" />
                                    Back
                                </button>
                                <button
                                    type="submit"
                                    disabled={status === 'sending'}
                                    className={`inline-flex items-center gap-2 rounded-sm px-6 py-3 text-sm font-semibold ${status === 'sending'
                                        ? 'bg-blue-300 text-white cursor-wait'
                                        : 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'}`}
                                >
                                    {status === 'sending' ? 'Sending…' : 'Send'}
                                    <ArrowRight size={12} weight="bold" />
                                </button>
                            </div>
                        </form>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
