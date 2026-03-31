# Worklog: Status Process Observability

Date:
- 2026-03-31

Scope:
- improve the local status surface for managed portal and Discord child processes

## Why This Was Added

`status` already exposed configuration and health, but it still left some ambiguity about the actual supervised child processes that `chat` had started.

That made it harder to distinguish between "configured", "healthy", and "currently running under this chat session".

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The status payload now includes:
- managed process kind
- child PID when available
- whether the child is still running
- the associated log file path

## Design Intent

When chat is acting as a supervisor, `status` should be the first place to inspect that supervision state without dropping into `ps`, `lsof`, or raw log files immediately.
