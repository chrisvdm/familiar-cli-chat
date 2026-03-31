# Worklog: Thread Name Hydration

Date:
- 2026-03-31

Scope:
- improve thread display when only a saved thread id is available locally

## Why This Was Added

The CLI already preferred a locally known thread name, but older saved sessions or manual `thread set` usage could still leave the UI showing only the raw thread id.

That was workable, but it made the thread display feel more brittle than it needed to be.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- attempts a best-effort thread metadata lookup at `/api/v1/threads/:id` when it has a thread id but no local thread name
- hydrates and persists `threadName` when that metadata includes a name
- applies the hydration on chat startup, `status`, and `thread set`
- falls back silently to the raw thread id if the lookup route is unavailable

## Design Intent

Thread display should be as stable and readable as the API allows, without making startup fragile or depending on undocumented behavior.
