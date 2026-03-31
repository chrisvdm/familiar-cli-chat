# Project Overview

`cli-chat` is a local Node.js command-line client for the Familiar hosted API.

Its job is narrow by design:
- send normalized text input to Familiar
- preserve local conversation continuity
- provide a usable interactive shell for chatting
- expose a few setup and inspection commands around Familiar accounts, threads, and tool sync

It is not intended to replace Familiar itself, and it is not a replacement for Familiar's executor contract.

## Product Shape

At a high level, the project has three layers:

1. CLI interface
- Parses commands such as `chat`, `send`, `whoami`, and `sync-tools`
- Provides a conversational terminal loop in interactive mode

2. Local state and config
- Loads configuration from shell environment, `.env`, and `dev.vars`
- Persists local channel and thread state in [`.cli-chat/session.json`](/Users/chris/Dev/cli-chat/.cli-chat/session.json)
- Persists bootstrapped tokens to [`.env`](/Users/chris/Dev/cli-chat/.env)

3. Familiar API transport
- Makes direct HTTP requests to the Familiar hosted API
- Formats replies for terminal display
- Keeps the request layer thin so the wire contract stays obvious

4. Portal runtime
- Exposes the local tool runtime used during development
- Implements Familiar's executor contract behind the local product name `portal`

## Main User Flows

### First run

- User runs `npm start -- chat`
- If no Familiar token is configured, the CLI creates an account automatically
- The returned token is written to `.env`
- Chat continues without a separate onboarding step

### Normal chat

- User types a message in interactive mode
- The CLI sends `input.kind = "text"` and `input.text` to `/api/v1/input`
- The current local channel id is reused for continuity
- If Familiar returns a `thread_id`, the CLI stores it for later turns
- The terminal prints the assistant-facing content, not the full JSON envelope

### Tool setup

- User syncs tool definitions from a JSON file via `sync-tools`
- Familiar stores those tools for the current token-backed setup
- The local portal can provide a tool runtime for development, but real tool behavior still lives behind Familiar's executor contract

## Current Commands

- `chat`
- `send`
- `init-account`
- `whoami`
- `sync-tools`
- `thread new`
- `thread set`
- `thread clear`

## Important Constraints

- Familiar is a hosted API, so network access is required for real usage.
- This project only supports text input.
- This project does not run tools or business logic itself.
- Token persistence is currently single-profile and local to the repo checkout.

## Why The Code Is Small

The project intentionally uses only built-in Node.js APIs.

That choice keeps:
- installs simple
- the runtime surface area small
- the API contract visible

The cost is that some conveniences, like env parsing and output formatting, are implemented manually inside the CLI.

## Where To Look Next

- Portal overview: [docs/portal.md](/Users/chris/Dev/cli-chat/docs/portal.md)
- Behavioral decisions: [docs/decisions.md](/Users/chris/Dev/cli-chat/docs/decisions.md)
- Implementation history and debugging notes: [docs/worklogs/2026-03-30-initial-cli-and-auth-bootstrap.md](/Users/chris/Dev/cli-chat/docs/worklogs/2026-03-30-initial-cli-and-auth-bootstrap.md)
- Entrypoint and core behavior: [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js)
