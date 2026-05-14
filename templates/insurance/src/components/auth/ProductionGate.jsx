/**
 * ProductionGate wraps the dashboard for the production app.
 *
 * Demo mode (VITE_APP_MODE !== 'production'): passthrough.
 * Production mode: enforces signed-in + org-membership; routes through Onboarding
 * if user has no org.
 */
import { SignedIn, SignedOut, SignIn, useOrganization, useUser } from '@clerk/clerk-react';
import { Spinner } from '@phosphor-icons/react';
import Onboarding from '../onboarding/Onboarding';

function GateShell({ subtitle, wide = false, children }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1120] flex flex-col items-center justify-center p-6 relative">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none dark:opacity-[0.04]"
        style={{
          backgroundSize: '40px 40px',
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
        }}
      />
      <div className={`relative z-10 flex flex-col items-center w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="flex items-center gap-3 mb-6">
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
              {subtitle}
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function OrgGate({ children }) {
  const { organization, isLoaded } = useOrganization();
  const { user } = useUser();

  if (!isLoaded) {
    return (
      <GateShell subtitle="loading">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-sm">
          <Spinner size={18} className="animate-spin text-blue-500" />
          Checking workspace…
        </div>
      </GateShell>
    );
  }

  const hasAnyOrg = !!organization
    || (user?.organizationMemberships?.length ?? 0) > 0;
  if (!hasAnyOrg) {
    return <Onboarding />;
  }

  return children;
}

export default function ProductionGate({ children }) {
  const mode = import.meta.env.VITE_APP_MODE;
  if (mode !== 'production') {
    return children;
  }

  return (
    <>
      <SignedOut>
        <GateShell subtitle="Sign in to your workspace">
          <SignIn routing="hash" signUpUrl="/?action=sign-up" />
        </GateShell>
      </SignedOut>
      <SignedIn>
        <OrgGate>{children}</OrgGate>
      </SignedIn>
    </>
  );
}
