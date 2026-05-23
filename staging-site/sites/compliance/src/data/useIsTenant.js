/**
 * useIsTenant — OS26 demo override.
 *
 * Originally: returned `!!isSignedIn` so signed-in real tenants never see
 * curated fixtures. For this hackathon demo we ALWAYS want the customer-
 * personalised static-api fixtures to render — they are the demo content.
 * Hardcoded to `false` until the staging-site forks from the prod tree.
 */
export function useIsTenant() {
  return false;
}
