# Worklog: Quiet Startup And Thread Status

Date:
- 2026-03-31

Scope:
- keep chat startup quiet by default
- improve local thread display and state cleanup
- add a local runtime status surface

## Why This Was Added

The current chat flow worked, but background child-process logs still bled into the active prompt.

That made the terminal feel noisy even when portal auto-start and Discord listener auto-start were behaving correctly.

There were also two small thread-state problems:
- clearing the active thread in interactive chat could leave a stale thread name behind
- a saved thread id without a saved thread name would keep showing the raw id even after later responses contained the name

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- starts portal and Discord child processes with piped stdio during chat
- writes child output to `.cli-chat/*.log` files instead of printing it into the prompt
- supports `CLI_CHAT_VERBOSE_STARTUP=true` for live startup log mirroring when debugging
- adds `cli-chat status` and `/status`
- clears both `threadId` and `threadName` when the active thread is cleared
- backfills `threadName` from later Familiar responses even when the thread id does not change

## Design Intent

`chat` should be the user-facing surface, not a raw passthrough for portal and cloudflared logs.

Quiet by default with explicit log files keeps the normal UX clean while still leaving enough visibility for debugging and support.
