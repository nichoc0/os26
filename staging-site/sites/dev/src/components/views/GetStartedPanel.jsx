/**
 * GetStartedPanel — shown on Overview when a tenant org has zero runs.
 * Replaces empty charts with a three-step onboarding CTA that lands the
 * user inside Test Suite so they can fire their first probe.
 */
import { Rocket, Terminal, Phone, ChatText, ArrowRight } from '@phosphor-icons/react';

export function GetStartedPanel({ setCurrentView }) {
  const goToTestSuite = () => setCurrentView && setCurrentView('voice-testing');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <Rocket size={36} weight="bold" className="mx-auto mb-3 text-blue-500" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Welcome to Bastion</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          You're signed in but haven't run an assessment yet. Pick a probe mode below to start —
          each one runs from Bastion infra against the target endpoint you point us at.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-blue-400 transition-colors">
          <ChatText size={20} weight="bold" className="text-blue-500 mb-3" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">Text Assessment</h2>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Run probes against any HTTP LLM endpoint. Covers prompt injection, PII leakage,
            jailbreak resistance, and hallucination rate. Results stream into the dashboard.
          </p>
          <code className="block mt-4 px-2 py-1.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-700 dark:text-slate-300">
            npm install -g @pistonsolutions/bastion<br />
            bastion login<br />
            bastion run --scope SCOPE.md
          </code>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-blue-400 transition-colors">
          <Terminal size={20} weight="bold" className="text-blue-500 mb-3" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">Voice WebSocket</h2>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Open a WebSocket to your voice agent and run a full adversarial conversation. Bastion
            handles STT, TTS, turn-taking, and post-call grading.
          </p>
          <code className="block mt-4 px-2 py-1.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-700 dark:text-slate-300">
            bastion voice --target-ws \<br />
            &nbsp;&nbsp;ws://your-agent/voice \<br />
            &nbsp;&nbsp;--rule "Never disclose PII"
          </code>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-blue-400 transition-colors">
          <Phone size={20} weight="bold" className="text-blue-500 mb-3" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">Telephony</h2>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Bastion places a real PSTN call to your agent's number and runs the same
            adversarial conversation over the phone.
          </p>
          <code className="block mt-4 px-2 py-1.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-700 dark:text-slate-300">
            bastion voice \<br />
            &nbsp;&nbsp;--target-did +1XXXXXXXXXX \<br />
            &nbsp;&nbsp;--rule "Verify identity first"
          </code>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-2">
        <button
          onClick={goToTestSuite}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold uppercase tracking-wider transition-colors"
        >
          Open Test Suite <ArrowRight size={14} weight="bold" />
        </button>
        <a
          href="https://bastion.pistonsolutions.ai/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Read the docs →
        </a>
      </div>
    </div>
  );
}
