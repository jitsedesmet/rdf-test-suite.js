#!/bin/bash
# Benchmark one jsonld-streaming-parser.js spec suite against the linked rdf-test-suite.
# usage: run.sh <label> <suite tordf|stream> <cache cold|warm>
set -u
LABEL=$1; S=$2; C=$3
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$GITHUB_WORKSPACE/jsonld"
CACHE=".bench-cache-$S"
if [ "$C" = cold ]; then rm -rf -- "$CACHE"; fi
case $S in
  tordf) ARGS=(https://w3c.github.io/json-ld-api/tests/toRdf-manifest.jsonld) ;;
  stream) ARGS=(-i '{ "streamingProfile": true }' https://w3c.github.io/json-ld-streaming/tests/stream-toRdf-manifest.jsonld) ;;
esac
STATS=$(mktemp)
START=$(date +%s.%N)
FETCH_STATS_FILE=$STATS NODE_OPTIONS="--require $HERE/count-fetch.js" \
  node node_modules/rdf-test-suite/bin/Runner.js spec/parser.js "${ARGS[@]}" -c "$CACHE/" > out.txt 2> err.txt
CODE=$?
END=$(date +%s.%N)
SUMMARY=$(grep -aoE '[0-9]+ / [0-9]+ tests succeeded.*|[0-9]+ / [0-9]+ tests failed.*' out.txt | tail -1)
[ -z "$SUMMARY" ] && SUMMARY="$(tail -n 2 err.txt | tr '\n' ' ' | cut -c1-160)"
LINE=$(printf "%s | %s | %s | %s | %.1f | %s | \`%s\`" "$LABEL" "$S" "$C" "$CODE" "$(echo "$END - $START" | bc)" "$SUMMARY" "$(cat "$STATS")")
echo "RESULT | $LINE"
echo "| $LINE |" >> "$GITHUB_STEP_SUMMARY"
