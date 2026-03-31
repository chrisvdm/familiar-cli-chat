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
- Automatic account creation if no token is configured
- Local persistence for channel and thread continuity
- Tool syncing from JSON definitions
- Sample Discord tool and local portal
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

By default, `chat` also auto-starts the bundled local portal on `127.0.0.1:8788` if one is not already running.

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

Sync tools from a JSON file:

```bash
node ./bin/cli-chat.js sync-tools ./tools.example.json
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
EXECUTOR_PORT
DISCORD_WEBHOOK_URL
CLOUDFLARED_BIN
```

Config sources are loaded in this order:
1. real shell environment
2. `.env`
3. `dev.vars`

Already-set shell variables win over file-based values.

## Sample Tools: Discord

The repo ships with sample Discord tools in [tools.example.json](/Users/chris/Dev/cli-chat/tools.example.json):

- `send_discord_message`

`send_discord_message` expects:
- `message` text only
- uses `DISCORD_WEBHOOK_URL` from the local portal environment

The matching sample portal server lives at [bin/portal.js](/Users/chris/Dev/cli-chat/bin/portal.js) and exposes:
- `POST /tools/execute`
- `GET /health`

The packaged runtime lives at [bin/portal-runtime.js](/Users/chris/Dev/cli-chat/bin/portal-runtime.js).

When you run `npm start -- chat`, the CLI starts the local portal server automatically unless `AUTO_START_PORTAL=false`.

If you want a reliable first integration test, prefer `send_discord_message`.

If you want Familiar to naturally handle prompts like "send this to Discord", `send_discord_message` is the easiest tool for it to choose because it only needs the message text.

Under the hood, Familiar still talks to a tool executor contract. In this repo, the developer-facing product surface for that local runtime is called the portal.

## Discord Setup

The supported Discord delivery path is webhook-backed:

- Tool: `send_discord_message`
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
- `/thread` prints the current thread id
- `/clear` clears the active thread
- `/whoami` fetches the current account payload
- `/exit` quits

## How It Works

- Familiar receives normalized text at `POST /api/v1/input`
- This CLI sends text input plus local channel identity
- Familiar may return a `thread_id`, which is stored locally for continuity
- Replies are rendered as assistant-facing plain text by default

Local state lives in `.cli-chat/session.json`.
