#!/bin/sh
# Single Chromium for both the user and the agent (CDP on DESK_CDP_PORT). Re-running just focuses a new window.
P=${DESK_CDP_PORT:-9333}
exec "${DESK_CHROME:-chromium}" --user-data-dir="$HOME/.config/chromium" --remote-debugging-port=$P --remote-debugging-address=${DESK_CDP_HOST:-127.0.0.1} \
  --no-first-run --no-default-browser-check --disable-dev-shm-usage --no-sandbox --test-type --password-store=basic \
  --start-maximized --window-size=1280,690 --window-position=0,0 --disable-features=Translate,MediaRouter "${@:-https://www.google.com}"
