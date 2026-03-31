# Worklog: Discord Channel Message Tool

Date:
- 2026-03-30

Scope:
- Add a Discord channel-message tool as a reliable Discord delivery path.

## Why This Was Added

Posting to a known channel id is simpler, more reliable, and easier to validate than per-user message delivery.

## What Was Added

- `send_discord_channel_message` in [tools.example.json](/Users/chris/Dev/cli-chat/tools.example.json)
- `sendDiscordChannelMessage` in [bin/portal.js](/Users/chris/Dev/cli-chat/bin/portal.js)
- README updates describing the channel tool and recommending it as the easier first test

## Tool Contract

Inputs:
- `channel_id`
- `message`

Behavior:
- send one bot-authored message to the specified Discord channel
- return a short summary plus the resulting Discord ids

## Why Channel Id Instead Of Channel Name

- Channel ids are stable
- Channel names are not unique enough for reliable automation
- The portal contract should stay unambiguous

## Recommendation

Use this tool first when validating the Discord integration.
