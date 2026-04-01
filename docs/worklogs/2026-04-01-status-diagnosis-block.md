# Worklog: Status Diagnosis Block

Date:
- 2026-04-01

Scope:
- make `status` call out actionable problems before detailed state

## Why This Was Added

The human-readable status summary was easier to scan than raw JSON, but it still required the user to infer which fields actually meant "something is wrong".

That is the wrong default for a local debugging surface.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- derives a diagnosis block from portal and Discord status
- highlights stale hosted routes, failed local portal health, dead managed children, and missing Discord bot token configuration
- tests those diagnosis rules directly

## Design Intent

Status should surface the likely next action first and the supporting state second.
