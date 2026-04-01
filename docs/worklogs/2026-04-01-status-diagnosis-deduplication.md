# Worklog: Status Diagnosis Deduplication

Date:
- 2026-04-01

Scope:
- collapse overlapping portal diagnosis findings into a single higher-signal headline

## Why This Was Added

After adding diagnosis severity ordering, a single broken portal startup could still produce multiple adjacent high-severity lines that all pointed at the same outage.

That was accurate, but it was noisier than necessary for the top-level diagnosis block.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- collapses overlapping portal diagnosis details into one high-severity "Portal needs attention" finding
- keeps the detailed portal fields and warnings in the lower status sections
- tests the collapsed diagnosis output

## Design Intent

The diagnosis block should tell you what category is broken first.

The detailed portal section can carry the full breakdown without repeating it as separate top-level alarms.
