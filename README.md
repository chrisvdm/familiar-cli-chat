# cli-chat

`cli-chat` is a local Node.js terminal client for the [Familiar](https://familiar.chrsvdmrw.workers.dev/docs/) hosted API.

It gives you a simple command-line chat interface that:
- talks directly to Familiar over HTTP
- keeps local conversation continuity
- bootstraps a Familiar account automatically on first run
- exposes basic account, thread, and tool-sync commands
- includes a sample local portal with a Discord delivery tool

## Why This Exists

Familiar is a hosted API, not a local SDK. This project provides the missing local interface layer: a small terminal app that makes Familiar usable from a developer shell without building a full web UI first.

The scope is intentionally narrow. `cli-chat` is:
- a chat client
- a setup helper
- a thin API wrapper

It is not:
- a local LLM runtime
- a replacement for your Familiar integration backend
- a background job system

## Features

- Interactive terminal chat with `npm start -- chat`
- One-shot message sending with `send`
- Runtime status inspection with `status`
- Automatic account creation if no token is configured
- Local persistence for channel and thread continuity
- Tool syncing from JSON definitions
- Sample Discord tool and local portal
- Optional Discord gateway adapter for mention-based input
- Minimal footprint with no runtime dependencies beyond Node 22

## Quickstart

Requirements:
- Node.js 22+

Install:

```bash
npm install
cp .env.example .env
```

Start chatting:

```bash
npm start -- chat
```

If no `FAMILIAR_API_TOKEN` is set in your shell, `.env`, or `dev.vars`, the CLI creates a Familiar account automatically, stores the returned token in `.env`, and continues into chat.

By default, `chat` auto-starts the local portal server on `127.0.0.1:8788`. If Familiar's configured public portal route is stale or missing, `chat` now escalates to the full portal runtime automatically so the Cloudflare tunnel and hosted `base_url` are refreshed.

If `DISCORD_BOT_TOKEN` is configured, `chat` also auto-starts the Discord mention listener by default.

Auto-started background process logs are written to:
- [`.cli-chat/portal-server.log`](/Users/chris/Dev/cli-chat/.cli-chat/portal-server.log)
- [`.cli-chat/portal-runtime.log`](/Users/chris/Dev/cli-chat/.cli-chat/portal-runtime.log)
- [`.cli-chat/discord-listener.log`](/Users/chris/Dev/cli-chat/.cli-chat/discord-listener.log)

Set `CLI_CHAT_VERBOSE_STARTUP=true` if you want those child-process logs mirrored into the terminal during chat startup.

If portal or Discord auto-start fails during chat startup, the CLI now prints the relevant log file path and a short log tail to speed up local debugging.

The repo includes [`.env.example`](/Users/chris/Dev/cli-chat/.env.example) as the public template. Keep your real [`.env`](/Users/chris/Dev/cli-chat/.env) local and untracked.

## Common Commands

Interactive chat:

```bash
npm start -- chat
```

Send a single message:

```bash
node ./bin/cli-chat.js send "Hello"
```

Inspect the current account:

```bash
node ./bin/cli-chat.js whoami
```

Inspect portal, thread, and Discord listener status:

```bash
node ./bin/cli-chat.js status
```

Get the raw JSON form if you want to script against it:

```bash
node ./bin/cli-chat.js status --json
```

The default status view is now a readable summary of thread display state, local portal health, hosted route health, managed child-process state, and relevant log file paths.

The current automated coverage includes CLI thread-state helpers and the portal startup decision logic that determines when chat reuses the local server versus promoting to the full runtime.

The status payload also reports whether Discord listener auto-start will run, skip because it is disabled, or skip because `DISCORD_BOT_TOKEN` is not configured.

Managed process details in `status` are also covered by the current smoke tests so the local debugging surface does not drift silently.

Hosted portal route classification and warning messages are also covered, including missing, invalid, local-only, unreachable, invalid-health, and healthy route cases.

Sync tools from a JSON file:

```bash
node ./bin/cli-chat.js sync-tools ./tools.example.json
```

Run the current smoke tests:

```bash
npm test
```

Run the packaged portal runtime:

```bash
npm run portal
```

This starts:
- the local portal server
- a Cloudflare quick tunnel
- an automatic Familiar integration `base_url` update when `FAMILIAR_API_TOKEN` is present

If you only want the local server without a tunnel, run:

```bash
npm run portal:server
```

Run the Discord mention listener manually:

```bash
npm run discord:listen
```

Manage thread state:

```bash
node ./bin/cli-chat.js thread new "Scratchpad"
node ./bin/cli-chat.js thread set thread_abc
node ./bin/cli-chat.js thread clear
```

## Config

Recognized environment variables:

```bash
FAMILIAR_API_TOKEN
FAMILIAR_BASE_URL
FAMILIAR_CHANNEL_TYPE
FAMILIAR_CHANNEL_ID
FAMILIAR_THREAD_ID
FAMILIAR_TOOLS_FILE
AUTO_START_PORTAL
AUTO_START_PORTAL_MODE
AUTO_START_DISCORD_LISTENER
PORTAL_PORT
EXECUTOR_PORT
DISCORD_WEBHOOK_URL
DISCORD_BOT_TOKEN
PORTAL_BASE_URL
CLOUDFLARED_BIN
CLI_CHAT_VERBOSE_STARTUP
```

Config sources are loaded in this order:
1. real shell environment
2. `.env`
3. `dev.vars`

Already-set shell variables win over file-based values.

`AUTO_START_PORTAL_MODE` supports:
- `auto`: start the local server when needed, but promote to full `npm run portal` behavior if the hosted route is stale
- `server`: only manage the local portal server
- `runtime`: always start the full portal runtime

`AUTO_START_DISCORD_LISTENER` supports:
- `true`: start the Discord gateway adapter during `chat` when `DISCORD_BOT_TOKEN` is configured
- `false`: do not auto-start the Discord gateway adapter

`PORTAL_PORT` is the preferred local port variable for the portal runtime.

`EXECUTOR_PORT` is still accepted as a legacy alias for compatibility.

## Sample Tools: Discord

The repo ships with sample Discord tools in [tools.example.json](/Users/chris/Dev/cli-chat/tools.example.json):

- `discord`

`discord` expects:
- `message` text only
- uses `DISCORD_WEBHOOK_URL` from the local portal environment

The matching sample portal server lives at [bin/portal/server.js](/Users/chris/Dev/cli-chat/bin/portal/server.js) and exposes:
- `POST /tools/execute`
- `GET /health`

The packaged runtime lives at [bin/portal/runtime.js](/Users/chris/Dev/cli-chat/bin/portal/runtime.js).
There is also a focused portal note in [bin/portal/README.md](/Users/chris/Dev/cli-chat/bin/portal/README.md).

When you run `npm start -- chat`, the CLI starts the local portal server automatically unless `AUTO_START_PORTAL=false`. If Familiar's configured integration route is stale, chat promotes itself to the full portal runtime automatically. If `DISCORD_BOT_TOKEN` is configured, chat also auto-starts the Discord gateway adapter unless `AUTO_START_DISCORD_LISTENER=false`.

If you want a reliable first integration test, prefer `discord`.

If you want Familiar to naturally handle prompts like "send this to Discord", `discord` is the easiest tool for it to choose because it only needs the message text.

Under the hood, Familiar still talks to a tool executor contract. In this repo, the developer-facing product surface for that local runtime is called the portal.

## Discord Setup

The supported Discord delivery path is webhook-backed:

- Tool: `discord`
- Uses: `DISCORD_WEBHOOK_URL`
- Best for: the simplest "send this to Discord" experience

### Setup

If you just want to try the integration quickly, use a Discord channel webhook.

Setup:
1. In Discord, open the target channel settings.
2. Create a webhook for that channel.
3. Copy the full webhook URL.
4. Put it in [`.env`](/Users/chris/Dev/cli-chat/.env) as:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Optional: Mention Listener

If you want Discord messages to enter Familiar without typing them in the terminal, use the optional gateway adapter:

```bash
npm run discord:listen
```

This requires:
1. `DISCORD_BOT_TOKEN` in [`.env`](/Users/chris/Dev/cli-chat/.env)
2. `Message Content Intent` enabled in the Discord developer portal
3. bot permissions such as:
   - `View Channels`
   - `Send Messages`
   - `Read Message History`

What it does:
- listens for DMs and bot mentions in Discord
- forwards normalized text to portal `POST /conversation/input`
- sends Familiar's reply back to Discord
- mirrors both the inbound Discord message and the outbound Familiar reply into the active local CLI channel

Optional env:
- `PORTAL_BASE_URL` defaults to `http://127.0.0.1:8788`
- `DISCORD_REPLY_TO_CHANNEL=true`
- `DISCORD_MIRROR_TO_CLI=true`
- `DISCORD_LISTENER_VERBOSE=false` keeps gateway connection logs out of the chat prompt by default

### End-To-End Familiar Test

For the full hosted Familiar flow:

1. Configure your Discord env vars in [`.env`](/Users/chris/Dev/cli-chat/.env)
2. Start the packaged portal runtime:

```bash
npm run portal
```

That command:
- starts the local portal server
- opens a Cloudflare quick tunnel
- updates Familiar's integration `base_url` automatically

3. In another terminal, start chat:

```bash
npm start -- chat
```

4. Sync tools if you have changed [tools.example.json](/Users/chris/Dev/cli-chat/tools.example.json):

```bash
node ./bin/cli-chat.js sync-tools ./tools.example.json
```

5. Try a natural-language prompt:

```text
send this to discord: hello from familiar
```

### Notes

- Quick Cloudflare tunnels are temporary. If the tunnel restarts, the public URL changes.
- `npm run portal` updates Familiar automatically, so prefer that over starting the server and tunnel manually.
- Discord webhook URLs are secrets. Keep them in [`.env`](/Users/chris/Dev/cli-chat/.env), never commit them, and rotate them if exposed.

## Interactive Commands

Inside `chat` mode:

- `/new [name]` creates and activates a new thread
- `/thread` prints the current thread name when known, otherwise the thread id
- `/clear` clears the active thread
- `/status` prints portal, thread, and Discord listener status
- `/whoami` fetches the current account payload
- `/exit` quits

## How It Works

- Familiar receives normalized text at `POST /api/v1/conversation/input`
- This CLI sends text input plus local channel identity
- Familiar may return a `thread_id`, which is stored locally for continuity
- When a saved local thread id has no saved name, the CLI attempts a best-effort thread metadata lookup to hydrate the display name
- `POST /api/v1/input` is treated as a backwards-compatibility alias
- Replies are rendered as assistant-facing plain text by default

Local state lives in `.cli-chat/session.json`.
