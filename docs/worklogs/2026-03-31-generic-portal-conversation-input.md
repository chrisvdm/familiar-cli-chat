# Worklog: Generic Portal Conversation Input

Date:
- 2026-03-31

Scope:
- add a generic inbound conversation route to the portal

## Why This Was Added

The portal could already:

- execute Familiar-selected tools
- receive Familiar-delivered channel messages

But it could not yet accept inbound channel events from an external adapter and turn them into normal Familiar conversation input.

That gap made Discord-originated messages a dead end unless the input came from the CLI itself.

## What Was Added

- `POST /conversation/input` in [bin/portal/server.js](/Users/chris/Dev/cli-chat/bin/portal/server.js)
- portal docs describing the normalized input contract

## Contract

The route accepts normalized input like:

```json
{
  "channel": {
    "type": "discord",
    "id": "995263437775061155"
  },
  "thread_id": "thread_abc",
  "input": {
    "kind": "text",
    "text": "@familiar what's happening?"
  }
}
```

Portal then forwards that payload shape to Familiar's canonical route:

- `POST /api/v1/conversation/input`

## Design Intent

This keeps portal generic:

- portal understands Familiar-facing normalized conversation input
- source adapters understand Discord, Slack, email, or other event formats

That is a better long-term package boundary than teaching portal about source-specific webhook payloads.
