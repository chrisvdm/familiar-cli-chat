# Worklog: Discord Listener Startup Planner Tests

Date:
- 2026-03-31

Scope:
- add automated coverage for Discord listener auto-start policy
- expose that policy through the local status surface

## Why This Was Added

Portal startup policy was now covered by tests, but Discord listener startup still lived as an inline branch in `chat`.

That made the behavior harder to document, harder to test, and less visible in `status`.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- isolates Discord listener auto-start policy in a pure helper
- tests the enabled, disabled, and missing-token cases
- reports the resulting startup action and reason in `status`

## Design Intent

The local CLI should make it obvious whether Discord listener startup was intentionally skipped or expected to run.
