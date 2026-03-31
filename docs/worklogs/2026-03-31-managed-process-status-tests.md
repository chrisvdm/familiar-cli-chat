# Worklog: Managed Process Status Tests

Date:
- 2026-03-31

Scope:
- add automated coverage for the managed-process status shape used by `status`

## Why This Was Added

The `status` command had become a real debugging surface for portal and Discord supervision state.

That made its process descriptor shape important enough to test directly instead of relying on ad hoc manual inspection.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The repo now tests:
- empty managed-process descriptors
- live child descriptors
- stopped child descriptors

## Design Intent

If `status` is going to be the first stop for local debugging, its shape should be stable and covered like the startup planners it reports on.
