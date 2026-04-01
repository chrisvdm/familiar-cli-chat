# Worklog: Status Human Readable Default

Date:
- 2026-04-01

Scope:
- make `status` easier to read during local debugging without losing machine-readable output

## Why This Was Added

`status` had become a useful debugging surface, but raw JSON was still heavier to scan than it needed to be during normal terminal use.

That friction showed up most in the common case where the user just wants to know whether portal and Discord supervision look sane.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- prints a readable status summary by default
- keeps `status --json` for scripting and raw inspection
- tests the managed-process summary formatter and the overall status formatter

## Design Intent

The human path should optimize for quick scanning in a terminal.

The machine path should still exist, but it should be opt-in instead of the default.
