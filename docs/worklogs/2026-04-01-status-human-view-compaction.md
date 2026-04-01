# Worklog: Status Human View Compaction

Date:
- 2026-04-01

Scope:
- remove redundant detail lines from the human-readable status view

## Why This Was Added

After adding diagnosis headlines and next steps, the human-readable status view still repeated some of the same warning text in the lower sections.

That made the status output longer without adding much signal.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- suppresses the raw portal warning line when the diagnosis block already covers the portal problem
- suppresses the Discord startup action line when the diagnosis block already explains the Discord startup issue
- keeps the underlying health and managed-process lines in place

## Design Intent

The diagnosis block should carry the repeated prose.

The lower sections should keep the factual state that supports it, not restate the same sentence twice.
