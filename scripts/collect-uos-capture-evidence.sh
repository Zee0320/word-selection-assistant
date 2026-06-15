#!/usr/bin/env bash
set -euo pipefail

OUTPUT="${1:-docs/superpowers/verification/issue-3-uos-environment.txt}"
mkdir -p "$(dirname "$OUTPUT")"

{
  echo "captured_at=$(date --iso-8601=seconds)"
  echo "git_head=$(git rev-parse HEAD)"
  echo "uname_m=$(uname -m)"
  echo "XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-}"
  echo "DISPLAY=${DISPLAY:-}"
  echo "--- /etc/os-release ---"
  cat /etc/os-release
  echo "--- commands ---"
  command -v xinput
  command -v xdotool
  command -v xclip
  echo "--- versions ---"
  xinput --version || true
  xdotool version || true
  xclip -version 2>&1 || true
} | tee "$OUTPUT"

test "$(uname -m)" = "aarch64"
test "${XDG_SESSION_TYPE:-}" = "x11"
grep -Eiq '(^ID=uos$|uniontech|uos)' /etc/os-release
