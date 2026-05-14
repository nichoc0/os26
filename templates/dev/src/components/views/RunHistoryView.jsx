import { ShieldCheck, ArrowSquareOut, CalendarBlank } from '@phosphor-icons/react';
import { RUN_HISTORY, TRIGGER_META, VERDICT_META } from '../../data/runHistoryFixture';
import { usePersona } from '../../store/personaStore';

// Run history. Inverted-pyramid layout per Luyun's design feedback:
// bottom line (verdict, colored for preattentive read) → explanation
// (delta sentence + trigger + when) → evidence (full numeric breakdown
// that sums to the probe total, plus the run ID). One consistent icon
// for every row — the trigger kind is in the explanation text where
// it belongs, not behind icon variety.
//
// Filtering: scope to the active Clerk org's customerSlug. Multi-
// tenant isolation is enforced upstream by /api/report, but the demo
// also filters client-side as defense-in-depth.

function fmtTs(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(undefined, { hour12: false, dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return iso; }
}

function relativeAge(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    const now = Date.now();
    const mins = Math.floor((now - t) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
}

// Verdict → preattentive color signal. This is the only place in the
// product where a dashboard color hit is justified: the buyer needs to
// know at a glance which runs went badly. The Posture Report document
// itself stays neutral; here the verdict word is the bottom line.
const VERDICT_TONE = {
    'improved':  { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
    'pass':      { dot: 'bg-slate-400',   text: 'text-slate-700 dark:text-slate-300' },
    'regressed': { dot: 'bg-rose-500',    text: 'text-rose-700 dark:text-rose-300' },
    'baseline':  { dot: 'bg-blue-500',    text: 'text-blue-700 dark:text-blue-300' },
};

export default function RunHistoryView({ onOpenReport, navigate }) {
    const persona = usePersona();
    const runs = RUN_HISTORY.filter((r) => r.customerSlug === (persona.reportSlug || persona.slug));

    if (runs.length === 0) {
        return (
            <div className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">No runs yet</p>
                <p>Schedule a recurring attestation under <strong>Test &rarr; CI/CD</strong> or fire the first run manually with the Spawn Probe wizard.</p>
            </div>
        );
    }

    // Summary strip
    const last10 = runs.slice(0, 10);
    const totalProbes = last10.reduce((a, r) => a + r.probes, 0);
    const totalViolations = last10.reduce((a, r) => a + r.violations, 0);
    const recentRegression = last10.find((r) => r.verdict === 'regressed');

    return (
        <div className="w-full max-w-[1400px] mx-auto px-6 py-6 space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 auto-rows-fr items-stretch">
                <SummaryCell label="Total runs (90d)" value={runs.length} hint="continuous attestation cadence" />
                <SummaryCell label="Probes fired" value={totalProbes.toLocaleString()} hint={`across last ${last10.length} run${last10.length === 1 ? '' : 's'}`} />
                <SummaryCell label="Violations surfaced" value={totalViolations} hint={totalViolations === 0 ? 'all-clear stretch' : 'tracked + remediated'} />
                <SummaryCell label="Most recent verdict" value={VERDICT_META[runs[0].verdict]?.label || runs[0].verdict} hint={recentRegression ? `last regression: ${relativeAge(recentRegression.triggeredAt)}` : 'no regressions in this window'} />
            </div>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">Run history</h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Newest first. Each row is one Bastion run. Verdict first; full breakdown sums to the probe total.
                        </p>
                    </div>
                    {/* Causal link: these runs are produced by the
                        triggers configured under Test → CI/CD. Keeping
                        the surfaces in different sections is fine
                        (per design call) — they just need to read as
                        one chain. */}
                    <button
                        onClick={() => navigate?.('voice-testing', 'schedule')}
                        className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                        <CalendarBlank size={12} weight="bold" />
                        Configure triggers in CI/CD
                        <ArrowSquareOut size={10} weight="bold" />
                    </button>
                </header>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {runs.map((r) => <RunRow key={r.id} r={r} onOpen={onOpenReport} />)}
                </div>
            </section>
        </div>
    );
}

function RunRow({ r, onOpen }) {
    const tone = VERDICT_TONE[r.verdict] || VERDICT_TONE.pass;
    const verdictLabel = (VERDICT_META[r.verdict]?.label || r.verdict).toUpperCase();
    const tMeta = TRIGGER_META[r.trigger.kind] || { label: r.trigger.kind };
    // Sanity check the math at render time so it never silently drifts:
    // if a row's components don't reconcile to the probe total, the
    // remainder is shown as "other" so the buyer can see the gap rather
    // than wonder where it went.
    const accounted = (r.violations || 0) + (r.refusals || 0) + (r.offTask || 0) + (r.inconclusive || 0);
    const other = Math.max(0, (r.probes || 0) - accounted);

    return (
        <button
            onClick={() => onOpen?.(r)}
            className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors cursor-pointer"
        >
            <div className="grid grid-cols-12 gap-4">
                {/* BOTTOM LINE — verdict + delta sentence */}
                <div className="col-span-12 lg:col-span-5 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck size={14} weight="bold" className="text-slate-400 shrink-0" />
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                        <span className={`text-[11px] font-bold uppercase tracking-widest ${tone.text}`}>
                            {verdictLabel}
                        </span>
                    </div>
                    <div className="text-sm text-slate-900 dark:text-slate-100 leading-snug">
                        {r.delta}
                    </div>
                </div>

                {/* EXPLANATION — trigger kind + spec + time */}
                <div className="col-span-12 lg:col-span-4 min-w-0 text-xs text-slate-700 dark:text-slate-300">
                    <div className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400">Trigger</div>
                    <div className="truncate mt-0.5">{tMeta.label} · {r.trigger.spec}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                        {fmtTs(r.triggeredAt)} · {relativeAge(r.triggeredAt)} · {r.durationMin}m
                    </div>
                </div>

                {/* EVIDENCE — full numeric breakdown that sums to probes */}
                <div className="col-span-12 lg:col-span-3">
                    <div className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                        Probes <span className="tabular-nums">{r.probes}</span> = sum below
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-[10px]">
                        <Pill label="Viol." value={r.violations} tone={r.violations > 0 ? 'attention' : 'neutral'} />
                        <Pill label="Refused" value={r.refusals} tone="neutral" />
                        <Pill label="Off-task" value={r.offTask} tone="neutral" />
                        <Pill label="Inconc." value={r.inconclusive} tone="neutral" />
                        {other > 0 && <Pill label="Other" value={other} tone="neutral" />}
                    </div>
                    <div className="text-[10px] mt-2 text-slate-400 font-mono truncate">{r.id}</div>
                </div>
            </div>

            {/* Footer — clear separation between the run-row content
                and the "Open report" CTA so the verdict pill and the
                link don't crowd each other (BaoP feedback). */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex justify-end">
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1.5">
                    Open Posture Report for this run
                    <ArrowSquareOut size={11} weight="bold" />
                </span>
            </div>
        </button>
    );
}

function Pill({ label, value, tone }) {
    const cls = tone === 'attention' && value > 0
        ? 'border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-300'
        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300';
    return (
        <div className={`border ${cls} px-1.5 py-1 text-center`}>
            <div className="text-sm font-bold tabular-nums leading-none">{value}</div>
            <div className="text-[8px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
        </div>
    );
}

function SummaryCell({ label, value, hint }) {
    return (
        <div className="h-full flex flex-col border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
            <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50 leading-none">
                {value}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-2">
                {label}
            </div>
            {hint && (
                <div className="text-[10px] mt-1 text-slate-400 leading-snug">{hint}</div>
            )}
        </div>
    );
}
