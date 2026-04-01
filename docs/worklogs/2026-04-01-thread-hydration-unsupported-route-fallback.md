# Worklog: Thread Hydration Unsupported Route Fallback

Date:
- 2026-04-01

Scope:
- keep chat startup working when the Familiar deployment does not support thread metadata reads

## Why This Was Added

The CLI now attempts best-effort thread-name hydration when a saved local session has a thread id but no name.

That is useful when the API supports thread reads, but some deployments return `405 Method Not Allowed` for `GET /api/v1/threads/:id`.

Without a fallback, that turns a non-essential metadata lookup into a hard chat startup failure.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)

The CLI now:
- treats both `404` and `405` thread metadata responses as ignorable for hydration
- falls back to the saved thread id when the metadata route is unsupported
- tests the ignore decision directly

## Design Intent

Thread-name hydration is a best-effort enhancement, not a startup dependency.
