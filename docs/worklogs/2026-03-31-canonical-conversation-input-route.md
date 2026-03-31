# Worklog: Canonical Conversation Input Route

Date:
- 2026-03-31

Scope:
- align the CLI with Familiar's canonical conversation input endpoint

## What Changed

- update [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js) to send text input to `/api/v1/conversation/input`
- update public and internal docs to describe `/api/v1/input` as a backwards-compatibility alias instead of the primary route

## Why

The current Familiar codebase exposes:

- `POST /api/v1/conversation/input`

and keeps:

- `POST /api/v1/input`

as a compatibility alias.

Using the canonical route in this repo keeps the code and docs aligned with the current API surface and avoids teaching new integrations the legacy path first.
