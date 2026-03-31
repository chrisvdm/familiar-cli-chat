# Worklog: Discord Webhook Tool

Date:
- 2026-03-30

Scope:
- Add a webhook-based Discord tool as the simplest delivery path for integrations that already have a channel webhook URL.

## Why This Was Added

The user supplied a Discord webhook URL directly.

A webhook is a better fit than bot DM delivery when:
- the destination is a channel, not a specific user
- the integration already has a valid webhook URL
- minimal Discord setup is preferred

## What Was Added

- `send_discord_webhook_message` in [tools.example.json](/Users/chris/Dev/cli-chat/tools.example.json)
- `sendDiscordWebhookMessage` in [bin/portal/server.js](/Users/chris/Dev/cli-chat/bin/portal/server.js)
- README notes describing the webhook tool as a practical first-test path

## Tool Contract

Inputs:
- `webhook_url`
- `message`

Behavior:
- send one message to the supplied Discord webhook
- return a short summary plus the resulting Discord ids when Discord returns them

## Tradeoff

Using a raw webhook URL is operationally simple, but it is also secret material.

That means:
- never commit real webhook URLs
- rotate them if they are pasted into chats or logs
