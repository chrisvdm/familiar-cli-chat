# Worklog: Portal Startup Planner Tests

Date:
- 2026-03-31

Scope:
- add automated coverage for the portal startup decision logic used by chat

## Why This Was Added

The most important startup behavior in the CLI is not just "can it spawn a process", but "does it choose the right startup path".

That choice determines whether chat:
- reuses an already healthy local server
- starts the local server only
- promotes to the full portal runtime so the hosted route can be refreshed

Without test coverage, that branching logic was still easy to regress while cleaning up the surrounding UX.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- isolates portal startup planning in a pure helper
- uses that helper to drive the existing `ensurePortalRunning` behavior
- tests runtime mode, server mode, and auto mode promotion/reuse decisions

## Design Intent

This keeps the integration-heavy process startup path thin and pushes the branchy policy into a place that is cheap to test and hard to accidentally break.
