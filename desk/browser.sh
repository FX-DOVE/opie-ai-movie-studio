#!/bin/sh
# Single Chromium for both the user and the agent (CDP on DESK_CDP_PORT). Re-running just focuses a new window.
P=${DESK_CDP_PORT:-9333}
# Clear a stale profile lock left by a previous container (different hostname) or a dead process,
# otherwise Chromium shows "profile appears to be in use by another computer" after a redeploy.
D="$HOME/.config/chromium"; L=$(readlink "$D/SingletonLock" 2>/dev/null)
if [ -n "$L" ]; then H=${L%-*}; PID=${L##*-}
  if [ "$H" != "$(hostname)" ] || [ ! -d "/proc/$PID" ]; then rm -f "$D/SingletonLock" "$D/SingletonSocket" "$D/SingletonCookie"; fi
fi
exec "${DESK_CHROME:-chromium}" --user-data-dir="$HOME/.config/chromium" --remote-debugging-port=$P --remote-debugging-address=${DESK_CDP_HOST:-127.0.0.1} \
  --no-first-run --no-default-browser-check --disable-dev-shm-usage --no-sandbox --test-type --password-store=basic \
  --disable-gpu --renderer-process-limit=2 --disable-smooth-scrolling --disable-background-networking --disable-component-update --disable-sync --disable-breakpad --force-device-scale-factor=1 --disk-cache-size=67108864 --start-maximized --window-size=1280,690 --window-position=0,0 --hide-crash-restore-bubble --disable-features=Translate,MediaRouter "${@:-https://www.google.com}"
