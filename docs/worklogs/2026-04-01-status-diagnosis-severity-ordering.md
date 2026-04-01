# Worklog: Status Diagnosis Severity Ordering

Date:
- 2026-04-01

Scope:
- prioritize `status` diagnosis findings by severity instead of accumulation order

## Why This Was Added

The diagnosis block already highlighted actionable problems, but the order was still an implementation detail rather than an explicit priority model.

That made the first diagnosis line less reliable as a quick indicator of the most important problem.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- models diagnosis findings with explicit severities
- sorts findings by severity before rendering
- shows severity labels in the human-readable status output
- tests the structured finding shape and rendered output

## Design Intent

If `status` is meant to guide the next action, it should make its prioritization rules explicit and stable.
