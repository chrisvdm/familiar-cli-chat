# Worklog: Startup Portal Refresh Wording

Date:
- 2026-04-01

Scope:
- make chat startup explain what the portal auto-start logic actually did

## Why This Was Added

The startup summary reused the broader status diagnosis language, which made a stale hosted portal route look like a hard startup failure even when direct CLI chat could still work.

That was too alarming and too imprecise.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- records what the portal supervisor actually did on startup
- distinguishes portal auto-start disabled, local server reuse/start, hosted route refresh success, and hosted route refresh failure
- uses that startup result in the chat opening banner instead of always escalating from generic diagnosis severity

## Design Intent

Startup messaging should describe the startup action that actually happened, not just restate a generic health warning.
