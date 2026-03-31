# Worklog: Default Discord Message Tool

Date:
- 2026-03-30

Scope:
- Add a simpler Discord tool that only requires message text and uses a default webhook from local env.

## Why This Was Added

Familiar was replying with instructions instead of selecting the webhook tool.

Root cause:
- the webhook tool required a full `webhook_url` argument
- that made the tool harder for Familiar to choose from natural prompts

## What Was Added

- `send_discord_message` in [tools.example.json](/Users/chris/Dev/cli-chat/tools.example.json)
- `sendDiscordDefaultWebhookMessage` in [bin/portal/server.js](/Users/chris/Dev/cli-chat/bin/portal/server.js)
- `DISCORD_WEBHOOK_URL` in [`.env.example`](/Users/chris/Dev/cli-chat/.env.example)

## Design

- Tool input mode is `raw`
- The tool accepts only the message text
- The portal reads the actual webhook URL from local env

## Outcome

This gives Familiar a much easier action to choose for prompts like:
- "send this to Discord"
- "post this in Discord"
- "send a Discord message: hello"
