/**
 * useVoiceToken — mints a Bastion API key (bk_*) for the active Clerk user
 * and caches it in sessionStorage so subsequent wizard fires reuse it.
 *
 * Flow:
 *   1. On first call, read Clerk session JWT via `getToken()`.
 *   2. POST it to `/api/sdk/api-keys` (vercel-rewritten to bastion-runner.pistonsolutions.ai)
 *      which validates the JWT, derives org_id, and mints a bk_* key.
 *   3. Cache the response in sessionStorage keyed by user+org so the
 *      table doesn't grow by one row per wizard render.
 *   4. Return the key + a manual refresh() for explicit re-mints.
 *
 * Used by SpawnProbeWizard.jsx to attach `Authorization: Bearer bk_*` to
 * every `/v1/test/agent-vs-agent` POST. Without it, gateway can't attribute
 * the run to the right Clerk org and the voice finding never lands in the
 * caller's Posture Report.
 *
 * Renaming note: this used to be planned as `/api/dashboard/voice-token`
 * but the existing `/api/sdk/api-keys` endpoint already does exactly what
 * we need. Reusing it avoids duplicate code on the backend.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth, useUser, useOrganization } from '@clerk/clerk-react';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');

function cacheKey(userId, orgId) {
  // sessionStorage scoping. Tab-local cache; cleared on close.
  return `bastion.voice-token.${userId || 'anon'}.${orgId || 'no-org'}`;
}

function readCache(userId, orgId) {
  try {
    const raw = sessionStorage.getItem(cacheKey(userId, orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.api_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(userId, orgId, payload) {
  try {
    sessionStorage.setItem(cacheKey(userId, orgId), JSON.stringify(payload));
  } catch {
    // sessionStorage may be unavailable (e.g. third-party iframe context).
    // Non-fatal — we just re-mint on next use.
  }
}

export function useVoiceToken() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { organization } = useOrganization();
  const [apiKey, setApiKey] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | minting | ready | error
  const [error, setError] = useState(null);
  const inflightRef = useRef(null);

  const mint = useCallback(
    async ({ force = false } = {}) => {
      if (!isSignedIn) {
        setStatus('error');
        setError('not signed in');
        return null;
      }
      const userId = user?.id || '';
      const orgScope = organization?.id || '';

      if (!force) {
        const cached = readCache(userId, orgScope);
        if (cached) {
          setApiKey(cached.api_key);
          setOrgId(cached.org_id || orgScope || null);
          setStatus('ready');
          return cached.api_key;
        }
      }

      if (inflightRef.current) return inflightRef.current;

      setStatus('minting');
      setError(null);

      const promise = (async () => {
        try {
          const clerkJwt = await getToken();
          // Pass org_id + email in the request body. Clerk's default
          // session JWT only carries `sub` (user_id); org/email need
          // a custom JWT template or a body fallback. Backend reads
          // these fields from the body when missing from the JWT.
          const body = {
            source: 'wizard',
            org_id: organization?.id || null,
            email: user?.primaryEmailAddress?.emailAddress || null,
          };
          const resp = await fetch(`${API_BASE}/api/sdk/api-keys`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${clerkJwt}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`);
          }
          const data = await resp.json();
          writeCache(userId, orgScope, data);
          setApiKey(data.api_key);
          setOrgId(data.org_id || orgScope || null);
          setStatus('ready');
          return data.api_key;
        } catch (e) {
          setStatus('error');
          setError(e.message || String(e));
          return null;
        } finally {
          inflightRef.current = null;
        }
      })();

      inflightRef.current = promise;
      return promise;
    },
    [isSignedIn, getToken, user, organization]
  );

  // Auto-mint once on mount when signed in. Wizard then has a key ready
  // before the user hits "Spawn".
  useEffect(() => {
    if (isSignedIn && !apiKey && status === 'idle') {
      mint().catch(() => {});
    }
  }, [isSignedIn, apiKey, status, mint]);

  return { apiKey, orgId, status, error, mint };
}
