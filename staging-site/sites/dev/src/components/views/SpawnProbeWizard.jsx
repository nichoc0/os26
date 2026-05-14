import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Check, Lightning, Robot, CircleNotch, FileText, Phone, Warning } from '@phosphor-icons/react';
import { VERTICALS, VOICE_TRANSLATABLE_STRATEGIES, getVertical } from '../../data/verticalCatalog';
import { useVoiceToken } from '../../data/useVoiceToken';

const GATEWAY = (import.meta.env.VITE_VOICE_GATEWAY_URL || 'https://voice-demo.pistonsolutions.ai').replace(/\/+$/, '');

// Separate URL for the listen iframe. Cloudflared's free-tier WS routing
// adds variable jitter (50-200 ms hops) which produces audible micro-
// gaps on the audio playback path. Tailscale Funnel serves the same
// gateway port via Tailscale's DERP edge — much lower WS jitter, so
// in-iframe audio is finally clean. The HTTP spawn endpoint stays on
// voice-demo (cloudflared is fine for one-shot POSTs).
const LISTEN_GATEWAY = (import.meta.env.VITE_LISTEN_GATEWAY_URL || 'https://ncas-mac-mini.tailb4b5fb.ts.net').replace(/\/+$/, '');

// Vertical-family Spawn Probe wizard. Replaces the prior flat scenario
// list with a four-step flow:
//
//   1. Pick a vertical (Pharmacy, Medical, Finance, Cyber/OWASP, …)
//   2. Confirm the Promptfoo plugin family the vertical resolves to
//   3. Configure (target, # of attacker agents to fan out, strategies)
//   4. Spawn → progress → report lands in Reports
//
// The wizard surfaces buyer-recognizable taxonomy first (the vertical
// they think in) and only reveals plugin IDs after the vertical is
// chosen. Multi-agent fan-out is rendered as N attacker agents probing
// the single target Sera DID.

const STEPS = [
    { id: 'vertical',  label: 'Agent' },
    { id: 'plugins',   label: 'Plugin family' },
    { id: 'configure', label: 'Configure run' },
    { id: 'spawn',     label: 'Spawn & monitor' },
];

export default function SpawnProbeWizard({ setCurrentView }) {
    const [step, setStep] = useState(0);
    const [verticalId, setVerticalId] = useState(null);
    const [selectedPlugins, setSelectedPlugins] = useState([]);
    const [selectedStrategies, setSelectedStrategies] = useState(['basic']);
    const [config, setConfig] = useState({
        targetDID: '',
        attackerCount: 3,
        maxTurns: 6,
        // LiveKit-style text-level turn detector. Opt-in per probe — when
        // checked, both agents call the `bastion-livekit-turn` sidecar
        // before firing the LLM so peer turn must read as complete first.
        useTurnDetector: false,
        // Voice IDs are static on the gateway side — not surfaced as
        // config. See voice-orchestrator/src/providers/elevenlabs.rs:
        //   TARGET_VOICE_ID   = "052jzHJceQiZr7ltnY0C" (Sera)
        //   ATTACKER_VOICE_ID = "XA2bIQ92TabjGbpO2xRr" (Bastion)
    });
    const [selectedAttackerId, setSelectedAttackerId] = useState(null);
    const [spawnState, setSpawnState] = useState({ status: 'idle' });

    // Mint a Bastion API key from the Clerk session on wizard mount.
    // Used as `Authorization: Bearer bk_*` on every gateway POST so the
    // voice run gets attributed to the right Clerk org's posture report.
    // Cached per (user, org) in sessionStorage by useVoiceToken so we
    // don't mint a fresh key on every wizard render.
    const { apiKey: voiceToken, orgId: voiceOrgId, status: voiceTokenStatus, mint: refreshVoiceToken } = useVoiceToken();

    const vertical = verticalId ? getVertical(verticalId) : null;

    const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
    const back = () => setStep((s) => Math.max(s - 1, 0));

    const pickVertical = (id) => {
        const v = getVertical(id);
        setVerticalId(id);
        setSelectedPlugins(v.plugins.map((p) => p.id));
        setSelectedStrategies(v.defaultStrategies);
        setConfig((c) => ({ ...c, targetDID: v.targetDID || '' }));
        setStep(1);
    };

    const togglePlugin = (pluginId) => {
        setSelectedPlugins((prev) =>
            prev.includes(pluginId) ? prev.filter((p) => p !== pluginId) : [...prev, pluginId]
        );
    };
    const toggleStrategy = (sid) => {
        setSelectedStrategies((prev) =>
            prev.includes(sid) ? prev.filter((s) => s !== sid) : [...prev, sid]
        );
    };

    const canAdvance = () => {
        if (step === 0) return verticalId !== null;
        if (step === 1) return selectedPlugins.length > 0 || verticalId === 'custom';
        if (step === 2) return true;
        return true;
    };

    // Build the fan-out matrix from the wizard's selections, then cap
    // total probes at MAX_TOTAL_PROBES. The cap is on TOTAL calls fired
    // — not just attacker count — so 5 attackers × 10 plugins still
    // ships only 5 calls. This is the hard ceiling: do not raise it
    // without an explicit decision; voice probes burn Groq + ElevenLabs
    // + Deepgram tokens and saturated Telnyx CPS fast on 2026-05-10.
    const MAX_TOTAL_PROBES = 5;
    const buildAttackerPlan = () => {
        const plan = [];
        const plugins = selectedPlugins.length > 0 ? selectedPlugins : [vertical?.id === 'custom' ? 'custom' : 'behavioral'];
        const strategies = selectedStrategies.length > 0 ? selectedStrategies : ['basic'];
        // Resolve the human-friendly label for each plugin id from the
        // vertical's catalog so AttackerRow can render a clean name
        // ("Dosage calculation") instead of the raw plugin id
        // ("pharmacy:dosage-calculation") — buyer-facing copy, no IDs.
        const labelByPluginId = new Map((vertical?.plugins || []).map((p) => [p.id, p.label]));
        const humanLabel = (id) => labelByPluginId.get(id) || id;
        for (let a = 0; a < config.attackerCount; a += 1) {
            for (let p = 0; p < plugins.length; p += 1) {
                plan.push({
                    attacker_index: a,
                    plugin_id: plugins[p],
                    plugin_label: humanLabel(plugins[p]),
                    strategy_id: strategies[(a + p) % strategies.length],
                });
            }
        }
        return plan.slice(0, MAX_TOTAL_PROBES);
    };

    const spawn = async () => {
        const plan = buildAttackerPlan();
        const total = plan.length;
        setSpawnState({
            status: 'spawning',
            completed: 0,
            total,
            attackers: plan.map((entry, i) => ({ ...entry, id: i, status: 'queued', call_control_id: null, error: null })),
        });

        // Sequential dial. Voice-gateway expects one originate at a time
        // (Telnyx CPS + ConversationState bookkeeping). For N=4-16 this
        // is fine; concurrent fan-out is v1.1.
        for (let i = 0; i < plan.length; i += 1) {
            const entry = plan[i];
            // mark this row as in-flight
            setSpawnState((prev) => {
                if (prev.status !== 'spawning') return prev;
                const next = { ...prev, attackers: [...prev.attackers] };
                next.attackers[i] = { ...next.attackers[i], status: 'dialing' };
                return next;
            });

            try {
                const body = {
                    target_session_type: 'sera',
                    use_turn_detector: !!config.useTurnDetector,
                    adversarial_config: {
                        strategy_id: entry.strategy_id,
                        plugin_id: entry.plugin_id,
                        goal: `Vertical: ${vertical.label}. Run plugin ${entry.plugin_id} via strategy ${entry.strategy_id} against ${vertical.target}.`,
                        max_turns: config.maxTurns,
                        metadata: {
                            wizard_vertical: vertical.id,
                            attacker_index: entry.attacker_index,
                        },
                    },
                };
                // Re-mint if our cached token expired or was never available;
                // a missing bearer means the run won't show in the user's
                // Posture Report, which is worse than a 1s mint delay.
                let bearer = voiceToken;
                if (!bearer) {
                    try { bearer = await refreshVoiceToken(); } catch (_) { /* anonymous fallback */ }
                }
                const headers = { 'Content-Type': 'application/json' };
                if (bearer) headers.Authorization = `Bearer ${bearer}`;
                const resp = await fetch(`${GATEWAY}/v1/test/agent-vs-agent`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                });
                const json = resp.ok ? await resp.json() : null;
                const callId = json?.target_call_id || json?.call_control_id || json?.attacker_call_id || null;

                setSpawnState((prev) => {
                    if (prev.status !== 'spawning') return prev;
                    const next = { ...prev, attackers: [...prev.attackers] };
                    next.attackers[i] = {
                        ...next.attackers[i],
                        status: resp.ok ? 'live' : 'failed',
                        call_control_id: callId,
                        error: resp.ok ? null : `HTTP ${resp.status}`,
                    };
                    next.completed = i + 1;
                    return next;
                });
            } catch (err) {
                setSpawnState((prev) => {
                    if (prev.status !== 'spawning') return prev;
                    const next = { ...prev, attackers: [...prev.attackers] };
                    next.attackers[i] = {
                        ...next.attackers[i],
                        status: 'failed',
                        error: err.message || String(err),
                    };
                    next.completed = i + 1;
                    return next;
                });
            }
            // Small delay between dials so logs are readable and we
            // don't burst Telnyx CPS.
            await new Promise((r) => setTimeout(r, 1500));
        }

        // After the last dial, leave the UI on "running" until the user
        // clicks "View Report" — the calls are still live on the gateway
        // and the embedded /listen widget keeps showing them.
        setSpawnState((prev) => ({ ...prev, status: 'running' }));
    };

    return (
        <div className="flex flex-col h-full">
            <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Spawn QA Probe</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Pick the agent under test, confirm the Promptfoo plugin family, fan out N agents against the target voice agent. Results land in Reports.
                        </p>
                    </div>
                </div>
                <StepIndicator step={step} steps={STEPS} />
            </header>

            <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 px-6 py-6">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                    >
                        {step === 0 && <VerticalStep onPick={pickVertical} />}
                        {step === 1 && vertical && <PluginsStep vertical={vertical} selectedPlugins={selectedPlugins} onToggle={togglePlugin} selectedStrategies={selectedStrategies} onToggleStrategy={toggleStrategy} />}
                        {step === 2 && vertical && <ConfigureStep vertical={vertical} config={config} setConfig={setConfig} selectedPlugins={selectedPlugins} selectedStrategies={selectedStrategies} />}
                        {step === 3 && vertical && (
                            <SpawnStep
                                vertical={vertical}
                                config={config}
                                selectedPlugins={selectedPlugins}
                                selectedStrategies={selectedStrategies}
                                state={spawnState}
                                onSpawn={spawn}
                                onViewReport={() => setCurrentView('reports')}
                                selectedAttackerId={selectedAttackerId}
                                onSelectAttacker={setSelectedAttackerId}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            <footer className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between">
                <button
                    onClick={back}
                    disabled={step === 0}
                    className={`inline-flex items-center gap-1.5 text-sm font-medium ${step === 0 ? 'text-slate-400 cursor-not-allowed' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer'}`}
                >
                    <ArrowLeft size={14} weight="bold" />
                    Back
                </button>
                <div className="text-[10px] uppercase tracking-widest text-slate-400">
                    Step {step + 1} of {STEPS.length}
                </div>
                {step < STEPS.length - 1 ? (
                    <button
                        onClick={next}
                        disabled={!canAdvance()}
                        className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest px-5 py-2.5 border ${canAdvance() ? 'border-blue-500 text-white bg-blue-500 hover:bg-blue-600 hover:border-blue-600 cursor-pointer' : 'border-slate-300 dark:border-slate-700 text-slate-400 bg-slate-100 dark:bg-slate-800 cursor-not-allowed'} transition-colors`}
                    >
                        Continue
                        <ArrowRight size={12} weight="bold" />
                    </button>
                ) : <span />}
            </footer>
        </div>
    );
}

function StepIndicator({ step, steps }) {
    return (
        <div className="flex items-center gap-2">
            {steps.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                    <div className={`flex items-center gap-2 px-2 py-1 ${i === step ? 'text-blue-600 dark:text-blue-400' : i < step ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600'}`}>
                        <div className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold border ${i < step ? 'bg-blue-500 border-blue-500 text-white' : i === step ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-slate-300 dark:border-slate-700'}`}>
                            {i < step ? <Check size={10} weight="bold" /> : i + 1}
                        </div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider">{s.label}</span>
                    </div>
                    {i < steps.length - 1 && <span className={`flex-1 h-px w-8 ${i < step ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-800'}`} />}
                </div>
            ))}
        </div>
    );
}

function VerticalStep({ onPick }) {
    return (
        <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Pick an agent</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">Each agent type resolves to a curated Promptfoo plugin family tailored for voice testing.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {VERTICALS.map((v) => {
                    const Icon = v.icon;
                    return (
                        <button
                            key={v.id}
                            onClick={() => onPick(v.id)}
                            className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-blue-400 hover:shadow cursor-pointer transition-all group"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                    <Icon size={18} weight="bold" className="text-slate-600 dark:text-slate-300" />
                                </div>
                                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                    {v.plugins.length} plugins
                                </span>
                            </div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400">{v.label}</h3>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-snug">{v.summary}</p>
                            {v.frameworks.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {v.frameworks.map((f) => (
                                        <span key={f} className="text-[9px] font-semibold px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                                            {f}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function PluginsStep({ vertical, selectedPlugins, onToggle, selectedStrategies, onToggleStrategy }) {
    if (vertical.id === 'custom') {
        return (
            <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Custom probe — no plugin family</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">Custom probes skip the plugin catalog; you configure the goal + QA rule on the next step.</p>
            </div>
        );
    }
    return (
        <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                {vertical.label} plugin family
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                Pulled from Promptfoo's <code className="font-mono text-[10px] px-1 bg-slate-100 dark:bg-slate-800 rounded">{vertical.id}:*</code> + related families. Uncheck any plugin you don't want to run.
            </p>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mb-6">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Plugins</span>
                        <span className="text-[10px] text-slate-500">{selectedPlugins.length} of {vertical.plugins.length} selected</span>
                    </div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {vertical.plugins.map((p) => {
                        const checked = selectedPlugins.includes(p.id);
                        return (
                            <label key={p.id} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggle(p.id)}
                                    className="w-4 h-4 accent-blue-500 cursor-pointer mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2 mb-0.5">
                                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{p.label}</span>
                                        <code className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{p.id}</code>
                                    </div>
                                    {p.description && (
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{p.description}</p>
                                    )}
                                </div>
                            </label>
                        );
                    })}
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Adversarial strategies</span>
                        <span className="text-[10px] text-slate-500">{selectedStrategies.length} selected</span>
                    </div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {VOICE_TRANSLATABLE_STRATEGIES.map((s) => {
                        const checked = selectedStrategies.includes(s.id);
                        return (
                            <label key={s.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggleStrategy(s.id)}
                                    className="w-4 h-4 accent-blue-500 cursor-pointer"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.label}</div>
                                    <div className="text-[10px] text-slate-500">{s.description}</div>
                                </div>
                            </label>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function ConfigureStep({ vertical, config, setConfig, selectedPlugins, selectedStrategies }) {
    const totalProbes = config.attackerCount * Math.max(selectedPlugins.length, 1) * Math.max(selectedStrategies.length, 1);
    const estMinutes = Math.ceil((totalProbes * 90) / 60);

    return (
        <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Configure the run</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">Target + multi-agent fan-out + voices.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Field label="Target DID">
                    <input
                        type="text"
                        value={config.targetDID}
                        onChange={(e) => setConfig((c) => ({ ...c, targetDID: e.target.value }))}
                        placeholder={vertical.targetDID || '+1 555 555 5555'}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                    {vertical.targetDID && <div className="text-[10px] text-slate-500 mt-1">Default target: {vertical.target} ({vertical.targetDID})</div>}
                </Field>
                <Field label="Number of agents (fan-out)">
                    <input
                        type="number"
                        min={1}
                        max={5}
                        value={config.attackerCount}
                        onChange={(e) => setConfig((c) => ({ ...c, attackerCount: Math.max(1, Math.min(5, Number(e.target.value) || 1)) }))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                    <div className="text-[10px] text-slate-500 mt-1">Each agent runs every selected plugin × strategy combo independently. Capped at 5 to keep the run honest.</div>
                </Field>
                <Field label="Max turns per probe">
                    <input
                        type="number"
                        min={2}
                        max={20}
                        value={config.maxTurns}
                        onChange={(e) => setConfig((c) => ({ ...c, maxTurns: Math.max(2, Math.min(20, Number(e.target.value) || 6)) }))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                </Field>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2">
                <strong className="text-slate-700 dark:text-slate-200">Voices are fixed by Bastion</strong> — attacker uses one voice across every probe, Sera target uses one voice across every persona. Not configurable per run (audit-grade reproducibility).
            </div>

            <label className="flex items-start gap-2 mb-4 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={!!config.useTurnDetector}
                    onChange={(e) => setConfig((c) => ({ ...c, useTurnDetector: e.target.checked }))}
                    className="mt-0.5"
                />
                <span className="text-[11px] text-slate-700 dark:text-slate-200">
                    <strong>LiveKit-style turn detector (experimental).</strong>
                    <span className="text-slate-500 dark:text-slate-400"> Adds a text-level "is the peer done speaking?" check before each LLM fire. Biases toward latency over overlap. Requires the <code>bastion-livekit-turn</code> sidecar to be running.</span>
                </span>
            </label>

            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300 mb-2">
                    Run summary
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat label="Agents" value={config.attackerCount} />
                    <Stat label="Plugins" value={selectedPlugins.length || 1} />
                    <Stat label="Strategies" value={selectedStrategies.length} />
                    <Stat label="Total probes" value={totalProbes} accent="blue" />
                </div>
                <div className="text-[11px] text-blue-900 dark:text-blue-200 mt-3">
                    Estimated wall-clock: <strong>~{estMinutes} min</strong> at sequential dial (90 s/call). Cap is 5 agents to keep the run honest.
                </div>
            </div>
        </div>
    );
}

function SpawnStep({ vertical, config, selectedPlugins, selectedStrategies, state, onSpawn, onViewReport, selectedAttackerId, onSelectAttacker }) {
    // Auto-select the first live attacker so the transcript pane has
    // something to show as soon as a call connects, without the user
    // having to click.
    useEffect(() => {
        if (selectedAttackerId) return;
        const firstLive = state.attackers?.find((a) => a.call_control_id);
        if (firstLive) onSelectAttacker?.(firstLive.id);
    }, [state.attackers, selectedAttackerId, onSelectAttacker]);
    if (state.status === 'idle') {
        const total = config.attackerCount * Math.max(selectedPlugins.length, 1);
        return (
            <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center">
                <div className="mx-auto w-14 h-14 flex items-center justify-center bg-blue-500 mb-4">
                    <Lightning size={28} weight="bold" className="text-white" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Ready to spawn</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                    {config.attackerCount} agents will dial <strong>{vertical.target}</strong> sequentially, each running one of {selectedPlugins.length || 1} plugin{(selectedPlugins.length || 1) === 1 ? '' : 's'} via one of {selectedStrategies.length} strategy/strategies. Calls appear live in the transcript below as they connect.
                </p>
                <p className="text-[10px] text-amber-700 dark:text-amber-400 mb-6">
                    <Warning size={10} weight="bold" className="inline mr-1" />
                    This fires <strong>{total} calls</strong> against {vertical.target} via {GATEWAY.replace('https://', '')}. Make sure the gateway and the target DID are configured.
                </p>
                <button
                    onClick={onSpawn}
                    className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest px-6 py-3 border border-blue-500 text-white bg-blue-500 hover:bg-blue-600 hover:border-blue-600 cursor-pointer transition-colors"
                >
                    <Lightning size={12} weight="bold" />
                    Spawn {total} Probe{total === 1 ? '' : 's'}
                </button>
            </div>
        );
    }

    const pct = state.total > 0 ? Math.round((state.completed / state.total) * 100) : 0;
    const live = state.attackers?.filter((a) => a.status === 'live').length || 0;
    const failed = state.attackers?.filter((a) => a.status === 'failed').length || 0;

    return (
        <div className="max-w-6xl mx-auto space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
                <div className="flex items-center gap-3 mb-4">
                    {state.status === 'spawning' ? (
                        <CircleNotch size={20} className="text-blue-500 animate-spin" weight="bold" />
                    ) : (
                        <Phone size={20} className="text-emerald-500" weight="bold" />
                    )}
                    <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {state.status === 'spawning' ? 'Dialing agents…' : 'All agents dispatched · calls live'}
                        </div>
                        <div className="text-[11px] text-slate-500">Live transcript below. Each call's call_control_id ties back to the gateway's audit log.</div>
                    </div>
                    <div className="ml-auto text-right">
                        <div className="text-xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{pct}%</div>
                        <div className="text-[10px] text-slate-500">{state.completed} / {state.total} dispatched · {live} live · {failed} failed</div>
                    </div>
                </div>
                <div className="h-2 bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
            </div>

            <AttackerListWithTranscript
                attackers={state.attackers || []}
                selectedId={selectedAttackerId}
                onSelect={onSelectAttacker}
            />

            {state.status === 'running' && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-4 flex items-center justify-between">
                    <div>
                        <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Calls dispatched · run is in progress</div>
                        <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
                            Calls stay live on the gateway. When grading completes, a new Posture Report appears in the Reports section.
                        </div>
                    </div>
                    <button
                        onClick={onViewReport}
                        className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest px-5 py-2.5 border border-blue-500 text-white bg-blue-500 hover:bg-blue-600 cursor-pointer"
                    >
                        <FileText size={12} weight="bold" />
                        View Reports
                        <ArrowRight size={12} weight="bold" />
                    </button>
                </div>
            )}
        </div>
    );
}

function AttackerListWithTranscript({ attackers, selectedId, onSelect }) {
    const selected = attackers.find((a) => a.id === selectedId);
    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Agents ({attackers.length})</span>
                    <span className="font-normal text-slate-400 normal-case tracking-normal">click an agent to listen in</span>
                </div>
                <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
                    {attackers.map((a) => (
                        <AttackerRow
                            key={a.id}
                            attacker={a}
                            selected={a.id === selectedId}
                            onClick={() => onSelect?.(a.id)}
                        />
                    ))}
                </div>
            </div>
            <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        {selected ? `Live transcript · Agent-${String(selected.attacker_index + 1).padStart(2, '0')}` : 'Live transcript'}
                    </div>
                    {selected?.call_control_id && (
                        <a
                            href={`${LISTEN_GATEWAY}/listen?call_id=${encodeURIComponent(selected.call_control_id)}&embed=1`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            open in new tab ↗
                        </a>
                    )}
                </div>
                <div className="border border-slate-200 dark:border-slate-800 bg-black overflow-hidden" style={{ height: '480px' }}>
                    {selected?.call_control_id ? (
                        <LiveTranscriptFrame
                            callId={selected.call_control_id}
                            label={`Live transcript Attacker-${selected.attacker_index + 1}`}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                            {selected ? 'Waiting for this attacker to connect…' : 'Select an attacker to listen in.'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function AttackerRow({ attacker, selected, onClick }) {
    const statusMeta = {
        queued:  { dot: 'bg-slate-300 dark:bg-slate-600', text: 'text-slate-500', label: 'Queued' },
        dialing: { dot: 'bg-amber-400 animate-pulse',     text: 'text-amber-700 dark:text-amber-400', label: 'Dialing…' },
        live:    { dot: 'bg-emerald-500',                 text: 'text-emerald-700 dark:text-emerald-400', label: 'Live' },
        failed:  { dot: 'bg-rose-500',                    text: 'text-rose-700 dark:text-rose-400', label: 'Failed' },
    };
    const meta = statusMeta[attacker.status] || statusMeta.queued;
    const clickable = !!onClick && (attacker.status === 'live' || attacker.status === 'dialing');
    return (
        <button
            type="button"
            onClick={clickable ? onClick : undefined}
            disabled={!clickable}
            className={`w-full text-left bg-white dark:bg-slate-900 border px-3 py-2.5 transition-colors ${selected ? 'border-blue-500 ring-1 ring-blue-500/40' : 'border-slate-200 dark:border-slate-800'} ${clickable ? 'hover:border-blue-400 cursor-pointer' : 'cursor-default'}`}
        >
            <div className="flex items-center gap-2 mb-1">
                <span className={`inline-block w-2 h-2 rounded-full ${meta.dot}`} />
                <Robot size={12} weight="bold" className="text-slate-500" />
                <span className="text-[11px] font-mono text-slate-700 dark:text-slate-200 flex-1">
                    Agent-{String(attacker.attacker_index + 1).padStart(2, '0')}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.text}`}>{meta.label}</span>
            </div>
            <div
                className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2 mt-0.5"
                title={attacker.call_control_id || ''}
            >
                <span>{attacker.plugin_label || attacker.plugin_id}</span>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="text-slate-500 dark:text-slate-400">{attacker.strategy_id}</span>
            </div>
            {attacker.error && (
                <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-1">{attacker.error}</div>
            )}
        </button>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">
                {label}
            </label>
            {children}
        </div>
    );
}

function SeverityBadge({ severity }) {
    const meta = {
        critical: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800',
        high:     'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800',
        medium:   'bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800',
        low:      'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    };
    return (
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border ${meta[severity] || meta.low}`}>
            {severity}
        </span>
    );
}

function Stat({ label, value, accent }) {
    return (
        <div>
            <div className={`text-lg font-bold tabular-nums ${accent === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-slate-100'}`}>{value}</div>
            <div className="text-[9px] uppercase tracking-widest text-slate-400">{label}</div>
        </div>
    );
}

// LiveTranscriptFrame — keeps a single iframe mounted across attacker
// switches. Initial mount loads `?call_id=<first>&embed=1`; every
// subsequent attacker click postMessages a `switchCall` to the same
// frame, so the document/CSS/JS + AudioContext are reused. Saves ~500-
// 1000 ms per switch vs the prior key= remount that forced a full
// document boot every time.
function LiveTranscriptFrame({ callId, label }) {
    const initialSrc = useRef(`${LISTEN_GATEWAY}/listen?call_id=${encodeURIComponent(callId)}&embed=1`);
    const iframeRef = useRef(null);
    const readyRef = useRef(false);
    const pendingRef = useRef(null);
    const lastSentRef = useRef(callId);

    // Listen for the iframe's `listenReady` ping so we can flush any
    // call_id that landed before the doc finished booting.
    useEffect(() => {
        const onMessage = (evt) => {
            if (!evt.data || typeof evt.data !== 'object') return;
            if (evt.data.type !== 'listenReady') return;
            readyRef.current = true;
            if (pendingRef.current && iframeRef.current?.contentWindow) {
                try {
                    iframeRef.current.contentWindow.postMessage(
                        { type: 'switchCall', call_id: pendingRef.current },
                        '*'
                    );
                    lastSentRef.current = pendingRef.current;
                } catch (_) {}
                pendingRef.current = null;
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, []);

    // On callId change, postMessage if the iframe is ready; otherwise
    // queue it. The very first mount uses src=, so we skip messaging
    // when the new callId equals the initial one we already loaded via
    // the URL.
    useEffect(() => {
        if (callId === lastSentRef.current) return;
        if (readyRef.current && iframeRef.current?.contentWindow) {
            try {
                iframeRef.current.contentWindow.postMessage(
                    { type: 'switchCall', call_id: callId },
                    '*'
                );
                lastSentRef.current = callId;
            } catch (_) {
                pendingRef.current = callId;
            }
        } else {
            pendingRef.current = callId;
        }
    }, [callId]);

    return (
        <iframe
            ref={iframeRef}
            src={initialSrc.current}
            title={label}
            className="w-full h-full"
            style={{ border: 0 }}
            allow="autoplay; microphone"
            allowFullScreen
        />
    );
}
