# Worklog: Portal Port Terminology

Date:
- 2026-03-31

Scope:
- prefer portal-facing naming over executor-facing naming where compatibility allows

## Why This Was Added

The published local product surface in this repo is the portal.

Keeping `executor` terminology in developer-facing env and startup docs made the product boundary look less settled than it actually is.

## What Changed

- [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
- [bin/portal/server.js](/Users/chris/Dev/cli-chat/bin/portal/server.js)
- [bin/portal/runtime.js](/Users/chris/Dev/cli-chat/bin/portal/runtime.js)
- [bin/portal/README.md](/Users/chris/Dev/cli-chat/bin/portal/README.md)
- [README.md](/Users/chris/Dev/cli-chat/README.md)

The repo now:
- prefers `PORTAL_PORT` as the local port variable
- continues to accept `EXECUTOR_PORT` as a legacy alias
- documents the portal-first terminology in the main README and portal README

## Design Intent

The repo should use portal language for the local product surface while still acknowledging that Familiar's underlying protocol concept is an executor contract.
