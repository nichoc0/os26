/**
 * useOrgHasData — does the signed-in org have any assessment runs / voice
 * runs / ingested events yet?
 *
 * Returns `{ hasData, loading }`. When hasData is false AND the user is
 * a signed-in tenant, surfaces should swap to a get-started CTA instead
 * of rendering empty charts. Polls once on mount; cheap because the
 * backend already returns counts in the same row.
 */
import { useEffect, useState } from 'react';
import { useVoiceToken } from './useVoiceToken';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');

export function useOrgHasData() {
  const { apiKey: bearer, status: bearerStatus } = useVoiceToken();
  const [hasData, setHasData] = useState(null); // null = loading
  const [error, setError] = useState(null);

  useEffect(() => {
    if (bearerStatus === 'idle' || bearerStatus === 'minting') return;
    if (!bearer) {
      // Anonymous demo viewers always see the curated fixtures, so flag
      // "has data" so the CTA never appears for them.
      setHasData(true);
      return;
    }
    let cancelled = false;
    const headers = { Authorization: `Bearer ${bearer}` };
    Promise.all([
      fetch(`${API_BASE}/api/sdk/runs?limit=1`, { headers }).then((r) => r.ok ? r.json() : { runs: [] }).catch(() => ({ runs: [] })),
      fetch(`${API_BASE}/api/sdk/voice-runs?limit=1`, { headers }).then((r) => r.ok ? r.json() : { runs: [] }).catch(() => ({ runs: [] })),
    ])
      .then(([textRuns, voiceRuns]) => {
        if (cancelled) return;
        const any = (textRuns?.runs?.length || 0) + (voiceRuns?.runs?.length || 0);
        setHasData(any > 0);
      })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [bearer, bearerStatus]);

  return { hasData, loading: hasData === null, error };
}
