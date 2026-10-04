#!/bin/zsh
cd "$(dirname "$0")"
URLFILE="$HOME/.cahier/lien.txt"
mkdir -p "$HOME/.cahier"

if ! lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  python3 -m http.server 5173 --bind 127.0.0.1 >> "$HOME/.cahier/http.log" 2>&1 &
  sleep 0.4
fi

echo "Mac → http://localhost:5173"

while true; do
  : > "$HOME/.cahier/tunnel.live"
  ssh -N \
    -o StrictHostKeyChecking=accept-new \
    -o ServerAliveInterval=20 \
    -o ServerAliveCountMax=6 \
    -o ExitOnForwardFailure=yes \
    -R 80:127.0.0.1:5173 \
    nokey@localhost.run >> "$HOME/.cahier/tunnel.live" 2>&1 &
  cpid=$!
  announced=""
  while kill -0 "$cpid" 2>/dev/null; do
    url=$(grep -oE 'https://[a-z0-9]+\.lhr\.life' "$HOME/.cahier/tunnel.live" | head -1)
    if [[ -n "$url" && "$url" != "$announced" ]]; then
      print -r -- "$url" > "$URLFILE"
      echo "iPhone → $url"
      announced="$url"
    fi
    sleep 1
  done
  wait "$cpid" 2>/dev/null
  echo "Tunnel coupé — nouveau lien…"
  sleep 3
done
