import { useState } from 'react';
import { Clock, GitBranch, GitPullRequest, Rocket, ArrowsClockwise, Cursor, Copy, CaretRight, Plus, ClockCounterClockwise, ArrowSquareOut } from '@phosphor-icons/react';
import { SCHEDULED_RUNS, TRIGGER_META } from '../../data/runHistoryFixture';
import { useIsTenant } from '../../data/useIsTenant';

// Continuous-assurance schedule view. Lives under Voice Testing.
// Surfaces the three things a continuous-attestation buyer wants to
// see: (1) what's scheduled to run right now, (2) how to add a new
// schedule, (3) how to wire Bastion into their existing CI/CD.
//
// "Schedule new" opens the existing Spawn Probe wizard with a recurring
// flag; for the demo it just emits a toast since the wiring is a
// backend job for next sprint. The CI/CD snippets are real and copy
// straight into a GitHub Actions / GitLab CI file.

const TRIGGER_ICONS = {
    'manual':        Cursor,
    'cron':          Clock,
    'github-push':   GitBranch,
    'github-pr':     GitPullRequest,
    'deploy':        Rocket,
    'reattestation': ArrowsClockwise,
};

function fmtTs(iso) {
    if (!iso) return '—';
    // Force en-US so the date doesn't switch to the viewer's browser
    // locale (French / Quebec macOS otherwise renders "9 mai 2026"
    // here, which reads as foreign in a Bastion attestation UI).
    try { return new Date(iso).toLocaleString('en-US', { hour12: false, dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return iso; }
}

export default function AssuranceScheduleView({ setCurrentView, navigate, onScheduleNew }) {
    const [openIntegration, setOpenIntegration] = useState(null);
    const [sdk, setSdk] = useState('npm'); // 'npm' | 'pypi'
    const isTenant = useIsTenant();

    return (
        <div className="w-full max-w-[1400px] mx-auto px-6 py-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">CI/CD</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-3xl">
                        Bastion attestation is continuous, not one-shot. Schedule recurring runs against your voice agent — on a cron, on every push, on every PR, on every production deploy. Each run produces a fresh Posture Report linked to its trigger.
                    </p>
                </div>
                {/* Causal link out: the triggers below produce runs
                    that land in the Posture Report's Run history. */}
                <button
                    onClick={() => navigate?.('reports', 'history')}
                    className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                    <ClockCounterClockwise size={12} weight="bold" />
                    See runs this pipeline produced
                    <ArrowSquareOut size={10} weight="bold" />
                </button>
            </div>

            {/* Schedules. Hardcoded demo schedules (Nightly attestation,
                CI/CD pipeline, etc.) only render for anonymous demo viewers.
                Real tenants see "No schedules configured" until they wire
                bastion run into their CI; once a CI run hits /api/sdk/runs
                with their bk_*, history surfaces in Reports. */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">Active schedules</h3>
                        <span className="text-[10px] text-slate-400">{isTenant ? 0 : SCHEDULED_RUNS.length} configured</span>
                    </div>
                    <button
                        onClick={() => onScheduleNew ? onScheduleNew() : setCurrentView?.('voice-testing')}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 border border-blue-500 text-white bg-blue-500 hover:bg-blue-600 cursor-pointer"
                    >
                        <Plus size={12} weight="bold" />
                        Schedule new
                    </button>
                </header>
                {isTenant ? (
                    <div className="px-5 py-8 text-center">
                        <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
                            No schedules configured for your org. Wire <code className="font-mono text-[11px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800">bastion run</code> /{' '}
                            <code className="font-mono text-[11px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800">bastion voice</code> into your CI using the snippets below — runs landing with your API key appear in Voice Runs + Reports.
                        </p>
                    </div>
                ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {SCHEDULED_RUNS.map((s) => {
                        const Icon = TRIGGER_ICONS[s.kind] || Clock;
                        const meta = TRIGGER_META[s.kind] || { label: s.kind, hint: '' };
                        return (
                            <div key={s.id} className="px-5 py-3.5 grid grid-cols-12 gap-4 items-center hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                                <div className="col-span-12 sm:col-span-4 flex items-start gap-3">
                                    <Icon size={16} weight="bold" className="text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{s.label}</div>
                                        <div className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-0.5">{meta.label}</div>
                                    </div>
                                </div>
                                <div className="col-span-12 sm:col-span-5 text-xs text-slate-700 dark:text-slate-300">
                                    <div className="truncate">{s.spec}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        Corpus: {s.corpus} · Notify: {s.notify.join(', ')}
                                    </div>
                                </div>
                                <div className="col-span-6 sm:col-span-2 text-[11px] text-slate-600 dark:text-slate-300">
                                    <div className="text-[9px] uppercase tracking-widest text-slate-400">Last run</div>
                                    <div className="tabular-nums">{fmtTs(s.lastRun)}</div>
                                </div>
                                <div className="col-span-6 sm:col-span-1 text-right">
                                    <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
                                        {s.status}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                )}
            </section>

            {/* CI/CD integrations — driven by the real Bastion SDKs.
                Both `@pistonsolutions/bastion` (npm) and `bastion-red`
                (pypi) ship a `bastion run` CLI that accepts a SCOPE.md
                + a hosted runner URL and exits non-zero on any new
                high-or-critical finding. Same binary in every CI. */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">CI/CD integration</h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Same Bastion SDK in every pipeline. Drop the snippet in, set <code className="font-mono text-[10px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800">BASTION_API_KEY</code> as a secret, exit non-zero on new high-or-critical. Pick your SDK below.
                        </p>
                    </div>
                    <div className="flex border border-slate-300 dark:border-slate-700 shrink-0">
                        <button
                            onClick={() => setSdk('npm')}
                            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer ${sdk === 'npm' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
                        >
                            npm
                        </button>
                        <button
                            onClick={() => setSdk('pypi')}
                            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer border-l border-slate-300 dark:border-slate-700 ${sdk === 'pypi' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
                        >
                            pypi
                        </button>
                    </div>
                </header>
                <div className="px-5 pt-3 pb-1 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <span className="font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{sdk === 'npm' ? '@pistonsolutions/bastion@0.4.12' : 'bastion-red==0.4.12'}</span>
                    <span className="text-slate-400">·</span>
                    <span>same <code className="font-mono">bastion run</code> CLI in both SDKs.</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    <IntegrationRow id="github-actions" label="GitHub Actions" hint="Workflow on push, pull_request, deployment_status" open={openIntegration} setOpen={setOpenIntegration}>
                        <Snippet
                            filename=".github/workflows/bastion-attest.yml"
                            code={sdk === 'npm' ? GH_ACTIONS_NPM : GH_ACTIONS_PYPI}
                        />
                    </IntegrationRow>
                    <IntegrationRow id="gitlab-ci" label="GitLab CI" hint=".gitlab-ci.yml job" open={openIntegration} setOpen={setOpenIntegration}>
                        <Snippet
                            filename=".gitlab-ci.yml"
                            code={sdk === 'npm' ? GITLAB_NPM : GITLAB_PYPI}
                        />
                    </IntegrationRow>
                    <IntegrationRow id="cli-local" label="Local CLI (laptop / dev)" hint="Same SDK on developer machines" open={openIntegration} setOpen={setOpenIntegration}>
                        <Snippet
                            filename="shell"
                            code={sdk === 'npm' ? LOCAL_NPM : LOCAL_PYPI}
                        />
                    </IntegrationRow>
                </div>
            </section>
        </div>
    );
}

function IntegrationRow({ id, label, hint, open, setOpen, children }) {
    const isOpen = open === id;
    return (
        <div className="px-5 py-3">
            <button
                onClick={() => setOpen(isOpen ? null : id)}
                className="w-full text-left flex items-center justify-between gap-3 cursor-pointer"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <CaretRight size={12} weight="bold" className={`text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{hint}</div>
                    </div>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">{isOpen ? 'hide' : 'view'}</span>
            </button>
            {isOpen && <div className="mt-3 pl-6">{children}</div>}
        </div>
    );
}

function Snippet({ filename, code }) {
    const [copied, setCopied] = useState(false);
    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch {}
    };
    return (
        <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
            <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                <span className="font-mono normal-case">{filename}</span>
                <button onClick={onCopy} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer">
                    <Copy size={11} weight="bold" />
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <pre className="px-3 py-3 text-[11px] leading-snug overflow-x-auto text-slate-800 dark:text-slate-200">
                <code className="font-mono">{code}</code>
            </pre>
        </div>
    );
}

// Real bastion-red CLI. Same flags in both SDKs since both publish
// from the same source. Hosted runner URL points at the production
// bastion-runner service; CI step exits non-zero on any new high-or-
// critical finding, which blocks the merge / fails the pipeline.

const GH_ACTIONS_NPM = `name: Bastion Attestation

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  attest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Install Bastion SDK
        run: npm install -g @pistonsolutions/bastion@0.4.12

      - name: Run attestation
        env:
          BASTION_API_KEY: \${{ secrets.BASTION_API_KEY }}
        run: |
          bastion run \\
            --scope ./SCOPE.md \\
            --runner https://bastion-runner.pistonsolutions.ai \\
            --output bastion-report.json \\
            --no-tui

      - name: Upload Posture Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: posture-report
          path: bastion-report.json
`;

const GH_ACTIONS_PYPI = `name: Bastion Attestation

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  attest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }

      - name: Install Bastion SDK
        run: pip install bastion-red==0.4.12

      - name: Run attestation
        env:
          BASTION_API_KEY: \${{ secrets.BASTION_API_KEY }}
        run: |
          bastion run \\
            --scope ./SCOPE.md \\
            --runner https://bastion-runner.pistonsolutions.ai \\
            --output bastion-report.json \\
            --no-tui

      - name: Upload Posture Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: posture-report
          path: bastion-report.json
`;

const GITLAB_NPM = `bastion_attest:
  stage: test
  image: node:20-alpine
  variables:
    BASTION_API_KEY: $BASTION_API_KEY
  before_script:
    - npm install -g @pistonsolutions/bastion@0.4.12
  script:
    - bastion run
        --scope ./SCOPE.md
        --runner https://bastion-runner.pistonsolutions.ai
        --output bastion-report.json
        --no-tui
  artifacts:
    when: always
    paths: [bastion-report.json]
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
`;

const GITLAB_PYPI = `bastion_attest:
  stage: test
  image: python:3.12-slim
  variables:
    BASTION_API_KEY: $BASTION_API_KEY
  before_script:
    - pip install bastion-red==0.4.12
  script:
    - bastion run
        --scope ./SCOPE.md
        --runner https://bastion-runner.pistonsolutions.ai
        --output bastion-report.json
        --no-tui
  artifacts:
    when: always
    paths: [bastion-report.json]
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
`;

const LOCAL_NPM = `# Install once
npm install -g @pistonsolutions/bastion@0.4.12

# Authenticate (browser flow)
bastion login

# Run an assessment against your SCOPE.md
bastion run \\
  --scope ./SCOPE.md \\
  --runner https://bastion-runner.pistonsolutions.ai

# View previous runs / diff
bastion run --scope ./SCOPE.md   # auto-diffs against previous run
`;

const LOCAL_PYPI = `# Install once
pip install bastion-red==0.4.12

# Authenticate (browser flow)
bastion login

# Run an assessment against your SCOPE.md
bastion run \\
  --scope ./SCOPE.md \\
  --runner https://bastion-runner.pistonsolutions.ai

# View previous runs / diff
bastion run --scope ./SCOPE.md   # auto-diffs against previous run
`;
