# Worklog: Startup Failure Log Hints

Date:
- 2026-03-31

Scope:
- improve quiet-startup failure reporting for portal and Discord child processes

## Why This Was Added

Quiet startup keeps the chat prompt usable, but it also means child-process failures are less obvious unless the CLI points directly at the right log file.

The previous behavior still surfaced generic errors like timeouts or early exits without enough local debugging context.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- includes the relevant `.cli-chat/*.log` file path in portal and Discord startup errors
- includes a short tail from that log when available
- detects portal runtime exit while waiting for the hosted route refresh
- detects immediate Discord listener startup failure before entering chat

## Design Intent

Quiet by default only works if the fallback debugging path is direct.

When startup fails, the user should not need to guess whether to inspect portal server logs, portal runtime logs, or Discord listener logs.
