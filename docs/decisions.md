# Decisions

This file records durable implementation decisions for `cli-chat`, why they were made, and what to watch for when changing them.

## 2026-03-30: Keep the client dependency-free

Decision:
- Use only built-in Node.js APIs for the CLI.

Why:
- The project started as a small local interface for a hosted API.
- Node 22 already provides `fetch`, `readline`, and filesystem APIs.
- Fewer dependencies reduce install friction and lower the chance of environment-specific bugs.

Implications:
- There is no external argument parser, dotenv loader, or UI toolkit.
- Small helpers in [bin/cli-chat.js](/Users/chris/Dev/cli-chat/bin/cli-chat.js) replace those libraries.

Tradeoff:
- More small utility code lives in the entrypoint.
- If the CLI grows substantially, splitting into modules or adding a minimal dependency may become justified.

## 2026-03-30: Favor Familiar's hosted API directly

Decision:
- Treat Familiar as a remote service, not a local SDK.

Why:
- The Familiar docs define the product around HTTP endpoints such as `/api/v1/input`, `/api/v1/tools/sync`, `/api/v1/account`, and `/api/v1/accounts`.
- Building against the actual HTTP contract avoids inventing a client model that may not match the service.

Implications:
- The CLI centers on `fetch` wrappers and raw request payloads.
- The interface is thin and intentionally does not hide the underlying API much.

Tradeoff:
- Response formatting needs to tolerate shape changes and richer payload envelopes.

## 2026-03-30: Persist local session state in `.cli-chat/session.json`

Decision:
- Store local channel and active thread state in a repo-local hidden directory.

Why:
- Familiar uses `channel.type`, `channel.id`, and optional `thread_id` for continuity.
- Persisting these values locally gives repeatable chat sessions without forcing the user to copy thread ids manually.

Implications:
- The same local checkout continues the same channel unless the user overrides it.
- [`.cli-chat/session.json`](/Users/chris/Dev/cli-chat/.cli-chat/session.json) is intentionally ignored by git.

Tradeoff:
- Repo-local state can surprise users if they expect every run to be stateless.
- `/clear` and `thread clear` exist to reset thread continuity quickly.

## 2026-03-30: Auto-load `.env` and `dev.vars`

Decision:
- Load `.env` first and `dev.vars` second before reading config from `process.env`.

Why:
- The first implementation only read exported shell variables.
- That caused `npm start -- chat` to fail with `Missing FAMILIAR_API_TOKEN.` even though a local `.env` existed.
- Supporting both files fits local Node usage and worker-oriented development habits.

Implications:
- Manual `source .env` is no longer required for normal usage.
- Existing real environment variables still win and are not overwritten by files.

Tradeoff:
- The loader is intentionally minimal and does not implement the full dotenv grammar.
- If config parsing needs become more complex, revisit this helper instead of layering ad hoc parsing logic.

## 2026-03-30: Bootstrap auth during `chat` startup

Decision:
- If `chat` starts without a Familiar token, create a new account automatically and persist the returned token to `.env`.

Why:
- The main happy path is "run chat and start talking".
- The Familiar docs exposed account creation but not a separate login flow.
- Requiring a manual pre-step made first-run onboarding brittle and easy to forget.

Implications:
- `chat` can self-heal a missing-token state.
- `init-account` still exists for explicit setup and inspection.
- `.env` becomes the canonical local persistence point for the token.

Tradeoff:
- First run now performs a network write if no token exists.
- If multi-account support is needed later, this single-token bootstrap behavior may need to move into profiles or explicit account commands.

## 2026-03-30: Prefer `response.content` for chat output

Decision:
- When formatting Familiar replies, print `response.content` first if present.

Why:
- Familiar responses may contain a structured envelope with metadata, request ids, model info, and execution status.
- Dumping the full JSON in interactive chat was noisy and made the UI feel broken even when the API response was correct.

Implications:
- Chat mode behaves like a normal assistant interface.
- The raw envelope is still accessible through other commands if needed.

Tradeoff:
- If debugging response structure, the formatter can hide useful metadata.
- If richer debug output is needed, add an explicit verbose mode rather than regressing the default UX.
