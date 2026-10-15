#!/usr/bin/env bash
# Build, start the backend and expose it through a Cloudflare QUICK tunnel (random *.trycloudflare.com).
# The hostname changes whenever the tunnel restarts - and with it the app's storage bucket and
# cached manifest - so prefer a named tunnel / fixed domain (compose.yaml) for anything long-lived.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data
npm run build >/dev/null
# Stop previous instances by pid file (never `pkill -f <pattern>`: it can match this shell).
if [ -f data/server.pid ]; then kill "$(cat data/server.pid)" 2>/dev/null || true; fi
if [ "${1:-}" = "--new-tunnel" ] && [ -f data/tunnel.pid ]; then kill "$(cat data/tunnel.pid)" 2>/dev/null || true; rm -f data/tunnel.pid; fi
sleep 0.5
nohup node server/index.ts >> data/server.log 2>&1 &
echo $! > data/server.pid
if ! { [ -f data/tunnel.pid ] && kill -0 "$(cat data/tunnel.pid)" 2>/dev/null; }; then
  nohup "${CLOUDFLARED:-cloudflared}" tunnel --no-autoupdate --url "http://localhost:${PORT:-__PORT__}" > data/tunnel.log 2>&1 &
  echo $! > data/tunnel.pid
fi
for _ in $(seq 1 40); do
  url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' data/tunnel.log | head -1 || true)
  [ -n "$url" ] && break
  sleep 1
done
echo "${url:-tunnel URL not found - see data/tunnel.log}"
