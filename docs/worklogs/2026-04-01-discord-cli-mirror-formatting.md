# Worklog: Discord CLI Mirror Formatting

Date:
- 2026-04-01

Scope:
- mirror Discord inbound and outbound traffic into the active CLI channel with clearer direction labels

## Why This Was Added

The Discord gateway adapter already mirrored Familiar replies into the CLI, but the mirrored output did not distinguish inbound Discord user messages from outbound Familiar replies clearly enough.

That made the shared CLI channel harder to scan once Discord traffic was active.

## What Changed

- [bin/adapters/discord-gateway.js](/Users/chris/Dev/cli-chat/bin/adapters/discord-gateway.js)

The adapter now:
- mirrors inbound Discord messages as `<-[discord] username: ...`
- mirrors outbound Familiar replies as `->[discord] familiar: ...`
- routes both directions through a shared helper that posts into the active CLI channel

## Design Intent

Mirrored Discord traffic should read like directional transport events, not like undifferentiated chat lines.
