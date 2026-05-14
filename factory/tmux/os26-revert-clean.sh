#!/bin/bash
# Restore the staging-site to its clean default state (customer.json + all
# static-api JSON for /dev /insurance /compliance) and redeploy to
# staging.demo.pistonsolutions.ai.
#
# Use after a successful factory run + recording to reset for the next take.
#
# Snapshot is at ~/os26-clean-state.tgz, created by the orchestrator session
# pre-run. If you need to recapture, re-run:
#   cd /Users/nca/os26/staging-site
#   tar czf ~/os26-clean-state.tgz public/customer.json sites/{dev,insurance,compliance}/public/static-api

set -e

SNAPSHOT="$HOME/os26-clean-state.tgz"
STAGING="/Users/nca/os26/staging-site"

if [ ! -f "$SNAPSHOT" ]; then
  echo "ERROR: no snapshot at $SNAPSHOT — cannot revert"
  exit 1
fi

echo "→ restoring clean state from $SNAPSHOT"
cd "$STAGING"
tar xzf "$SNAPSHOT"
echo "  done"

echo
echo "→ rebuilding staging-site"
npm run build 2>&1 | tail -3

echo
echo "→ deploying via vercel CLI"
DEPLOY_JSON=$(vercel --prod --yes 2>&1)
NEW=$(echo "$DEPLOY_JSON" | grep -oE 'bastion-demos-staging-[a-z0-9]+-nichos-projects-cb870efc\.vercel\.app' | head -1)
if [ -z "$NEW" ]; then
  echo "ERROR: vercel deploy did not return a preview URL"
  echo "$DEPLOY_JSON" | tail -10
  exit 1
fi
echo "  preview: $NEW"

echo
echo "→ aliasing → staging.demo.pistonsolutions.ai"
vercel alias set "$NEW" staging.demo.pistonsolutions.ai 2>&1 | tail -3

echo
echo "✓ reverted. https://staging.demo.pistonsolutions.ai is back to clean default."
