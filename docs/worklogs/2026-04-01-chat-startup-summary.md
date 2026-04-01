# Worklog: Chat Startup Summary

Date:
- 2026-04-01

Scope:
- make chat startup state easier to scan from the first screen

## Why This Was Added

The CLI had accumulated stronger status logic, but the initial chat startup still printed connection info, commands, and warnings as separate lines with no single summary.

That meant the first screen was less coherent than the later `status` view.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- builds a startup summary from the same status data used elsewhere
- prints the current connection, channel, thread, and top startup diagnosis in one compact block
- tests the startup summary formatter directly

## Design Intent

The first thing the user sees after entering chat should already answer:
- where am I connected
- what thread am I on
- is startup healthy or not
