# cli-chat

`cli-chat` is a local Node.js terminal client for the [Familiar](https://familiar.chrsvdmrw.workers.dev/docs/) hosted API.

It gives you a simple command-line chat interface that:
- talks directly to Familiar over HTTP
- keeps local conversation continuity
- bootstraps a Familiar account automatically on first run
- exposes basic account, thread, and tool-sync commands

## Why This Exists

Familiar is a hosted API, not a local SDK. This project provides the missing local interface layer: a small terminal app that makes Familiar usable from a developer shell without building a full web UI first.

The scope is intentionally narrow. `cli-chat` is:
- a chat client
- a setup helper
- a thin API wrapper

It is not:
- a local LLM runtime
- a Familiar executor
- a background job system

## Features

- Interactive terminal chat with `npm start -- chat`
- One-shot message sending with `send`
- Automatic account creation if no token is configured
- Local persistence for channel and thread continuity
- Tool syncing from JSON definitions
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
```

Config sources are loaded in this order:
1. real shell environment
2. `.env`
3. `dev.vars`

Already-set shell variables win over file-based values.

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

## Project Docs

- Project overview: [docs/project-overview.md](/Users/chris/Dev/cli-chat/docs/project-overview.md)
- Architecture decisions: [docs/decisions.md](/Users/chris/Dev/cli-chat/docs/decisions.md)
- Worklogs and debugging history: [docs/worklogs/2026-03-30-initial-cli-and-auth-bootstrap.md](/Users/chris/Dev/cli-chat/docs/worklogs/2026-03-30-initial-cli-and-auth-bootstrap.md)
