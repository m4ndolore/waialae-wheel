#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Deploying Waialae Game ==="
echo ""

# Deploy static site to Cloudflare Pages
echo "--- Pages: uploading static files ---"
wrangler pages deploy . \
  --project-name mr-magoo-golf \
  --branch production \
  --commit-dirty=true
echo ""

# Deploy worker
echo "--- Worker: deploying waialae-wheel-feedback ---"
cd worker
wrangler deploy
cd ..
echo ""

echo "=== Deploy complete ==="
echo "Pages:  https://wheel.defensebuilders.com"
echo "Worker: https://waialae-wheel-feedback.defensebuilders.workers.dev"
