# Worklog: Hosted Portal Route Classification Tests

Date:
- 2026-04-01

Scope:
- add automated coverage for hosted portal route classification and warning text

## Why This Was Added

The portal startup planner was already covered, but the warnings that explain why a hosted route is stale or unusable were still embedded directly in the network path.

Those warnings matter because they are the main way the CLI explains when and why it needs a tunnel refresh.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- isolates hosted portal base URL classification in a pure helper
- isolates hosted portal health classification in a pure helper
- tests missing, invalid, local-only, unreachable, invalid-health, and healthy cases

## Design Intent

Startup policy and startup explanations should both be testable.

That keeps the CLI from regressing into vague or inconsistent guidance when the hosted route is stale.
