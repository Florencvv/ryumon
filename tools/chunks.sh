#!/bin/bash
# bash tools/chunks.sh [SCALE=2] [PORT=8760]: render the film as resumable 120-frame lossless FFV1 chunks
#   -> out/chunks/c_NNNN.mkv (+ .ok marker when a chunk is complete; finished chunks are skipped on a re-run)
# Starts tools/serve.py on PORT if nothing answers there (and stops it at the end).
cd "$(dirname "$0")/.."
S=${1:-2}
PORT=${2:-8760}
NF=2112
mkdir -p out/chunks
SP=
if ! python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:$PORT/index.html', timeout=3)" 2>/dev/null; then
  python tools/serve.py $PORT &
  SP=$!
  sleep 2
fi
for a in $(seq 0 120 $((NF - 1))); do
  b=$((a + 120)); [ $b -gt $NF ] && b=$NF
  f=out/chunks/c_$(printf %04d $a).mkv
  if [ -f "$f.ok" ]; then echo "skip $f"; continue; fi
  # render.py exits non-zero on any import/failed error or missing department (no .ok): retry up to 3 times
  for try in 1 2 3; do
    python tools/render.py "$f" $a $b --scale $S --port $PORT && { touch "$f.ok"; break; }
    echo "RETRY $f (attempt $try failed)"; sleep 3
  done
done
[ -n "$SP" ] && kill $SP
echo ALLDONE
