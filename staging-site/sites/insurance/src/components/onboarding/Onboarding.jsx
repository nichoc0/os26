/**
 * Onboarding: first-login flow for the production app.
 */
import { useState } from 'react';
import {
  useOrganization,
  useOrganizationList,
} from '@clerk/clerk-react';
import {
  Buildings,
  Users,
  Code,
  ArrowRight,
  CheckCircle,
  Copy,
  Plus,
  X,
  Spinner,
  EnvelopeSimple,
} from '@phosphor-icons/react';

function StepHeader({ index, total, title, blurb }) {
  return (
    <div className="mb-6">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400 mb-2">
        Step {index} of {total}
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
      {blurb && <p className="text-[12px] text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">{blurb}</p>}
    </div>
  );
}

function CopyableCommand({ children }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) { /* clipboard API blocked, silent */ }
  };
  return (
    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 group">
      <code className="text-[11px] font-mono text-slate-700 dark:text-slate-300 flex-1 break-all">{children}</code>
      <button
        onClick={handleCopy}
        className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-blue-500 cursor-pointer bg-transparent border border-slate-300 dark:border-slate-700 hover:border-blue-500 px-2 py-0.5 transition-colors"
      >
        {copied ? <CheckCircle size={11} weight="bold" /> : <Copy size={11} weight="bold" />}
      </button>
    </div>
  );
}

/**
 * Manual org-creation form. Calls useOrganizationList().createOrganization
 * directly so we own the UI instead of embedding Clerk's component.
 */
function ManualOrgForm({ onCreated }) {
  const { createOrganization, setActive } = useOrganizationList();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState(null);

  if (typeof createOrganization !== 'function') {
    return (
      <div className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-[12px] text-amber-900 dark:text-amber-200 leading-snug">
        <strong>Organizations are not enabled on this Clerk app.</strong>
        <p className="mt-1.5 text-[11px] text-amber-800 dark:text-amber-300">
          In the Clerk dashboard → Configure → Organizations → enable. Then refresh this page.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      const org = await createOrganization({ name: name.trim() });
      if (org && setActive) {
        await setActive({ organization: org.id });
      }
      onCreated?.(org);
    } catch (e) {
      const first = e?.errors?.[0];
      const detailParts = [];
      if (first?.message) detailParts.push(first.message);
      if (first?.long_message && first.long_message !== first.message) detailParts.push(first.long_message);
      if (first?.code) detailParts.push(`code: ${first.code}`);
      const detail = detailParts.length ? detailParts.join(' · ') : (e?.message || 'Failed to create organization');
      setErr(detail);
      console.error('[onboarding] createOrganization failed', e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-1.5">
          Organization name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your company name"
          autoFocus
          className="w-full px-3 py-2 text-[13px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-none focus:outline-none focus:border-blue-500"
        />
      </div>
      {err && (
        <div className="border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300">
          {err}
        </div>
      )}
      <button
        type="submit"
        disabled={!name.trim() || creating}
        className={`w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors rounded-none border-none ${
          name.trim() && !creating
            ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
            : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed'
        }`}
      >
        {creating ? (<><Spinner size={12} className="animate-spin" />Creating…</>) : (<>Create organization <ArrowRight size={12} weight="bold" /></>)}
      </button>
    </form>
  );
}

function CreateOrgStep({ onNext }) {
  const { organization } = useOrganization();

  if (organization) {
    return (
      <div>
        <StepHeader
          index={1}
          total={3}
          title="Workspace ready"
          blurb="Your organization is set up. You can add members in the next step."
        />
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 px-4 py-3 mb-4 flex items-center gap-3">
          <CheckCircle size={20} weight="fill" className="text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">{organization.name}</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">{organization.id}</div>
          </div>
        </div>
        <button
          onClick={onNext}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 cursor-pointer transition-colors rounded-none border-none"
        >
          Continue <ArrowRight size={12} weight="bold" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        index={1}
        total={3}
        title="Create your organization"
        blurb="A workspace where your team's agent telemetry, scopes, and policies live. You can rename it or invite members later."
      />
      <ManualOrgForm onCreated={() => { /* useOrganization picks up the new active org via Clerk's hooks */ }} />
    </div>
  );
}

function InviteStep({ onNext, onSkip }) {
  const { organization, invitations } = useOrganization({ invitations: true });
  const [emailDraft, setEmailDraft] = useState('');
  const [pending, setPending] = useState([]); // emails the user has typed but not sent
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);

  const addEmail = () => {
    const e = emailDraft.trim();
    if (!e || pending.includes(e)) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setErr(`'${e}' doesn't look like a valid email`);
      return;
    }
    setPending([...pending, e]);
    setEmailDraft('');
    setErr(null);
  };

  const removeEmail = (e) => setPending(pending.filter((x) => x !== e));

  const sendInvites = async () => {
    if (!organization || pending.length === 0) return;
    setSending(true);
    setErr(null);
    try {
      await Promise.all(pending.map((email) =>
        organization.inviteMember({ emailAddress: email, role: 'org:member' })
      ));
      setPending([]);
      onNext();
    } catch (e) {
      setErr(e?.errors?.[0]?.message || e?.message || 'Some invites failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <StepHeader
        index={2}
        total={3}
        title="Invite your team"
        blurb="Members can author scopes, view findings, and run assessments. Invite by email and they'll get a sign-up link. You can skip and add people later."
      />

      <div className="space-y-3 mb-5">
        <div className="flex gap-2">
          <input
            type="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
            placeholder="teammate@yourcompany.com"
            className="flex-1 px-3 py-2 text-[13px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-none focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={addEmail}
            type="button"
            className="px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-blue-500 cursor-pointer transition-colors rounded-none flex items-center gap-1.5"
          >
            <Plus size={12} weight="bold" /> Add
          </button>
        </div>

        {err && (
          <div className="border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300">
            {err}
          </div>
        )}

        {pending.length > 0 && (
          <div className="border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
            {pending.map((e) => (
              <div key={e} className="flex items-center gap-2 px-3 py-2">
                <EnvelopeSimple size={14} className="text-slate-400 shrink-0" />
                <span className="text-[12px] text-slate-700 dark:text-slate-300 flex-1 truncate font-mono">{e}</span>
                <button
                  onClick={() => removeEmail(e)}
                  className="text-slate-400 hover:text-rose-500 cursor-pointer bg-transparent border-0 p-0"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        )}

        {invitations?.data?.length > 0 && (
          <div className="text-[11px] text-slate-500 dark:text-slate-500">
            {invitations.data.length} invite{invitations.data.length === 1 ? '' : 's'} already sent for this organization.
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onSkip}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300 bg-transparent border border-slate-300 dark:border-slate-700 hover:border-slate-500 cursor-pointer transition-colors rounded-none"
        >
          Skip for now
        </button>
        <button
          onClick={pending.length > 0 ? sendInvites : onNext}
          disabled={sending}
          className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 cursor-pointer transition-colors rounded-none border-none"
        >
          {sending ? (<><Spinner size={12} className="animate-spin" />Sending…</>)
            : pending.length > 0 ? (<>Send {pending.length} {pending.length === 1 ? 'invite' : 'invites'} & continue <ArrowRight size={12} weight="bold" /></>)
            : (<>Continue <ArrowRight size={12} weight="bold" /></>)}
        </button>
      </div>
    </div>
  );
}

function SeedDataStep({ onFinish }) {
  return (
    <div>
      <StepHeader
        index={3}
        total={3}
        title="Seed your data"
        blurb="Bastion is SDK-first. Install the package in your agent's repo, log in once to mint an API key, then start emitting telemetry. Your dashboard fills in real-time."
      />
      <div className="space-y-3 mb-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">1. Install</div>
          <CopyableCommand>pip install bastion-red</CopyableCommand>
          <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">or for Node: <code className="font-mono">npm i -g @pistonsolutions/bastion</code></div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">2. Authenticate</div>
          <CopyableCommand>bastion login</CopyableCommand>
          <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">opens a browser, signs you in here, mints a key in <code className="font-mono">~/.bastion/credentials.json</code></div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">3. Initialize a scope</div>
          <CopyableCommand>bastion init</CopyableCommand>
          <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">scaffolds <code className="font-mono">.bastion/</code> in your repo</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">4. Run an assessment</div>
          <CopyableCommand>bastion assessment --qa-only --no-tui</CopyableCommand>
          <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">findings appear in this dashboard within seconds</div>
        </div>
      </div>
      <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex items-start gap-2 text-[10px] text-slate-500 dark:text-slate-500 mb-5">
        <Code size={12} className="mt-0.5 shrink-0" />
        <span>
          Full integration docs at{' '}
          <a href="https://demo.pistonsolutions.ai/docs" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline">
            demo.pistonsolutions.ai/docs
          </a>
        </span>
      </div>
      <button
        onClick={onFinish}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 cursor-pointer transition-colors rounded-none border-none"
      >
        Enter dashboard <ArrowRight size={12} weight="bold" />
      </button>
    </div>
  );
}

const STEPS = [
  { id: 'org',    Icon: Buildings, label: 'Create org' },
  { id: 'invite', Icon: Users,     label: 'Invite team' },
  { id: 'seed',   Icon: Code,      label: 'Seed data' },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const stepId = STEPS[step].id;
  const { organization } = useOrganization();

  const handleFinish = () => {
    if (typeof window !== 'undefined') {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
      window.location.href = `${base}/`;
    }
  };

  // If user advances to step 2 without an org somehow, bounce them back.
  const canAdvance = step === 0 ? !!organization : true;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] flex flex-col p-6 relative">
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04] pointer-events-none"
        style={{
          backgroundSize: '40px 40px',
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
        }}
      />

      <header className="relative z-10 flex items-center gap-3 mb-10 max-w-3xl mx-auto w-full pt-2">
        <div className="w-10 h-10 bg-black border-2 border-slate-600 dark:border-slate-700 flex items-center justify-center overflow-hidden p-1.5 rounded-none shadow-sm">
          <img
            src={`${import.meta.env.BASE_URL}bastion-logo.png`}
            alt="Bastion"
            className="w-full h-full object-contain"
          />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Bastion</h1>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-[0.18em] font-semibold">
            Welcome. Let's set up your workspace
          </p>
        </div>
      </header>

      <nav className="relative z-10 mb-8 max-w-3xl mx-auto w-full flex items-center gap-3">
        {STEPS.map((s, i) => {
          const Icon = s.Icon;
          const active = i === step;
          const done = i < step;
          return (
            <div key={s.id} className="flex items-center gap-3 flex-1">
              <div
                className={`w-8 h-8 flex items-center justify-center border ${
                  done
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : active
                    ? 'bg-blue-600/10 border-blue-500 text-blue-600 dark:text-blue-300'
                    : 'bg-transparent border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                }`}
              >
                {done ? <CheckCircle size={14} weight="fill" /> : <Icon size={14} weight="bold" />}
              </div>
              <div className="hidden sm:block">
                <div
                  className={`text-[10px] font-bold uppercase tracking-widest ${
                    active || done ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {s.label}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px ${done ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-800'}`} />
              )}
            </div>
          );
        })}
      </nav>

      <main className="relative z-10 flex-1 max-w-3xl mx-auto w-full">
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
          {stepId === 'org'    && <CreateOrgStep onNext={() => canAdvance && setStep(1)} />}
          {stepId === 'invite' && <InviteStep onNext={() => setStep(2)} onSkip={() => setStep(2)} />}
          {stepId === 'seed'   && <SeedDataStep onFinish={handleFinish} />}
        </div>
      </main>

      <footer className="relative z-10 mt-8 text-center text-[10px] text-slate-500 dark:text-slate-600 uppercase tracking-[0.18em] font-semibold">
        Bastion · Agentic Risk Infrastructure
      </footer>
    </div>
  );
}
