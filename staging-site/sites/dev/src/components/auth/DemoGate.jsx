import { SignedIn, SignedOut, SignIn, useClerk } from '@clerk/clerk-react';

// Demo-access gate. Clerk-scoped — each viewer signs in with their own
// account, sessions are managed by Clerk, sign-out is per-user.
//
// The gate is ALWAYS on in deployed builds. main.jsx hardcodes a
// production Clerk publishable-key fallback, so the gate doesn't depend
// on Vercel env vars being set — flipping the demo public would require
// removing this gate, not flipping an env var.
//
// Bypass path for local dev only: set VITE_BYPASS_DEMO_GATE=1 in a
// .env.local so `npm run dev` doesn't force a sign-in round-trip while
// iterating on UI. Anything other than that opt-in renders the gate.
//
// Allowlisting (e.g. only @pistonsolutions.ai or per-customer-domain
// emails) is a follow-up: read user.primaryEmailAddress.emailAddress in
// a SignedIn-wrapped guard component and refuse to render children for
// emails not in an allowlist. For now any successful Clerk sign-in
// unlocks the demo.

export default function DemoGate({ children }) {
    if (import.meta.env.VITE_BYPASS_DEMO_GATE === '1') return children;

    return (
        <>
            <SignedIn>{children}</SignedIn>
            <SignedOut>
                <DemoSignInScreen />
            </SignedOut>
        </>
    );
}

function DemoSignInScreen() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#060B14] px-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <div className="mx-auto w-12 h-12 bg-black dark:bg-slate-950 border border-slate-300 dark:border-slate-700 flex items-center justify-center mb-4">
                        <img
                            src={`${import.meta.env.BASE_URL || '/'}bastion-logo.png`}
                            alt="Bastion"
                            className="w-7 h-7 object-contain"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                        Bastion Demo Access
                    </h1>
                </div>

                <SignIn
                    routing="hash"
                    forceRedirectUrl={typeof window !== 'undefined' ? window.location.href : undefined}
                />

                <p className="mt-6 text-[10px] text-slate-400 dark:text-slate-500 text-center">
                    Don&apos;t have access? Email{' '}
                    <a
                        href="mailto:info@pistonsolutions.ai"
                        className="text-blue-600 dark:text-blue-400 underline underline-offset-2"
                    >
                        info@pistonsolutions.ai
                    </a>
                    .
                </p>
                <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 text-center">
                    Bastion · Agentic Risk Infrastructure
                </p>
            </div>
        </div>
    );
}
