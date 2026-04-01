# Worklog: Status Label Consistency Cleanup

Date:
- 2026-04-01

Scope:
- make human-readable status labels use one consistent formatter path

## Why This Was Added

The readable status and startup views had settled, but the `yes` / `no` / `unknown` labels were still rendered inline in multiple places.

That was a small maintainability issue and an easy place for wording drift to creep in later.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [test/cli-chat.test.js](/Users/chris/Dev/cli-chat/test/cli-chat.test.js)

The CLI now:
- formats boolean and tri-state labels through shared helpers
- uses those helpers in the human-readable status view
- tests the label helpers directly

## Design Intent

This is a cleanup pass, not a behavior change.

The goal is to keep the wording stable as the status surface evolves.
