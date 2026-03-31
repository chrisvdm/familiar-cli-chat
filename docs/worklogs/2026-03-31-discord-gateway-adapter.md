# Worklog: Discord Gateway Adapter

Date:
- 2026-03-31

Scope:
- add a thin Discord gateway adapter outside portal

## Why This Was Added

Discord channel webhooks are outbound posting tools, not inbound message subscriptions.

That meant:
- portal conversation input worked
- Familiar input worked
- Discord-originated user messages still had no path into the system

## What Was Added

- [bin/adapters/discord-gateway.js](/Users/chris/Dev/cli-chat/bin/adapters/discord-gateway.js)
- `npm run discord:listen`
- public README notes for the gateway adapter

## Behavior

The adapter:
- connects to the Discord Gateway with a bot token
- listens for `MESSAGE_CREATE`
- accepts DMs or messages that mention the bot
- forwards normalized text to portal `POST /conversation/input`
- sends the Familiar reply back into Discord
- mirrors the reply into the active local CLI channel through portal `POST /channels/messages`

## Design Intent

Portal stays generic:
- portal understands normalized conversation input and Familiar delivery
- the Discord adapter understands Discord Gateway payloads and mention semantics

That preserves the intended package boundary.
