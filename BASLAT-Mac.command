#!/bin/sh
# SKYTHREAD - double-click to play on macOS (or run ./BASLAT-Mac.command in Terminal).
# Uses Node.js when it is installed and new enough, otherwise downloads a
# portable Node.js into .tools/node once (no admin rights needed); then installs
# the npm packages, builds the game and opens it in the browser.
# Options: --dev  --no-open  --rebuild  --reinstall  --check
cd "$(dirname "$0")" || exit 1
sh scripts/bootstrap.sh "$@"
status=$?
# Keep the window open on errors so the message can be read (not after Ctrl+C).
if [ "$status" -ne 0 ] && [ "$status" -ne 130 ] && [ -t 0 ] && [ -z "${CI:-}" ]; then
  printf '\nKapatmak için Enter tuşuna basın...'
  read -r _
fi
exit "$status"
