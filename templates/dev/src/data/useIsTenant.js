/**
 * useIsTenant — single source of truth for "is this a real signed-in
 * tenant who must never see curated fixtures?".
 *
 * Resolves to true when there's a Clerk-signed-in user. Anonymous demo
 * viewers (no Clerk session) get the curated fixtures so the marketing
 * surface keeps working for prospects.
 *
 * Any view that today reads from a bundled JSON / hardcoded const must
 * check this hook and render an empty state (or live data via
 * useVoiceToken's Bearer) instead.
 */
import { useUser } from '@clerk/clerk-react';

export function useIsTenant() {
  const { isSignedIn } = useUser();
  return !!isSignedIn;
}
