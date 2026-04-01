# Worklog: Status Diagnosis Next Steps

Date:
- 2026-04-01

Scope:
- add concrete recovery guidance to status diagnosis findings

## Why This Was Added

The diagnosis block already summarized the most important problems first, but it still required the user to infer the right recovery action.

That left unnecessary friction in the exact situations where `status` is most valuable.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The CLI now:
- attaches a concrete next step to portal and Discord diagnosis findings
- renders those next steps directly under each diagnosis line
- tests both the structured diagnosis output and the rendered status text

## Design Intent

`status` should not just tell the user what is wrong.

It should also point to the next command or config change that is most likely to resolve it.
