import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'

// Clerk wraps the whole app so the /cli-login route can use Clerk hooks. The
// dashboard itself is NOT auth-gated — only /cli-login renders the SignIn UI.
// Publishable key is read from VITE_CLERK_PUBLISHABLE_KEY at build time, with
// a hardcoded production fallback (the dev domain rejects localhost; for
// localhost serving, the cli-login route is exercised via staging URL).
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  || 'pk_live_Y2xlcmsucGlzdG9uc29sdXRpb25zLmFpJA';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </StrictMode>,
)
