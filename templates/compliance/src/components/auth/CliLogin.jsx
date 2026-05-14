/**
 * /cli-login — handles the `bastion login` browser handoff.
 *
 * 1. CLI redirects browser to /cli-login?state=<state>&port=<port>
 * 2. Clerk session enforced by AuthGate
 * 3. After sign-in: fetch a Bastion API key via POST /api/sdk/api-keys
 *    with the Clerk session JWT
 * 4. Redirect window to http://127.0.0.1:<port>/callback?api_key=…&state=…
 */
import { useEffect, useState } from 'react';
import { useAuth, useUser, useOrganization, SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { CheckCircle, X, Spinner } from '@phosphor-icons/react';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');

function readQuery() {
  const q = new URLSearchParams(window.location.search);
  return { state: q.get('state') || '', port: q.get('port') || '' };
}

function buildCallbackUrl({ port, state, apiKey, user, orgId, error }) {
  const u = new URL(`http://127.0.0.1:${port}/callback`);
  u.searchParams.set('state', state);
  if (apiKey) u.searchParams.set('api_key', apiKey);
  if (user) u.searchParams.set('user', user);
  if (orgId) u.searchParams.set('org', orgId);
  if (error) u.searchParams.set('error', error);
  return u.toString();
}

function MintAndRedirect() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { organization } = useOrganization();
  const [stage, setStage] = useState('minting');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { state, port } = readQuery();
      if (!state || !port) {
        setErrMsg('Missing state/port parameters. Re-run `bastion login`.');
        setStage('error');
        return;
      }
      try {
        const token = await getToken();
        // Clerk's default JWT template carries `sub` only — org_id and email
        // need to be passed in the body so the api_keys row is minted with
        // correct attribution (whoami / dashboard scoping both key off these).
        const clerkEmail = user?.primaryEmailAddress?.emailAddress || '';
        const clerkOrgId = organization?.id || '';
        const resp = await fetch(`${API_BASE}/api/sdk/api-keys`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'cli-login', email: clerkEmail, org_id: clerkOrgId }),
        });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
        }
        const data = await resp.json();
        if (cancelled) return;
        const userEmail = data.email || user?.primaryEmailAddress?.emailAddress || '';
        const orgId = data.org_id || organization?.id || '';
        const url = buildCallbackUrl({ port, state, apiKey: data.api_key, user: userEmail, orgId });
        setStage('redirecting');
        window.location.replace(url);
      } catch (e) {
        if (cancelled) return;
        setErrMsg(e.message || String(e));
        setStage('error');
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, user, organization]);

  if (stage === 'error') {
    return (
      <Card icon={<X size={20} weight="bold" className="text-rose-500" />} title="Login failed" tone="error">
        <p>{errMsg}</p>
        <p className="mt-3 text-[11px]">Re-run <code className="text-blue-600 font-mono">bastion login</code> in your terminal.</p>
      </Card>
    );
  }
  if (stage === 'redirecting') {
    return (
      <Card icon={<CheckCircle size={20} weight="fill" className="text-emerald-500" />} title="Login complete" tone="ok">
        <p>Returning to your terminal…</p>
        <p className="mt-3 text-[11px]">If your browser doesn't redirect automatically, you can close this tab.</p>
      </Card>
    );
  }
  return (
    <Card icon={<Spinner size={20} className="text-blue-500 animate-spin" />} title="Issuing API key" tone="info">
      <p>Hold tight, Bastion is minting a CLI token and handing it back to your terminal.</p>
    </Card>
  );
}

function Card({ icon, title, children, tone }) {
  const accent =
    tone === 'error' ? 'text-rose-600'
    : tone === 'ok' ? 'text-emerald-600'
    : 'text-blue-600';
  return (
    <div className="w-full max-w-md bg-white border border-slate-200 p-8 shadow-md">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <h2 className={`text-base font-bold uppercase tracking-widest ${accent}`}>{title}</h2>
      </div>
      <div className="text-sm text-slate-700 leading-relaxed">{children}</div>
    </div>
  );
}

export default function CliLogin() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundSize: '40px 40px',
          backgroundImage:
            'linear-gradient(to right, #64748b 1px, transparent 1px), linear-gradient(to bottom, #64748b 1px, transparent 1px)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-black border-2 border-slate-700 flex items-center justify-center overflow-hidden p-1.5 rounded-none shadow-sm">
            <img
              src={`${import.meta.env.BASE_URL}bastion-logo.png`}
              alt="Bastion"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Bastion CLI</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-semibold">Sign in to authenticate the terminal</p>
          </div>
        </div>

        <SignedOut>
          <div className="w-full max-w-md">
            <SignIn routing="hash" forceRedirectUrl={typeof window !== 'undefined' ? window.location.href : undefined} />
          </div>
        </SignedOut>
        <SignedIn>
          <MintAndRedirect />
        </SignedIn>
      </div>
    </div>
  );
}
