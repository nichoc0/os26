import { SignedIn, SignedOut, SignIn, useAuth } from '@clerk/clerk-react';
import { ShieldCheck } from '@phosphor-icons/react';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-xs text-slate-500 font-mono uppercase tracking-widest">Authenticating</span>
      </div>
    </div>
  );
}

function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundSize: '40px 40px',
          backgroundImage:
            'linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)',
        }}
      />

      {/* Radial glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px]" />

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-6">
        {/* Logo + Branding */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
              <ShieldCheck size={22} weight="bold" className="text-blue-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Bastion Blue</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-semibold">AI Agent Security</p>
            </div>
          </div>
          <div className="h-px w-16 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
        </div>

        {/* Clerk SignIn with custom appearance */}
        <div className="w-full">
          <SignIn
            appearance={{
              variables: {
                colorPrimary: '#2563eb',
                colorBackground: '#0f172a',
                colorText: '#e2e8f0',
                colorTextSecondary: '#94a3b8',
                colorInputBackground: '#1e293b',
                colorInputText: '#e2e8f0',
                borderRadius: '0px',
                fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                fontSize: '13px',
              },
              elements: {
                rootBox: 'w-full',
                card: 'bg-[#0f172a] border border-slate-800 shadow-2xl shadow-blue-900/10 rounded-none w-full',
                headerTitle: 'text-white font-bold text-sm uppercase tracking-widest font-[Inter]',
                headerSubtitle: 'hidden',
                socialButtonsBlockButton:
                  'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50 hover:border-slate-600 rounded-none text-xs font-semibold transition-colors',
                socialButtonsBlockButtonText: 'text-slate-300 text-xs',
                dividerLine: 'bg-slate-800',
                dividerText: 'text-slate-500 text-[10px] uppercase tracking-widest',
                formFieldLabel: 'text-slate-400 text-[11px] uppercase tracking-wider font-semibold',
                formFieldInput:
                  'bg-[#1e293b] border-slate-700 text-slate-200 rounded-none text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 placeholder:text-slate-600',
                formButtonPrimary:
                  'bg-blue-600 hover:bg-blue-700 rounded-none text-xs font-bold uppercase tracking-widest transition-colors shadow-none',
                footerAction: 'hidden',
                footerActionLink: 'text-blue-500 hover:text-blue-400 text-xs',
                identityPreview: 'bg-slate-800/50 border-slate-700 rounded-none',
                identityPreviewText: 'text-slate-300 text-xs',
                identityPreviewEditButton: 'text-blue-500 hover:text-blue-400',
                formFieldAction: 'text-blue-500 hover:text-blue-400 text-xs',
                alertText: 'text-slate-300 text-xs',
                formFieldErrorText: 'text-red-400 text-xs',
                otpCodeFieldInput: 'bg-[#1e293b] border-slate-700 text-white rounded-none',
                formResendCodeLink: 'text-blue-500 hover:text-blue-400 text-xs',
                backLink: 'text-blue-500 hover:text-blue-400 text-xs',
                badge: 'bg-blue-600/20 text-blue-400 border-blue-500/30 rounded-none',
                avatarBox: 'rounded-none',
                logoBox: 'hidden',
                footer: 'hidden',
                poweredBy: 'hidden',
                clerkBranding: 'hidden',
              },
              layout: {
                socialButtonsPlacement: 'bottom',
                showOptionalFields: false,
                logoPlacement: 'none',
              },
            }}
            routing="hash"
          />
        </div>

      </div>
    </div>
  );
}

export function AuthGate({ children }) {
  const { isLoaded } = useAuth();

  if (!isLoaded) return <LoadingScreen />;

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut><LoginPage /></SignedOut>
    </>
  );
}
