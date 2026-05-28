#!/bin/bash
# Vercel Ignored Build Step
# Exit 1 = proceed with build | Exit 0 = skip build
#
# Build only for: main, develop, or open pull requests.

echo "Branch: $VERCEL_GIT_COMMIT_REF"
echo "PR ID:  $VERCEL_GIT_PULL_REQUEST_ID"

if [[ "$VERCEL_GIT_COMMIT_REF" == "main" ]] || \
   [[ "$VERCEL_GIT_COMMIT_REF" == "develop" ]] || \
   [[ -n "$VERCEL_GIT_PULL_REQUEST_ID" ]]; then
  echo "→ Building"
  exit 1
fi

echo "→ Skipping"
exit 0
